/**
 * Transcribe a single track with OpenAI `whisper-1`, the only OpenAI model that
 * returns segment timestamps via `verbose_json` +
 * `timestamp_granularities: ["segment"]`.
 *
 * The OpenAI client is created LAZILY (not at module load) so the `.env`
 * override in `env.ts` is already in effect when the key is read. The pure
 * `segmentsFromVerboseJson` mapper is exported separately so the segment logic
 * can be unit-tested with a fixture — no network, no API key.
 *
 * ---
 *
 * Transcreve uma trilha com `whisper-1` (`verbose_json`, granularidade de
 * segmento). O cliente OpenAI é criado de forma PREGUIÇOSA. O mapeador puro
 * `segmentsFromVerboseJson` é exportado para testes sem rede.
 */
import fs from "node:fs";
import OpenAI from "openai";
import { chunkAudio } from "./chunk.js";
import type { Semaphore } from "./semaphore.js";
import type { ExtractedTrack, Segment } from "./types.js";

/** Drop segments at/above this no-speech probability (silence hallucinations). */
const NO_SPEECH_THRESHOLD = 0.6;

/** Minimal shape of one segment in a `verbose_json` response. */
export interface WhisperVerboseSegment {
  start: number;
  end: number;
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
}

/** Minimal shape of a whole `verbose_json` response (SDK type omits `segments`). */
export interface WhisperVerboseResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: WhisperVerboseSegment[];
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (client === null) client = new OpenAI();
  return client;
}

/** Pure mapper: verbose_json → tagged `Segment[]`, dropping no-speech/empty. */
export function segmentsFromVerboseJson(
  res: WhisperVerboseResponse,
  track: number,
  label: string,
): Segment[] {
  const out: Segment[] = [];
  for (const seg of res.segments ?? []) {
    const text = seg.text.trim();
    if (!text) continue;
    if ((seg.no_speech_prob ?? 0) >= NO_SPEECH_THRESHOLD) continue;
    out.push({ speaker: label, track, start: seg.start, end: seg.end, text });
  }
  return out;
}

async function transcribeFile(file: string): Promise<WhisperVerboseResponse> {
  const res = await getClient().audio.transcriptions.create({
    file: fs.createReadStream(file),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });
  // The SDK's static verbose type does not always expose `segments`; the
  // runtime payload does. Isolate the cast here at the SDK boundary.
  return res as unknown as WhisperVerboseResponse;
}

/**
 * Transcribe an extracted track. Splits oversized files into chunks, runs each
 * Whisper request through the shared `api` semaphore (concurrency bound), and
 * re-absolutizes chunk-local timestamps before returning.
 */
export async function transcribeTrack(
  track: ExtractedTrack,
  label: string,
  tmpDir: string,
  api: Semaphore,
): Promise<Segment[]> {
  const chunks = await chunkAudio(track.file, tmpDir);

  const perChunk = await Promise.all(
    chunks.map((chunk) =>
      api.run(() => transcribeFile(chunk.file)).then((res) =>
        segmentsFromVerboseJson(res, track.trackId, label).map((s) => ({
          ...s,
          start: s.start + chunk.startOffset,
          end: s.end + chunk.startOffset,
        })),
      ),
    ),
  );

  return perChunk.flat();
}
