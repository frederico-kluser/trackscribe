# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/frederico-kluser/trackscribe/releases/tag/v0.1.0
