/**
 * Extract every audio track to its own 16 kHz mono file in a single ffmpeg
 * pass. Whisper resamples to 16 kHz mono internally, so we target that
 * directly. We ALWAYS re-encode (never `-c:a copy`) because MKV tracks are
 * commonly AAC/AC3/Opus/FLAC/DTS that don't stream-copy into a wav/mp3
 * container.
 *
 * ---
 *
 * Extrai cada trilha de áudio para um arquivo 16 kHz mono numa única passada do
 * ffmpeg. SEMPRE re-codifica (nunca `-c:a copy`).
 */
import path from "node:path";
import { run } from "./exec.js";
import type { AudioTrack, ExtractedTrack } from "./types.js";

export type ExtractFormat = "wav" | "mp3";

export async function extractAllTracks(
  input: string,
  tracks: AudioTrack[],
  outDir: string,
  format: ExtractFormat = "wav",
): Promise<ExtractedTrack[]> {
  if (tracks.length === 0) return [];

  const args: string[] = ["-hide_banner", "-y", "-i", input];
  const outputs: ExtractedTrack[] = [];

  for (const track of tracks) {
    const file = path.join(outDir, `track_${track.audioIndex}.${format}`);
    args.push("-map", `0:a:${track.audioIndex}`, "-ac", "1", "-ar", "16000");
    if (format === "wav") {
      args.push("-c:a", "pcm_s16le");
    } else {
      args.push("-c:a", "libmp3lame", "-b:a", "64k");
    }
    args.push(file);
    outputs.push({ trackId: track.audioIndex, file, source: track });
  }

  await run("ffmpeg", args);
  return outputs;
}
