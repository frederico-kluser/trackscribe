/**
 * Split an extracted track that exceeds Whisper's request size cap into
 * silence-aware chunks, returning each chunk's start offset so segment
 * timestamps can be made absolute again before merging.
 *
 * 16 kHz mono PCM ≈ 32 kB/s, so ~24 MB ≈ 13 min; MP3 64k ≈ 8 kB/s ≈ 52 min.
 * We use 24 MB (not 25) to leave multipart-headers headroom.
 *
 * ---
 *
 * Divide uma trilha extraída que excede o limite de tamanho da requisição do
 * Whisper em chunks que preferem cortar no silêncio, devolvendo o offset de
 * início de cada chunk para reabsolutizar os timestamps antes do merge.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { run } from "./exec.js";
import { detectSilence, type SilenceInterval } from "./silence.js";

const SAFE_BYTES = 24 * 1024 * 1024;
const MIN_CHUNK_SEC = 30;
const GUARD_SEC = 5;

export interface AudioChunk {
  file: string;
  /** Seconds to add back to each segment's start/end. */
  startOffset: number;
}

/** Read media duration (seconds) via ffprobe `-show_format`. */
export async function probeDurationSec(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    file,
  ]);
  const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
  const d = parsed.format?.duration
    ? Number.parseFloat(parsed.format.duration)
    : 0;
  return Number.isFinite(d) ? d : 0;
}

/**
 * Plan cut points `[0, c1, ..., duration]`. Each desired cut is `prev +
 * targetSec`; we snap to the nearest silence midpoint within a window so we cut
 * inside silence, falling back to a hard cut when no silence is nearby.
 */
export function planCuts(
  durationSec: number,
  targetSec: number,
  silences: SilenceInterval[],
): number[] {
  const cuts: number[] = [0];
  let current = 0;

  const candidates = silences
    .map((s) => (s.start + s.end) / 2)
    .filter((m) => m > 0 && m < durationSec)
    .sort((a, b) => a - b);

  while (durationSec - current > targetSec) {
    const desired = current + targetSec;
    let best: number | null = null;
    for (const c of candidates) {
      if (c <= current + MIN_CHUNK_SEC) continue;
      if (c > desired + GUARD_SEC) break;
      best = c; // latest candidate not far past `desired`
    }
    const cut = best ?? desired;
    cuts.push(cut);
    current = cut;
  }

  cuts.push(durationSec);
  return cuts;
}

/**
 * Return chunks for `file`. If it already fits under the cap (or duration is
 * unknown), returns a single chunk pointing at the original file with offset 0.
 */
export async function chunkAudio(
  file: string,
  outDir: string,
): Promise<AudioChunk[]> {
  const stat = await fs.stat(file);
  const durationSec = await probeDurationSec(file);

  if (stat.size <= SAFE_BYTES || durationSec <= 0) {
    return [{ file, startOffset: 0 }];
  }

  const bytesPerSec = stat.size / durationSec;
  const targetSec = Math.max(
    MIN_CHUNK_SEC,
    Math.floor(SAFE_BYTES / bytesPerSec) - GUARD_SEC,
  );

  const silences = await detectSilence(file);
  const cuts = planCuts(durationSec, targetSec, silences);

  const base = path.basename(file, path.extname(file));
  const chunks: AudioChunk[] = [];

  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i]!;
    const end = cuts[i + 1]!;
    const len = end - start;
    const chunkFile = path.join(outDir, `${base}_chunk_${i}.wav`);
    // Re-encode the slice so boundaries are exact and 16 kHz mono is guaranteed.
    await run("ffmpeg", [
      "-hide_banner",
      "-y",
      "-ss",
      start.toFixed(3),
      "-i",
      file,
      "-t",
      len.toFixed(3),
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      chunkFile,
    ]);
    chunks.push({ file: chunkFile, startOffset: start });
  }

  return chunks;
}
