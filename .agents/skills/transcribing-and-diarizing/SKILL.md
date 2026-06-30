---
name: transcribing-and-diarizing
description: Whisper (OpenAI) and WhisperX knowledge for trackscribe, including the segment-timestamp model constraint and the silent-diarization-failure guard. Use whenever a task touches transcribe.ts or diarizeTrack.ts, the OpenAI audio API, speaker labels, diarization, chunked transcription, or HF_TOKEN/WhisperX. Verified by `npm test` (transcribe + diarize specs).
metadata:
  type: knowledge
  verification_signal: npm test
---
# Transcribing and diarizing

## When to use
Editing `transcribe.ts` / `diarizeTrack.ts`; anything about Whisper, WhisperX, the OpenAI audio API, speaker labels/diarization, or chunked transcription.

## Injected knowledge

- **`whisper-1` is the only OpenAI model with segment timestamps.** Use `response_format: "verbose_json"` + `timestamp_granularities: ["segment"]` (`src/transcribe.ts:66-70@1a7f821`). The SDK's static return type omits `segments`, so the boundary cast `res as unknown as WhisperVerboseResponse` is required and intentional (`transcribe.ts:74@1a7f821`) — keep it isolated to that one call, don't spread `any`.
- **Hallucination guard:** drop segments with empty text or `no_speech_prob >= 0.6` (`NO_SPEECH_THRESHOLD`, `src/transcribe.ts:24,55-60@1a7f821`). This is why silent tracks produce `[]`, not garbage.
- **Diarize the system track ONLY.** The mic track is one person ("Host"); only the system track may mix participants, so WhisperX runs on it alone (`src/pipeline.ts` routing). Diarized speakers are tagged `system/SPEAKER_xx` (`src/diarizeTrack.ts:37-48@1a7f821`).
- **WhisperX silent-failure (the big one).** WhisperX can transcribe but skip diarization — bad `HF_TOKEN`, unaccepted gated pyannote terms, or a model-version mismatch — and STILL exit 0 with every speaker `UNKNOWN`. `assessDiarization` (`src/diarizeTrack.ts:60-85@1a7f821`) detects this via a gated-access stderr regex and an all-`UNKNOWN` check; the pipeline then warns and **falls back to whisper-1** when `OPENAI_API_KEY` is set. Never trust diarized output without this check.
- **Optionality:** `whisperx` may be absent → `run()` throws `BinaryNotFoundError`, caught in the pipeline to degrade gracefully (label the track "Call (system)"). `HF_TOKEN` is required only for `--diarize`.
- **Pure mappers are the test surface:** `segmentsFromVerboseJson` and `mapWhisperxJson` are pure and exported; verify mapping logic with fixtures (`test/fixtures/*.json`) — never the network. See `testing-trackscribe`.

## References
Oversized inputs are split before transcription — see `working-with-ffmpeg-media` (24 MB cap, timestamp re-absolutization).

## Evolution note
Knowledge skill (no `<evolution>`). Updated only via `meta-skill-evolution` after `npm test` (the transcribe/diarize specs) or the cited source confirms the change; replace the stale passage, keep it lean.
