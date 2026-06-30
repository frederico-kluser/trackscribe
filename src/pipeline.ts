/**
 * Orchestrate probe → extract → transcribe/diarize → merge.
 *
 * Concurrency model: all per-track jobs start eagerly. Whisper API calls are
 * bounded by a shared `api` semaphore (also guards 429s); WhisperX/GPU work is
 * serialized by a `gpu` semaphore of size 1. The two never deadlock because the
 * `api` permit is only held around the leaf HTTP call, never around a whole
 * track job.
 *
 * Temp files live in an `fs.mkdtemp` dir that is always removed in `finally`.
 *
 * ---
 *
 * Orquestra probe → extract → transcribe/diarize → merge, com semáforo `api`
 * (limita Whisper) e semáforo `gpu` (serializa WhisperX). Limpa os temporários
 * sempre no `finally`.
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { probeAudioTracks } from "./probe.js";
import { extractAllTracks, type ExtractFormat } from "./extract.js";
import { transcribeTrack } from "./transcribe.js";
import { diarizeWithWhisperX } from "./diarizeTrack.js";
import { mergeTranscripts } from "./merge.js";
import { Semaphore } from "./semaphore.js";
import { isNearSilent } from "./silence.js";
import { probeDurationSec } from "./chunk.js";
import { BinaryNotFoundError } from "./exec.js";
import type { ExtractedTrack, Segment } from "./types.js";

export interface PipelineOptions {
  /** Diarize the system track with WhisperX (requires `hfToken` + whisperx). */
  diarize?: boolean;
  /** Track id treated as the multi-speaker system mix (default 1). */
  systemTrack?: number;
  /** Extraction format (default `wav`). */
  format?: ExtractFormat;
  /** Hugging Face token for WhisperX diarization. */
  hfToken?: string;
  minSpeakers?: number;
  maxSpeakers?: number;
  /** Max concurrent Whisper API requests (default 4). */
  apiConcurrency?: number;
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
  const gpu = new Semaphore(1);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "trackscribe-"));
  try {
    const tracks = await probeAudioTracks(input);
    if (tracks.length === 0) {
      throw new Error(`No audio tracks found in "${input}".`);
    }

    const extracted = await extractAllTracks(input, tracks, tmp, format);

    const jobs = extracted.map((t) =>
      transcribeOrDiarize(t, { systemTrack, opts, tmp, api, gpu }),
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
  gpu: Semaphore;
}

async function transcribeOrDiarize(
  track: ExtractedTrack,
  ctx: JobContext,
): Promise<Segment[]> {
  const { systemTrack, opts, tmp, api, gpu } = ctx;
  const label = labelFor(track.trackId, systemTrack, opts);

  // Skip tracks that are (near) entirely silent — Whisper only hallucinates.
  const duration = await probeDurationSec(track.file);
  if (await isNearSilent(track.file, duration)) {
    return [];
  }

  const wantDiarize =
    !!opts.diarize && track.trackId === systemTrack && !!opts.hfToken;

  if (!wantDiarize) {
    return transcribeTrack(track, label, tmp, api);
  }

  try {
    const { segments, assessment } = await gpu.run(() =>
      diarizeWithWhisperX(track.file, track.trackId, tmp, opts.hfToken!, {
        minSpeakers: opts.minSpeakers,
        maxSpeakers: opts.maxSpeakers,
      }),
    );
    if (!assessment.ok) {
      console.warn(
        `[trackscribe] diarization warning (track ${track.trackId}): ${assessment.reason}`,
      );
      if (process.env.OPENAI_API_KEY) {
        console.warn(
          `[trackscribe] falling back to whisper-1 for track ${track.trackId}.`,
        );
        return transcribeTrack(track, label, tmp, api);
      }
    }
    return segments;
  } catch (err) {
    if (err instanceof BinaryNotFoundError) {
      console.warn(`[trackscribe] ${err.message}`);
      console.warn(
        `[trackscribe] falling back to whisper-1 for track ${track.trackId}.`,
      );
      return transcribeTrack(track, label, tmp, api);
    }
    throw err;
  }
}
