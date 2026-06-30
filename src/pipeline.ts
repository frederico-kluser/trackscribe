/**
 * Orchestrate probe → extract → transcribe/diarize → merge.
 *
 * Concurrency model: all per-track jobs start eagerly. Whisper API calls are
 * bounded by a shared `api` semaphore (also guards 429s); cloud diarization jobs
 * are bounded by a `diar` semaphore (respecting pyannoteAI's ~80-100 req/min
 * limits). There is no local GPU anymore — diarization is a REST call.
 *
 * Temp files live in an `fs.mkdtemp` dir that is always removed in `finally`.
 *
 * ---
 *
 * Orquestra probe → extract → transcribe/diarize → merge, com semáforo `api`
 * (limita o Whisper) e semáforo `diar` (limita os jobs de diarização na nuvem da
 * pyannoteAI). Não há mais GPU local. Limpa os temporários sempre no `finally`.
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { probeAudioTracks } from "./probe.js";
import { extractAllTracks, type ExtractFormat } from "./extract.js";
import { transcribeTrack } from "./transcribe.js";
import { diarizeTrackCloud } from "./diarizeTrack.js";
import { PyannoteClient } from "./pyannote.js";
import { mergeTranscripts } from "./merge.js";
import { Semaphore } from "./semaphore.js";
import { isNearSilent } from "./silence.js";
import { probeDurationSec } from "./chunk.js";
import { debug } from "./debug.js";
import type { ExtractedTrack, Segment } from "./types.js";

export interface PipelineOptions {
  /** Diarize the system track in the cloud via pyannoteAI (requires `pyannoteApiKey`). */
  diarize?: boolean;
  /** Track id treated as the multi-speaker system mix (default 1). */
  systemTrack?: number;
  /** Extraction format (default `wav`). */
  format?: ExtractFormat;
  /** pyannoteAI API key for cloud diarization (`precision-2`). Replaces the old hfToken. */
  pyannoteApiKey?: string;
  /** Optional override of the pyannoteAI base URL. */
  pyannoteBaseUrl?: string;
  minSpeakers?: number;
  maxSpeakers?: number;
  /** Max concurrent Whisper API requests (default 4). */
  apiConcurrency?: number;
  /** Max concurrent pyannoteAI jobs (default 2; respect ~80-100 req/min limits). */
  diarizeConcurrency?: number;
  /** Optional explicit per-track labels, keyed by track id. */
  labels?: Record<number, string>;
}

export interface PipelineResult {
  segments: Segment[];
  trackCount: number;
}

function labelFor(
  trackId: number,
  systemTrack: number,
  opts: PipelineOptions,
): string {
  const explicit = opts.labels?.[trackId];
  if (explicit) return explicit;
  if (trackId === 0) return "Host (microphone)";
  if (trackId === systemTrack) return "Call (system)";
  return `Track ${trackId}`;
}

export async function runPipeline(
  input: string,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const systemTrack = opts.systemTrack ?? 1;
  const format = opts.format ?? "wav";
  const api = new Semaphore(opts.apiConcurrency ?? 4);
  // Bound concurrent cloud diarization jobs instead of serializing a local GPU.
  const diar = new Semaphore(opts.diarizeConcurrency ?? 2);

  const client =
    opts.diarize && opts.pyannoteApiKey
      ? new PyannoteClient(opts.pyannoteApiKey, opts.pyannoteBaseUrl)
      : null;

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "trackscribe-"));
  try {
    const tracks = await probeAudioTracks(input);
    if (tracks.length === 0) {
      throw new Error(`No audio tracks found in "${input}".`);
    }

    const extracted = await extractAllTracks(input, tracks, tmp, format);
    debug(
      `probed ${tracks.length} audio track(s); diarize=${!!opts.diarize && client !== null}` +
        ` (when on, EVERY non-silent track is diarized)`,
    );

    const jobs = extracted.map((t) =>
      transcribeOrDiarize(t, { systemTrack, opts, tmp, api, diar, client }),
    );

    const perTrack = await Promise.all(jobs);
    return {
      segments: mergeTranscripts(perTrack),
      trackCount: tracks.length,
    };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

interface JobContext {
  systemTrack: number;
  opts: PipelineOptions;
  tmp: string;
  api: Semaphore;
  diar: Semaphore;
  client: PyannoteClient | null;
}

async function transcribeOrDiarize(
  track: ExtractedTrack,
  ctx: JobContext,
): Promise<Segment[]> {
  const { systemTrack, opts, tmp, api, diar, client } = ctx;
  const label = labelFor(track.trackId, systemTrack, opts);

  // Skip tracks that are (near) entirely silent — Whisper only hallucinates.
  const duration = await probeDurationSec(track.file);
  if (await isNearSilent(track.file, duration)) {
    debug(`track ${track.trackId} (${label}): near-silent — skipped`);
    return [];
  }

  // Diarize EVERY track when a cloud client is configured — each track is checked
  // for multiple speakers, not just the system mix.
  if (!opts.diarize || client === null) {
    debug(`track ${track.trackId} (${label}): transcribe-only (no diarization)`);
    return transcribeTrack(track, label, tmp, api);
  }

  // Bound concurrent cloud diarization jobs. `diarizeTrackCloud` already ran
  // whisper-1, so a failed assessment costs no second transcription — we just
  // relabel the existing transcript to the track's friendly label.
  const { segments, assessment } = await diar.run(() =>
    diarizeTrackCloud(track, label, tmp, api, client, {
      minSpeakers: opts.minSpeakers,
      maxSpeakers: opts.maxSpeakers,
    }),
  );

  if (!assessment.ok) {
    console.warn(
      `[trackscribe] diarization warning (track ${track.trackId}): ${assessment.reason}`,
    );
    console.warn(
      `[trackscribe] keeping the whisper-1 transcript for track ${track.trackId} as a single "${label}" speaker.`,
    );
    return segments.map((s) => ({ ...s, speaker: label }));
  }

  debug(
    `track ${track.trackId} (${label}): diarized into ${assessment.speakerCount} speaker(s)`,
  );
  return segments;
}
