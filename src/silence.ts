/**
 * ffmpeg `silencedetect` helpers, shared by (a) the near-silent-track guard
 * (skip tracks Whisper would only hallucinate on) and (b) the chunker, which
 * prefers to cut inside silence rather than mid-word.
 *
 * ---
 *
 * Auxiliares de `silencedetect` do ffmpeg, usados pelo guard de trilha quase
 * silenciosa e pelo chunker (que prefere cortar dentro do silêncio).
 */
import { run } from "./exec.js";

export interface SilenceInterval {
  start: number;
  end: number;
}

const START_RE = /silence_start:\s*(-?\d+(?:\.\d+)?)/;
const END_RE = /silence_end:\s*(-?\d+(?:\.\d+)?)/;

/** Parse ffmpeg's stderr `silencedetect` output into [start,end] intervals. */
export function parseSilenceLog(stderr: string): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  let pendingStart: number | null = null;

  for (const line of stderr.split("\n")) {
    const sm = START_RE.exec(line);
    if (sm) {
      pendingStart = Number.parseFloat(sm[1]!);
      continue;
    }
    const em = END_RE.exec(line);
    if (em && pendingStart !== null) {
      intervals.push({ start: pendingStart, end: Number.parseFloat(em[1]!) });
      pendingStart = null;
    }
  }
  return intervals;
}

/** Run a silencedetect pass over `file` and return the detected intervals. */
export async function detectSilence(
  file: string,
  noiseDb = -30,
  minDurationSec = 0.5,
): Promise<SilenceInterval[]> {
  // silencedetect prints to stderr; decode to the null muxer (no output file).
  const { stderr } = await run("ffmpeg", [
    "-hide_banner",
    "-i",
    file,
    "-af",
    `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
    "-f",
    "null",
    "-",
  ]);
  return parseSilenceLog(stderr);
}

/** True when ≥98% of `durationSec` is silence (skip-the-track guard). */
export async function isNearSilent(
  file: string,
  durationSec: number,
): Promise<boolean> {
  if (durationSec <= 0) return false;
  const intervals = await detectSilence(file);
  const silentTotal = intervals.reduce((acc, i) => acc + (i.end - i.start), 0);
  return silentTotal >= durationSec * 0.98;
}
