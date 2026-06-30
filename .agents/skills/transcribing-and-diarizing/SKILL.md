---
name: transcribing-and-diarizing
description: "Whisper (OpenAI) transcription and pyannoteAI cloud diarization knowledge for trackscribe: the segment-timestamp model constraint, how speaker turns for EVERY track are aligned onto whisper-1 segments by overlap (t{N}/SPEAKER_xx), and the degraded-diarization guard. Use whenever a task touches transcribe.ts, diarizeTrack.ts, align.ts or pyannote.ts, the OpenAI audio API, speaker labels, the system track or any track's diarization, chunked transcription, or PYANNOTEAI_API_KEY. Verified by `npm test`."
metadata:
  type: knowledge
  verification_signal: npm test
---
# Transcribing and diarizing

## When to use
Editing `transcribe.ts` / `diarizeTrack.ts` / `align.ts` / `pyannote.ts`; anything about Whisper, the OpenAI audio API, pyannoteAI cloud diarization, speaker labels, or chunked transcription.

## Injected knowledge

- **`whisper-1` is the only OpenAI model with segment timestamps.** Use `response_format: "verbose_json"` + `timestamp_granularities: ["segment"]` (`src/transcribe.ts:66-70@1a7f821`). The SDK's static return type omits `segments`, so the boundary cast `res as unknown as WhisperVerboseResponse` is required and intentional (`src/transcribe.ts:74@1a7f821`) — keep it isolated to that one call, don't spread `any`.
- **Hallucination guard:** drop segments with empty text or `no_speech_prob >= 0.6` (`NO_SPEECH_THRESHOLD`, `src/transcribe.ts:24,55-60@1a7f821`). This is why silent tracks produce `[]`, not garbage.
- **Diarize EVERY track, in the cloud.** `--diarize` runs on every non-silent track (each is checked for multiple speakers), not just the system mix. It is a REST call to **pyannoteAI** (`precision-2`, `exclusive` mode) via `diarizeTrackCloud` (`src/diarizeTrack.ts`) — NO local GPU, NO WhisperX, NO gated Hugging Face model. Transcription stays on `whisper-1`; pyannoteAI returns only the **speaker turns** ("who spoke when"), overlaid onto that track's whisper-1 segments. Speakers are namespaced per track as `t{trackId}/SPEAKER_xx` (`src/align.ts` `alignSegmentsToTurns`); a single-speaker track is a VALID result.
- **Alignment is by MAXIMAL TEMPORAL OVERLAP, at segment granularity.** Each whisper-1 segment takes the speaker of the `exclusiveDiarization` turn it overlaps most (`src/align.ts` `overlapSeconds`/`alignSegmentsToTurns`) — pyannoteAI's boundaries are finer than whisper's, so overlap beats nearest-boundary matching. A segment with no overlapping turn becomes `t{trackId}/UNKNOWN`. Word-level re-segmentation is deliberately out of scope (verbose_json gives segment, not word, timestamps).
- **Degraded-diarization guard.** Because diarization runs on EVERY track, a SINGLE speaker is a VALID outcome — `assessAlignedDiarization` (`src/align.ts`) does NOT fail on speaker count. It rejects only a genuinely broken alignment: zero turns, or under 50% segment coverage. On a failed assessment — or ANY cloud/network error caught inside `diarizeTrackCloud` — the pipeline **keeps the already-computed whisper-1 transcript** under that track's friendly fallback label; it NEVER re-transcribes, and `unified.json` is always produced (`src/diarizeTrack.ts`, `src/pipeline.ts` `transcribeOrDiarize`).
- **Optionality, keys & debug.** `PYANNOTEAI_API_KEY` is required only for `--diarize` (optional `PYANNOTEAI_BASE_URL` overrides the API base). Missing key → all tracks are transcribed WITHOUT diarization (friendly labels), no crash. `--verbose` (or `TRACKSCRIBE_DEBUG=1`) logs each stage to stderr (`src/debug.ts`); `npm run doctor [video.mkv]` validates keys + both APIs via free endpoints (`models.list`, `GET /v1/test`) before a live run. The `OPENAI_API_KEY` lazy-client + env-order rule still applies (see `following-typescript-conventions`).
- **Pure functions are the test surface:** `segmentsFromVerboseJson` (`src/transcribe.ts`) and `overlapSeconds` / `alignSegmentsToTurns` / `assessAlignedDiarization` (`src/align.ts`) are pure and fixture-tested; the `pyannote.ts` REST client is covered by a **mocked-`fetch`** test — never the network. See `testing-trackscribe`.

## References
Oversized inputs are split before transcription — see `working-with-ffmpeg-media` (24 MB cap, timestamp re-absolutization). The 4-step pyannoteAI job flow (POST media/input → presigned PUT → POST diarize → poll GET jobs/{id}) lives in `src/pyannote.ts`.

## Evolution note
Knowledge skill (no `<evolution>`). Updated only via `meta-skill-evolution` after `npm test` (the transcribe/align/pyannote specs) or the cited source confirms the change; replace the stale passage, keep it lean.
