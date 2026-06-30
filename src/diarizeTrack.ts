/**
 * Diarize the multi-speaker (system) track with the local WhisperX CLI.
 *
 * WhisperX can transcribe but SILENTLY skip diarization (missing/invalid
 * HF_TOKEN, unaccepted gated pyannote terms, or a model mismatch) and still
 * exit 0 with empty speaker labels. `assessDiarization` detects that so the
 * caller can warn and degrade instead of trusting broken output. The pure
 * `mapWhisperxJson` mapper is exported for fixture-based unit tests.
 *
 * ---
 *
 * Diariza a trilha multi-locutor (sistema) com o CLI local do WhisperX. O
 * WhisperX pode pular a diarização SILENCIOSAMENTE (token/termos do pyannote) e
 * ainda sair com 0; `assessDiarization` detecta isso. O mapeador puro
 * `mapWhisperxJson` é exportado para testes com fixture.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { run } from "./exec.js";
import type { DiarizedSegment, Word } from "./types.js";

interface WhisperxSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words?: Word[];
}

export interface WhisperxOutput {
  segments?: WhisperxSegment[];
  word_segments?: Word[];
  language?: string;
}

/** Pure mapper: WhisperX JSON → `DiarizedSegment[]` tagged `system/SPEAKER_xx`. */
export function mapWhisperxJson(
  json: WhisperxOutput,
  trackId: number,
): DiarizedSegment[] {
  return (json.segments ?? []).map((seg) => ({
    speaker: `system/${seg.speaker ?? "UNKNOWN"}`,
    track: trackId,
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
    words: seg.words,
  }));
}

export interface DiarizationAssessment {
  ok: boolean;
  reason?: string;
}

/**
 * Heuristically decide whether diarization actually ran. Looks for gated-access
 * errors in stderr and for the all-`UNKNOWN` symptom of a silent skip.
 */
export function assessDiarization(
  segs: DiarizedSegment[],
  stderr: string,
): DiarizationAssessment {
  const gated =
    /\b(401|403)\b|gated|accept .*(user conditions|license|terms)|pyannote.*(auth|token)/i.test(
      stderr,
    );
  if (gated) {
    return {
      ok: false,
      reason:
        "Hugging Face gated-model access error in WhisperX output — accept the pyannote model terms and verify HF_TOKEN.",
    };
  }
  const labels = segs.map((s) => s.speaker.replace(/^system\//, ""));
  const haveSpeaker = labels.some((l) => l && l !== "UNKNOWN");
  if (segs.length > 0 && !haveSpeaker) {
    return {
      ok: false,
      reason:
        "All segments returned UNKNOWN — diarization likely did not run (check HF_TOKEN and that the gated pyannote terms accepted match your installed WhisperX version).",
    };
  }
  return { ok: true };
}

export interface DiarizeOptions {
  model?: string;
  minSpeakers?: number;
  maxSpeakers?: number;
}

export interface DiarizeResult {
  segments: DiarizedSegment[];
  assessment: DiarizationAssessment;
}

/**
 * Run WhisperX on `wavFile`, read the emitted `<base>.json`, map it, and assess
 * whether diarization actually produced speaker labels.
 */
export async function diarizeWithWhisperX(
  wavFile: string,
  trackId: number,
  outDir: string,
  hfToken: string,
  opts: DiarizeOptions = {},
): Promise<DiarizeResult> {
  const args = [
    wavFile,
    "--model",
    opts.model ?? "large-v3",
    "--diarize",
    "--hf_token",
    hfToken,
    "--output_format",
    "json",
    "--output_dir",
    outDir,
  ];
  if (opts.minSpeakers !== undefined) {
    args.push("--min_speakers", String(opts.minSpeakers));
  }
  if (opts.maxSpeakers !== undefined) {
    args.push("--max_speakers", String(opts.maxSpeakers));
  }

  const { stderr } = await run("whisperx", args);

  const base = path.basename(wavFile, path.extname(wavFile));
  const jsonPath = path.join(outDir, `${base}.json`);
  const raw = await fs.readFile(jsonPath, "utf8");
  const json = JSON.parse(raw) as WhisperxOutput;

  const segments = mapWhisperxJson(json, trackId);
  const assessment = assessDiarization(segments, stderr);
  return { segments, assessment };
}
