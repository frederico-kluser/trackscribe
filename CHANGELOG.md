# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Diarization moved from local WhisperX/pyannote to the **pyannoteAI cloud**
  (model `precision-2`, `exclusive` mode). Transcription remains OpenAI
  `whisper-1`; the cloud provides only the speaker turns, aligned onto the
  whisper-1 segments by **maximal temporal overlap** (`src/align.ts`). This
  removes all local GPU/CUDA, `pipx install whisperx`, and gated Hugging Face
  models from the `--diarize` path.
- `--diarize` now requires `PYANNOTEAI_API_KEY` (was `HF_TOKEN`); add
  `PYANNOTEAI_BASE_URL` to override the API base URL.
- Concurrency: the serialized single-GPU semaphore is replaced by a `diar`
  semaphore that bounds concurrent cloud diarization jobs (default 2).
- `--diarize` now diarizes **every** audio track (not just the system track):
  each track is checked for multiple speakers and labelled `t{N}/SPEAKER_xx`; a
  single-speaker track is a valid result (the assessment no longer fails on a
  single speaker — only on empty turns or poor coverage). `diarizeSystemTrack` →
  `diarizeTrackCloud`; `--system-track` now only sets the friendly fallback label.

### Added

- `src/pyannote.ts` — minimal pyannoteAI REST client (upload → diarize → poll)
  over the global `fetch`; no new dependencies.
- `src/align.ts` — pure `overlapSeconds` / `alignSegmentsToTurns` /
  `assessAlignedDiarization`, unit-tested with fixtures and a mocked `fetch`.
- `--verbose` (and `TRACKSCRIBE_DEBUG=1`) — stage-by-stage debug logging to
  stderr (`src/debug.ts`).
- `npm run doctor [video.mkv]` — preflight validating keys, ffmpeg, and OpenAI +
  pyannoteAI connectivity via free endpoints (`models.list`, `GET /v1/test`),
  then probing the media. Backed by `PyannoteClient.testAuth()`.
- `npm run clip -- <in.mkv> <seconds>` — short all-tracks clip for cheap iteration.

### Removed

- `diarizeWithWhisperX`, `mapWhisperxJson`, and `assessDiarization` (the local
  WhisperX path) along with the `HF_TOKEN` environment variable.

## [0.1.0] - 2026-06-30

### Added

- Initial release.
- `probeAudioTracks` — discover audio tracks in an MKV via ffprobe.
- `extractAllTracks` — extract each track to 16 kHz mono (WAV or MP3) in one
  ffmpeg pass.
- `transcribeTrack` — per-track transcription with OpenAI `whisper-1`
  (`verbose_json`, segment timestamps), with a pure `segmentsFromVerboseJson`
  mapper and a no-speech hallucination guard.
- `diarizeWithWhisperX` — optional local diarization of the multi-speaker
  system track, with silent-failure detection (`assessDiarization`).
- `mergeTranscripts` / `groupIntoTurns` / `detectCrosstalk` — time-ordered
  merge that preserves cross-track overlap.
- Oversized-track chunking with silence-aware cut points and timestamp
  re-absolutization (`chunk.ts`).
- Two-semaphore concurrency: serialized WhisperX (GPU), bounded Whisper API.
- CLI with `--diarize`, `--system-track`, `--format`, `--out`, `--turns`,
  `--min-speakers`, `--max-speakers`.

[Unreleased]: https://github.com/frederico-kluser/trackscribe/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/frederico-kluser/trackscribe/releases/tag/v0.1.0
