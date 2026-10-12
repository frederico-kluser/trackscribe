---
name: understanding-trackscribe-architecture
description: Explains trackscribe's pipeline layout, data flow, and the Segment contract so tasks don't re-scan the repo. Use whenever you start a non-trivial change, need to decide where new code belongs, ask how one stage connects to another, or touch more than one module. Load this first on any cross-module task.
metadata:
  type: knowledge
  verification_signal: npm run build
---
# Understanding trackscribe architecture

## When to use
Starting any non-trivial task; deciding where new code goes; "where does X live / how does stage Y connect"; any change spanning more than one `src/` module. Load before editing.

## Injected knowledge

**Data flow (one line):** `probe → extract → [transcribeTrack | diarizeWithWhisperX] → mergeTranscripts (sort by start) → unified.json (+ turns.json)` — orchestrated in `src/pipeline.ts:70-95@1a7f821`.

**Domains → files** (so you edit the right place):
- media/ffmpeg: `probe.ts` (discover tracks), `extract.ts` (16 kHz mono), `silence.ts` (detect), `chunk.ts` (>24 MB split). See `working-with-ffmpeg-media`.
- transcription/diarization: `transcribe.ts`, `diarizeTrack.ts`. See `transcribing-and-diarizing`.
- merge/contract: `merge.ts`, `types.ts`.
- infra: `exec.ts` (no-shell process wrapper), `env.ts` (dotenv override), `semaphore.ts`.
- CLI: `index.ts` (`parseArgs`, output routing).

**The one contract that matters — `Segment`** = `{speaker, track, start, end, text}` (`src/types.ts:39-46@1a7f821`). Every source (Whisper or WhisperX) returns `Segment[]`; `DiarizedSegment extends Segment` only adds optional `words` (`src/types.ts:55-65@1a7f821`). This is why `pipeline.ts` merges sources with no cast — keep it that way: new sources must return `Segment[]`.

**`audioIndex` vs `absoluteIndex`** (both 0-based): `audioIndex` is audio-relative, used in `-map 0:a:N`; `absoluteIndex` is the container stream index (`0:0` video, `0:1` audio…). `src/probe.ts:46-48@1a7f821` maps one to the other. Mixing them up is the classic off-by-one here.

**Concurrency model** (`src/pipeline.ts:72-73@1a7f821`): an `api` semaphore (default 4) bounds Whisper calls; a `gpu` semaphore (1) serializes WhisperX. The `api` permit wraps only the leaf HTTP call, never a whole track job — wrapping a whole job would deadlock. Preserve this when adding parallel work.

**Where to add common things:**
- A CLI flag → `index.ts` `parseArgs` options + thread through `PipelineOptions` (`pipeline.ts:32-47`) + document in BOTH `README.md` and `README.pt-BR.md`.
- A new external tool call → go through `run(bin, args[])` in `exec.ts` (never raw `child_process`).

## References
For exact signatures, read the cited file directly — provenance lines above are the index. `npm run build` (this skill's verification signal) fails if a structural claim here drifts out of sync with the code.

## Evolution note
This is a knowledge skill (no end-of-task registo de aprendizado (memória CoALA local)). It is updated only via memória CoALA local (`coala.py add`) after an external signal (here, `npm run build`) confirms a structural change, replacing the stale passage rather than appending.
