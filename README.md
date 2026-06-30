<div align="center">

# 🎙️ trackscribe

**Turn multi-track MKV recordings into one time-ordered, speaker-attributed JSON transcript.**

Each audio track becomes a speaker — OpenAI Whisper per track, optional pyannoteAI cloud diarization for the one track that mixes several people.

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

Any track may mix several remote participants. So trackscribe transcribes every track with Whisper, tags each segment with its track, and — *optionally, for **every** track* (`--diarize`) — runs **pyannoteAI** cloud diarization (model `precision-2`) to find multiple speakers in any track, labelling them `t{N}/SPEAKER_00`, `t{N}/SPEAKER_01`, … Everything merges into a single timeline.

Segments from different tracks **legitimately overlap** in time (they were recorded separately). trackscribe **preserves** those overlaps — it never dedupes them.

## Features

- 🔎 **Probe** any MKV's audio tracks with `ffprobe` (codec, channels, language/title tags, default flag).
- ✂️ **Extract** each track to 16 kHz mono (WAV or MP3) in a single `ffmpeg` pass.
- 📝 **Transcribe** per track with OpenAI `whisper-1` (`verbose_json`, segment timestamps).
- 🗣️ **Diarize** **every** audio track in the cloud with **pyannoteAI** (`precision-2`, behind `--diarize`) — each track is checked for multiple speakers and labelled `t{N}/SPEAKER_xx`; transcription stays on `whisper-1`.
- 🧩 **Merge** everything into one array sorted by `start`, preserving cross-track overlap, with an optional grouped "turns" view.
- 🛟 **Hardened**: oversized tracks are auto-chunked on silence boundaries (with timestamp re-absolutization), near-silent tracks are skipped, Whisper API calls run bounded-parallel while cloud diarization jobs are rate-limited, and a failed or degenerate diarization is detected and degrades gracefully to a single-speaker transcript.
- 🔒 **Safe process spawning**: every external binary runs through a no-shell `execFile` wrapper with typed errors (missing binary vs non-zero exit).

## How it works

```
input.mkv
  └─ probeAudioTracks()          → AudioTrack[]            (ffprobe -show_streams)
       └─ extractAllTracks()     → track_0.wav … track_N  (ffmpeg -map 0:a:N, 16 kHz mono)
            ├─ transcribeTrack()   (OpenAI whisper-1)                       → text segments per track
            └─ diarizeTrackCloud() (whisper-1 + pyannoteAI, with --diarize) → "t{N}/SPEAKER_xx" per track
                  └─ mergeTranscripts() + sort by start                  → unified Segment[]
                        └─ write unified.json (+ optional turns.json)
```

## Requirements

