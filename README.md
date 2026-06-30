<div align="center">

# 🎙️ trackscribe

**Turn multi-track MKV recordings into one time-ordered, speaker-attributed JSON transcript.**

Each audio track becomes a speaker — OpenAI Whisper per track, optional WhisperX diarization for the one track that mixes several people.

[![CI](https://github.com/frederico-kluser/trackscribe/actions/workflows/ci.yml/badge.svg)](https://github.com/frederico-kluser/trackscribe/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)
![OpenAI Whisper](https://img.shields.io/badge/OpenAI-whisper--1-412991.svg?logo=openai&logoColor=white)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/frederico-kluser/trackscribe/pulls)

**English** · [Português 🇧🇷](./README.pt-BR.md)

</div>

---

## Why this exists

When a recorder like **OBS** writes the **microphone** and the **desktop/system audio** to *separate MKV tracks*, you already have ground-truth speaker separation for free: **physical track separation _is_ diarization** for the "mic vs. system" split. No machine learning needed to know who's on which track.

Only the **system track** may mix several remote participants. So trackscribe transcribes every track with Whisper, tags each segment with its track, and — *optionally and only for that one track* — runs local **WhisperX** diarization to split it into `SPEAKER_00`, `SPEAKER_01`, … Everything merges into a single timeline.

Segments from different tracks **legitimately overlap** in time (they were recorded separately). trackscribe **preserves** those overlaps — it never dedupes them.

## Features

- 🔎 **Probe** any MKV's audio tracks with `ffprobe` (codec, channels, language/title tags, default flag).
- ✂️ **Extract** each track to 16 kHz mono (WAV or MP3) in a single `ffmpeg` pass.
- 📝 **Transcribe** per track with OpenAI `whisper-1` (`verbose_json`, segment timestamps).
- 🗣️ **Diarize** the multi-speaker system track locally with **WhisperX** (optional, behind `--diarize`).
- 🧩 **Merge** everything into one array sorted by `start`, preserving cross-track overlap, with an optional grouped "turns" view.
- 🛟 **Hardened**: oversized tracks are auto-chunked on silence boundaries (with timestamp re-absolutization), near-silent tracks are skipped, GPU jobs are serialized while API calls run bounded-parallel, and WhisperX's notorious *silent diarization failure* is detected and degrades gracefully.
- 🔒 **Safe process spawning**: every external binary runs through a no-shell `execFile` wrapper with typed errors (missing binary vs non-zero exit).

## How it works

```
input.mkv
  └─ probeAudioTracks()          → AudioTrack[]            (ffprobe -show_streams)
       └─ extractAllTracks()     → track_0.wav … track_N  (ffmpeg -map 0:a:N, 16 kHz mono)
            ├─ mic track    → transcribeTrack()  (OpenAI whisper-1)     → "Host" segments
            └─ system track → diarizeWithWhisperX() (local GPU, opt-in) → "system/SPEAKER_xx" segments
                  └─ mergeTranscripts() + sort by start                  → unified Segment[]
                        └─ write unified.json (+ optional turns.json)
```

## Requirements

| Tool | Required? | Notes |
|---|---|---|
| **Node.js ≥ 20** | ✅ | ESM project. |
| **ffmpeg / ffprobe** | ✅ | On `PATH`. Used for probe, extract, silence detection, chunking. |
| **OpenAI API key** | ✅ | `OPENAI_API_KEY` — for `whisper-1` transcription. |
| **WhisperX** + **HF token** + a CUDA GPU | ⛳ optional | Only for `--diarize`. See [Diarization](#diarization-optional). |

## Install

```bash
git clone https://github.com/frederico-kluser/trackscribe.git
cd trackscribe
npm install
npm run build            # compiles to dist/
npm link                 # optional: exposes the `trackscribe` command globally
```

Then create your `.env`:

```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY (and HF_TOKEN if you'll diarize)
```

> trackscribe loads `.env` with **override** semantics, so a project key always wins over a stale `OPENAI_API_KEY` left in your shell profile.

## Usage

```bash
# Core: transcribe every track, tag by track, merge → unified.json
trackscribe call.mkv

# Custom output + a grouped "turns" view
trackscribe call.mkv -o transcript.json --turns

# Diarize the system track (track 1) into multiple speakers
trackscribe call.mkv --diarize --system-track 1 --min-speakers 2 --max-speakers 4

# Smaller intermediate files (handy for very long recordings)
trackscribe call.mkv --format mp3

# Print JSON to stdout instead of a file
trackscribe call.mkv -o -
```

During development you can run straight from TypeScript without building:

```bash
npm run dev -- call.mkv --turns
```

### Options

| Flag | Default | Description |
|---|---|---|
| `<input.mkv>` | — | Path to the MKV (positional, required). |
| `-o, --out <file>` | `unified.json` | Output path. `-` writes JSON to stdout. |
| `--turns` | off | Also write a grouped same-speaker "turns" view. |
| `--format <wav\|mp3>` | `wav` | Extraction format. MP3 (64 kbps) shrinks intermediates. |
| `--diarize` | off | Diarize the system track with WhisperX (needs `HF_TOKEN`). |
| `--system-track <N>` | `1` | Track id treated as the multi-speaker system mix. |
| `--min-speakers <N>` | — | Lower bound for diarization clustering. |
| `--max-speakers <N>` | — | Upper bound (hard limits improve accuracy). |
| `-h, --help` | — | Show help. |

## Output format

A single array sorted ascending by `start`. Each element:

```jsonc
[
  { "speaker": "Host (microphone)", "track": 0, "start": 0.0, "end": 3.2,  "text": "Hey, thanks for hopping on the call." },
  { "speaker": "Call (system)",     "track": 1, "start": 3.0, "end": 5.8,  "text": "Of course, happy to be here." },
  { "speaker": "Host (microphone)", "track": 0, "start": 5.6, "end": 9.1,  "text": "So I wanted to walk through the roadmap." }
]
```

Notice track 0 ending at **3.2** overlaps track 1 starting at **3.0** — both spoke nearly simultaneously, captured on independent tracks. This is correct and preserved. (See [`examples/unified.sample.json`](./examples/unified.sample.json).)

With `--diarize`, the system track's entries look like `{ "speaker": "system/SPEAKER_00", "track": 1, … }`.

## Diarization (optional)

The microphone track is one person — it stays labeled as the host. Only the **system track** may contain several remote participants, so diarization runs **only on that track**. Given a local GPU, [WhisperX](https://github.com/m-bain/whisperX) is the most cost-effective and private option.

1. **Accept the gated model terms on Hugging Face.** WhisperX uses gated `pyannote` models for diarization.
   > ⚠️ **Silent-failure gotcha:** if you accept the *wrong* model version (e.g. only `speaker-diarization-3.1` while your WhisperX expects `speaker-diarization-community-1`), WhisperX **runs to completion with empty speaker labels — no error**. trackscribe detects this (all-`UNKNOWN` segments or a gated-access error in WhisperX's output), prints a warning, and falls back to plain Whisper text so you still get a transcript.
2. **Create a Hugging Face read token** and put it in `.env` as `HF_TOKEN`.
3. **Install WhisperX** (in a Python venv / via `pipx install whisperx`) so the `whisperx` command is on `PATH`.

Then:

```bash
trackscribe call.mkv --diarize --system-track 1 --min-speakers 2 --max-speakers 2
```

If WhisperX isn't installed or `HF_TOKEN` is missing, the system track is simply transcribed as a single `Call (system)` speaker — the pipeline never crashes.

## How it handles the hard parts

- **Files over Whisper's 25 MB request cap** are split into chunks. Cuts prefer **silence boundaries** (so words aren't sliced), and each chunk's timestamps are offset back to the absolute timeline before merging.
- **Near-silent tracks** are detected with `silencedetect` and skipped, so Whisper doesn't hallucinate text onto silence.
- **Concurrency**: Whisper API calls run bounded-parallel (default 4); WhisperX/GPU jobs are serialized to one at a time. The two never deadlock.
- **Overlap / crosstalk**: `detectCrosstalk()` can flag overlapping segments across different tracks if a consumer wants to mark simultaneous speech.

## Costs (verify current pricing)

OpenAI `whisper-1` was **$0.006/min** with a **25 MB** request cap (2025–2026 figures — confirm current rates and limits before relying on them). Per-track cost is simply the sum of each track's audio minutes. WhisperX runs locally, so diarization is free beyond your own GPU/electricity.

## Development

```bash
npm run typecheck     # tsc --noEmit (src + tests, strict)
npm run build         # emit dist/
npm test              # node:test via tsx — no network, no GPU
```

Tests never hit the network: the segment mappers are pure and tested against fixtures, and the integration test **synthesizes** a 2-track MKV with ffmpeg to exercise probe + extract. Diarization end-to-end auto-skips when `whisperx` isn't on `PATH`.

### Project structure

```
src/
  probe.ts        extract.ts      transcribe.ts   diarizeTrack.ts
  merge.ts        chunk.ts        silence.ts      pipeline.ts
  exec.ts         semaphore.ts    env.ts          types.ts   index.ts
test/             # node:test specs + fixtures
```

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Required binary "ffmpeg" was not found on PATH` | Install ffmpeg (`apt install ffmpeg` / `brew install ffmpeg`). |
| Transcription fails immediately | `OPENAI_API_KEY` not set, or shadowed by a stale shell value (trackscribe overrides via `.env`). |
| Diarization gives every segment `system/UNKNOWN` | Wrong/unaccepted gated `pyannote` terms, or a bad `HF_TOKEN`. Accept the model version your WhisperX uses. |
| `--diarize` produces a single `Call` speaker | `whisperx` not installed or `HF_TOKEN` missing — expected graceful fallback. |

## License

[Apache-2.0](./LICENSE) © Frederico Guilherme Kluser de Oliveira. See [`NOTICE`](./NOTICE).
