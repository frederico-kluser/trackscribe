---
name: working-with-ffmpeg-media
description: Procedures and gotchas for probing, extracting, chunking, and silence-detecting audio with ffmpeg/ffprobe in trackscribe. Use whenever a task touches probe.ts, extract.ts, silence.ts, or chunk.ts, or mentions audio extraction, track probing, MKV/container codecs, 16 kHz mono, silence, or the 25 MB limit. Verified by `npm test` (integration + silence specs).
metadata:
  type: task
  verification_signal: npm test
---
# Working with ffmpeg media

## When to use
Editing `probe.ts` / `extract.ts` / `silence.ts` / `chunk.ts`; anything about extracting audio, probing tracks, codecs, 16 kHz mono, silence detection, or chunking large audio.

## Injected knowledge (the non-obvious parts)

- **All ffmpeg/ffprobe calls go through `run(bin, args[])`** (no shell — see `following-typescript-conventions`). Build a string array; no pipes/redirects.
- **Probe:** `ffprobe -v quiet -print_format json -show_streams`, then filter `codec_type === "audio"` and re-index to `audioIndex` (`src/probe.ts:40-48@1a7f821`). Read properties from `absoluteIndex`, map with `audioIndex`.
- **Extract = re-encode, never `-c:a copy`** (`src/extract.ts:32-37@1a7f821`): MKV tracks are often AAC/AC3/Opus/FLAC/DTS that won't stream-copy into wav/mp3. One ffmpeg pass: `-map 0:a:N -ac 1 -ar 16000` then `-c:a pcm_s16le` (wav) or `-c:a libmp3lame -b:a 64k` (mp3). Target is always **16 kHz mono** (Whisper resamples to that anyway).
- **Chunking threshold is 24 MB, not 25** (`src/chunk.ts:20@1a7f821`, `SAFE_BYTES = 24*1024*1024`) to leave multipart-header headroom under Whisper's 25 MB cap. ~13 min per chunk for 16 kHz mono PCM.
- **Re-absolutize timestamps after chunking:** each chunk is transcribed with chunk-local times; add `chunk.startOffset` back to every segment `start`/`end` before merge (`src/transcribe.ts:88-102@1a7f821`). Forgetting this duplicates times across chunks.
- **silencedetect without pipes:** `-af silencedetect=noise=-30dB:d=0.5 -f null -`; parse the intervals off stderr (`src/silence.ts:48-57@1a7f821`). Reused by both the near-silent-skip guard and the chunk cut-planner.

## Procedure (adding/altering an ffmpeg step)
1. Read the relevant module + `working-with-ffmpeg-media` knowledge above.
2. Build the args as a string array; call `run("ffmpeg"|"ffprobe", args)` from `src/exec.ts`.
3. Keep output 16 kHz mono and re-encoded (no `copy`).
4. Add/extend a test that **synthesizes** a fixture with ffmpeg `lavfi` (no real media, no network) — see `testing-trackscribe`.
5. Run the verification signal: `npm test` (must stay green; `integration.test.ts` + `silence.test.ts` exercise this domain).

## registo de aprendizado (memória CoALA local)
On task completion, run the memory pipeline (`.agents/skills/a memória CoALA local (`coala.py add`)`). Update THIS SKILL.md directly ONLY if the learning is important (non-obvious, changes how media tasks are done) AND externally verified — here that means `npm test` passed after the change, or the cited source supports the claim. Detect conflicts and REPLACE the stale passage (don't append a competing rule); keep provenance `file:line@hash`; keep the body lean. If nothing important-and-verified emerged, write nothing. The skill update is a separate git commit.