| Tool | Required? | Notes |
|---|---|---|
| **Node.js ≥ 20** | ✅ | ESM project. |
| **ffmpeg / ffprobe** | ✅ | On `PATH`. Used for probe, extract, silence detection, chunking. |
| **OpenAI API key** | ✅ | `OPENAI_API_KEY` — for `whisper-1` transcription. |
| **pyannoteAI API key** | ⛳ optional | `PYANNOTEAI_API_KEY` — only for `--diarize` (cloud diarization, `precision-2`). See [Diarization](#diarization-optional). |

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
# edit .env and set OPENAI_API_KEY (and PYANNOTEAI_API_KEY if you'll diarize)
```

> trackscribe loads `.env` with **override** semantics, so a project key always wins over a stale `OPENAI_API_KEY` left in your shell profile.

### API keys (`.env`)

Two keys live in `.env`. **`.env` is gitignored — never commit it; commit only `.env.example`.**

| Key | Required? | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | ✅ always | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) — needs an account with billing; starts with `sk-`. Used for `whisper-1` transcription. |
| `PYANNOTEAI_API_KEY` | ⛳ only for `--diarize` | [dashboard.pyannote.ai](https://dashboard.pyannote.ai) — **free trial credits included**. Used for cloud diarization (`precision-2`). |
| `PYANNOTEAI_BASE_URL` | optional | Override the API base URL (defaults to `https://api.pyannote.ai/v1`). |

```bash
cp .env.example .env        # then edit .env:
#   OPENAI_API_KEY=sk-...
#   PYANNOTEAI_API_KEY=...
```

Before a live run, verify both keys and APIs (free endpoints, no credits spent):

```bash
npm run doctor path/to/video.mkv
```

## Usage

```bash
# Core: transcribe every track, tag by track, merge → unified.json
trackscribe call.mkv

# Custom output + a grouped "turns" view
trackscribe call.mkv -o transcript.json --turns

# Diarize EVERY track (detect multiple speakers per track), with debug logging
trackscribe call.mkv --diarize --verbose

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
| `--diarize` | off | Diarize **every** audio track via pyannoteAI cloud (needs `PYANNOTEAI_API_KEY`). |
| `--system-track <N>` | `1` | Track id used only for the friendly fallback label. |
| `--min-speakers <N>` | — | Lower bound for clustering (hint, applied to every track). |
| `--max-speakers <N>` | — | Upper bound (hint, applied to every track). |
| `--verbose` | off | Verbose debug logging to stderr (probe, chunks, jobs, polling, alignment). |
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

With `--diarize`, each diarized track's entries are namespaced per track, e.g. `{ "speaker": "t1/SPEAKER_00", "track": 1, … }` (and `t0/SPEAKER_00` for track 0). A track with a single speaker simply shows `t{N}/SPEAKER_00`.

## Diarization (optional)

Physical track separation already gives you mic-vs-system for free. On top of that, `--diarize` checks **every** audio track for multiple speakers, in the cloud via [pyannoteAI](https://www.pyannote.ai) (model `precision-2`). There is **no local GPU, no CUDA, and no gated Hugging Face model**: trackscribe keeps `whisper-1` as the transcription engine and asks pyannoteAI only for the **speaker turns** ("who spoke when"), which are overlaid onto the whisper-1 segments by **maximal temporal overlap** (`src/align.ts`). Each track's speakers are namespaced `t{N}/SPEAKER_xx`; a track with a single speaker is a valid result, not a failure.

1. **Create a pyannoteAI API key** at [dashboard.pyannote.ai](https://dashboard.pyannote.ai) (free trial credits included) and put it in `.env` as `PYANNOTEAI_API_KEY`.
2. *(optional)* Override the API base URL with `PYANNOTEAI_BASE_URL` (defaults to `https://api.pyannote.ai/v1`).

Then:

```bash
trackscribe call.mkv --diarize --verbose
```

Under the hood, for each track trackscribe uploads the extracted 16 kHz mono WAV to temporary encrypted storage (auto-deleted in ~48 h), creates a `precision-2` job in `exclusive` mode (one speaker per instant), polls until it finishes, and aligns the returned turns onto that track's transcript. If `PYANNOTEAI_API_KEY` is missing — or a cloud job fails, times out, or returns no usable turns — trackscribe warns and keeps that track's plain whisper-1 transcript under its friendly label. **The pipeline never crashes and `unified.json` is always written.**

> **Privacy:** with `--diarize`, every track's audio is sent to pyannoteAI's cloud (GDPR; EU data residency available; media auto-deleted in ~48 h, job results in ~24 h). If nothing may leave your infrastructure, weigh that before enabling it.

## How it handles the hard parts

- **Files over Whisper's 25 MB request cap** are split into chunks. Cuts prefer **silence boundaries** (so words aren't sliced), and each chunk's timestamps are offset back to the absolute timeline before merging.
- **Near-silent tracks** are detected with `silencedetect` and skipped, so Whisper doesn't hallucinate text onto silence.
- **Concurrency**: Whisper API calls run bounded-parallel (default 4); cloud diarization jobs are bounded by a separate semaphore (default 2) to respect pyannoteAI's ~80–100 req/min rate limits.
- **Overlap / crosstalk**: `detectCrosstalk()` can flag overlapping segments across different tracks if a consumer wants to mark simultaneous speech.

## Costs (verify current pricing)

OpenAI `whisper-1` was **$0.006/min** with a **25 MB** request cap (2025–2026 figures — confirm current rates and limits before relying on them). Per-track cost is simply the sum of each track's audio minutes. pyannoteAI cloud diarization is billed separately, **per hour of audio** (order of magnitude ≈ €0.10/h for diarization-only in 2026 — confirm on your dashboard), and only when you pass `--diarize`.

## Development

```bash
npm run typecheck            # tsc --noEmit (src + tests + scripts, strict)
npm run build                # emit dist/
npm test                     # node:test via tsx — no network, no API keys
npm run doctor [video.mkv]   # preflight: keys, ffmpeg, OpenAI+pyannote auth, media probe + cost
npm run clip -- in.mkv 60    # make a 60s clip (all tracks copied) for cheap iteration
```

Tests never hit the network: the segment/alignment mappers are pure and tested against fixtures, the pyannoteAI client is covered by a **mocked-`fetch`** unit test (no live diarization call), and the integration test **synthesizes** a 2-track MKV with ffmpeg to exercise probe + extract.

**Debugging a live run.** Before spending credits, `npm run doctor path/to/video.mkv` validates the keys and both APIs via their **free** endpoints (OpenAI `models.list`, pyannoteAI `GET /v1/test` — no job created), then prints the track layout and a rough cost estimate. Add `--verbose` to any run for stage-by-stage logs (probe, chunking, job ids, polling, alignment) on stderr.

### Project structure

```
src/
  probe.ts        extract.ts      transcribe.ts   diarizeTrack.ts
  pyannote.ts     align.ts        merge.ts        chunk.ts
  silence.ts      pipeline.ts     exec.ts         semaphore.ts
  env.ts          types.ts        index.ts
test/             # node:test specs + fixtures
```

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Required binary "ffmpeg" was not found on PATH` | Install ffmpeg (`apt install ffmpeg` / `brew install ffmpeg`). |
| Transcription fails immediately | `OPENAI_API_KEY` not set, or shadowed by a stale shell value (trackscribe overrides via `.env`). |
| Diarization gives every segment `system/UNKNOWN` | pyannoteAI returned no turn overlapping those segments (noisy/odd audio). trackscribe warns and keeps the whisper-1 transcript. |
| `--diarize` produces a single `Call` speaker | `PYANNOTEAI_API_KEY` missing, or the cloud job failed / timed out / looked degenerate — expected graceful fallback to whisper-1. |

## License

[Apache-2.0](./LICENSE) © Frederico Guilherme Kluser de Oliveira. See [`NOTICE`](./NOTICE).
