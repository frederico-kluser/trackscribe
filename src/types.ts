/**
 * Shared type contracts for the whole pipeline.
 *
 * The single `Segment` shape is what every transcription/diarization source
 * returns, which is what lets `pipeline.ts` merge heterogeneous sources without
 * an unsafe cast: a `DiarizedSegment[]` is structurally assignable to a
 * `Segment[]`.
 *
 * ---
 *
 * Contratos de tipos compartilhados por todo o pipeline. O formato único
 * `Segment` é o que toda fonte de transcrição/diarização retorna, permitindo
 * que `pipeline.ts` faça o merge de fontes heterogêneas sem cast inseguro.
 */

/** One audio stream discovered inside the MKV container. */
export interface AudioTrack {
  /** Audio-relative index used for the ffmpeg `-map 0:a:N` specifier. */
  audioIndex: number;
  /** Absolute stream index reported by ffprobe (`index`). */
  absoluteIndex: number;
  /** Codec name, e.g. `aac`, `ac3`, `opus`, `flac`, `pcm_s16le`. */
  codec: string;
  /** Channel count (0 if unknown). */
  channels: number;
  /** Channel layout, e.g. `mono`, `stereo`, `5.1`. */
  channelLayout?: string;
  /** `language` tag if present. */
  language?: string;
  /** `title` tag if present (OBS labels tracks here). */
  title?: string;
  /** Whether the container marks this track as the default. */
  isDefault: boolean;
}

/** A single timestamped, speaker-attributed transcript entry. */
export interface Segment {
  /** Friendly speaker label, e.g. `Host (microphone)` or `t1/SPEAKER_00`. */
  speaker: string;
  /** Numeric track id this segment came from (the audio-relative index). */
  track: number;
  /** Start time in seconds (absolute on the shared recording timeline). */
  start: number;
  /** End time in seconds. */
  end: number;
  /** Transcribed text, trimmed. */
  text: string;
}

/** Alias kept for readability at call sites that tag per-track segments. */
export type TaggedSegment = Segment;

/** Word-level timing entry (optional per-segment detail). */
export interface Word {
  word: string;
  start?: number;
  end?: number;
  score?: number;
  speaker?: string;
}

/** A `Segment` enriched with optional word-level diarization detail. */
export interface DiarizedSegment extends Segment {
  words?: Word[];
}

/** Result of extracting one audio track to a Whisper-friendly file. */
export interface ExtractedTrack {
  /** Numeric track id (mirrors `AudioTrack.audioIndex`). */
  trackId: number;
  /** Path of the extracted 16 kHz mono file. */
  file: string;
  /** The source track metadata. */
  source: AudioTrack;
}

/** Consecutive same-speaker segments collapsed into a single turn. */
export interface Turn {
  speaker: string;
  track: number;
  start: number;
  end: number;
  text: string;
}
