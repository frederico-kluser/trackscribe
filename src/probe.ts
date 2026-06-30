/**
 * Discover the audio tracks inside an MKV (or any container) via ffprobe.
 *
 * Critical distinction: `absoluteIndex` is the stream's position in the
 * container (`0:0` video, `0:1` audio, ...), while `audioIndex` is the
 * audio-relative position used by ffmpeg's `-map 0:a:N`. Both are zero-based.
 *
 * ---
 *
 * Descobre as trilhas de áudio de um MKV via ffprobe. `absoluteIndex` é a
 * posição do stream no contêiner; `audioIndex` é a posição relativa ao áudio
 * usada por `-map 0:a:N`. Ambos começam em zero.
 */
import { run } from "./exec.js";
import type { AudioTrack } from "./types.js";

interface FfprobeStream {
  index: number;
  codec_type: string;
  codec_name: string;
  channels?: number;
  channel_layout?: string;
  disposition?: Record<string, number>;
  tags?: Record<string, string>;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
}

export async function probeAudioTracks(input: string): Promise<AudioTrack[]> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    input,
  ]);

  const parsed = JSON.parse(stdout) as FfprobeOutput;
  const audioStreams = (parsed.streams ?? []).filter(
    (s) => s.codec_type === "audio",
  );

  return audioStreams.map((s, audioIndex) => ({
    audioIndex,
    absoluteIndex: s.index,
    codec: s.codec_name,
    channels: s.channels ?? 0,
    channelLayout: s.channel_layout,
    language: s.tags?.language ?? s.tags?.LANGUAGE,
    title: s.tags?.title ?? s.tags?.TITLE,
    isDefault: s.disposition?.default === 1,
  }));
}
