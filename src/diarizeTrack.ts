/**
 * Diarize a single audio track in the CLOUD via pyannoteAI, then overlay the
 * speaker turns onto the whisper-1 transcript of that same track. Runs per track
 * (every track is checked for multiple speakers), tagging `t{trackId}/SPEAKER_xx`.
 *
 * This replaces the previous local WhisperX CLI path: there is NO local GPU and
 * NO gated Hugging Face model anymore. Diarization is a REST call to pyannoteAI's
 * `precision-2` model (turns only); transcription stays on whisper-1.
 *
 * Degradation contract: whisper-1 runs first (a transcription failure is fatal,
 * exactly like any other track). The cloud diarization + alignment is wrapped so
 * that ANY cloud/network failure returns `assessment.ok = false` WITH the whisper
 * transcript intact — the caller relabels it to a single speaker. We therefore
 * never transcribe twice, and `unified.json` is always produced.
 *
 * ---
 *
 * Diariza UMA trilha de áudio na NUVEM via pyannoteAI e sobrepõe os turnos de
 * locutor à transcrição do whisper-1 dessa mesma trilha. Roda por trilha (toda
 * trilha é checada por múltiplos falantes), rotulando `t{trackId}/SPEAKER_xx`.
 * Em qualquer falha de nuvem/rede, retorna `ok:false` mantendo a transcrição do
 * whisper-1 — nunca transcreve duas vezes e o `unified.json` sempre sai.
 */
import { transcribeTrack } from "./transcribe.js";
import { debug } from "./debug.js";
import {
  alignSegmentsToTurns,
  assessAlignedDiarization,
  type DiarizationAssessment,
} from "./align.js";
import type { DiarizeParams, PyannoteClient } from "./pyannote.js";
import type { Semaphore } from "./semaphore.js";
import type { DiarizedSegment, ExtractedTrack } from "./types.js";

export interface DiarizeOptions {
  minSpeakers?: number;
  maxSpeakers?: number;
  model?: string;
}

export interface DiarizeResult {
  segments: DiarizedSegment[];
  assessment: DiarizationAssessment;
}

/**
 * Transcribe `track` with whisper-1, diarize the same audio with pyannoteAI,
 * align by maximal overlap, and assess. `label` is the single-speaker label used
 * for the whisper transcript (and by the caller's degraded path).
 */
export async function diarizeTrackCloud(
  track: ExtractedTrack,
  label: string,
  tmpDir: string,
  api: Semaphore,
  client: PyannoteClient,
  opts: DiarizeOptions = {},
): Promise<DiarizeResult> {
  // 1) whisper-1 transcript of the system track (bounded by the `api` semaphore,
  //    handles oversized-file chunking + timestamp re-absolutization as today).
  const transcript = await transcribeTrack(track, label, tmpDir, api);

  // 2) cloud diarization + overlap alignment; degrade gracefully on any failure.
  try {
    const objectKey = `trackscribe-track${track.trackId}-${Date.now()}`;
    debug(`track ${track.trackId}: starting cloud diarization (${track.file})`);
    const params: DiarizeParams = {
      model: opts.model ?? "precision-2",
      exclusive: true,
      confidence: true,
      minSpeakers: opts.minSpeakers,
      maxSpeakers: opts.maxSpeakers,
    };
    const job = await client.diarizeLocalFile(track.file, objectKey, params);

    if (job.status !== "succeeded" || !job.output) {
      return {
        segments: transcript,
        assessment: {
          ok: false,
          reason: `pyannoteAI job ${job.status}${
            job.output?.error ? `: ${job.output.error}` : ""
          }.`,
          speakerCount: 0,
        },
      };
    }
    if (job.output.warning) {
      console.warn(
        `[trackscribe] pyannoteAI warning (track ${track.trackId}): ${job.output.warning}`,
      );
    }

    // exclusiveDiarization is preferred (one speaker per instant); fall back to diarization.
    const turns =
      job.output.exclusiveDiarization ?? job.output.diarization ?? [];

    // 3) align turns onto whisper segments by max overlap.
    const diarized = alignSegmentsToTurns(transcript, turns, track.trackId);

    // 4) assess: a single speaker is valid; only empty/low-coverage is rejected.
    const assessment = assessAlignedDiarization(diarized, turns);

    debug(
      `track ${track.trackId}: ${transcript.length} segments, ${turns.length} turns, ` +
        `${assessment.speakerCount} speaker(s), ok=${assessment.ok}` +
        (assessment.reason ? ` (${assessment.reason})` : ""),
    );

    return { segments: diarized, assessment };
  } catch (err) {
    return {
      segments: transcript,
      assessment: {
        ok: false,
        reason: `pyannoteAI diarization failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        speakerCount: 0,
      },
    };
  }
}
