# Project Analysis — trackscribe

> Phase-1 artifact of the knowledge-skills bootstrap. Provenance format:
> `path/file:line@1a7f821` (HEAD short hash at analysis time). This file is an
> analysis record, not a skill; it may be longer than a skill body.

## 1. Normative documents (discovered in-repo)

Discovery scanned the repo root, `docs/`, `.github/`, and config. **Found:**
`README.md`, `README.pt-BR.md` (bilingual mirror), `CHANGELOG.md`, `package.json`,
`tsconfig.json` / `tsconfig.build.json`, `.github/workflows/ci.yml`, `.editorconfig`,
`.env.example`, `LICENSE` (Apache-2.0), `NOTICE`.

**Not found** (declared, not invented): no `docs/` or `docs/adr/` directory, no
`CONTRIBUTING*`, no `ARCHITECTURE*`, no RFCs, **no existing `AGENTS.md` / `CLAUDE.md`**,
and **no linter/formatter** config (no eslint/prettier). Quality is therefore gated by
`tsc` + the test suite + CI only — a key fact for "deterministic enforcement vs prose."

### Normative excerpts (verbatim)

- The product thesis that governs the domain logic — `README.md:24@1a7f821`:
  > "**physical track separation _is_ diarization** for the "mic vs. system" split. No machine learning needed to know who's on which track."
- The non-dedupe invariant — `README.md:28@1a7f821`:
  > "Segments from different tracks **legitimately overlap** in time … trackscribe **preserves** those overlaps — it never dedupes them."
- The canonical commands — `package.json:33-34@1a7f821`:
  > `"typecheck": "tsc -p tsconfig.json --noEmit"` · `"test": "node --import tsx --test test/*.test.ts"`
- The shadowing gotcha, encoded in code — `src/env.ts:1-6@1a7f821`:
  > "load the project `.env` with `override: true` so a project key WINS over a stale/invalid value already exported in the shell profile … `transcribe.ts` constructs the OpenAI client lazily so the override is in effect by then."

## 2. Stack & layout

- **Runtime/lang:** Node ≥20 (`package.json:26`), TypeScript ESM, `"type":"module"` (`package.json:5`).
- **Module mode:** `NodeNext` / `moduleResolution NodeNext` (`tsconfig.json:5-6`) → relative imports MUST carry `.js`.
- **Deps:** `openai ^6.45.0`, `dotenv ^17.4.2` (`package.json:62-64`); dev: `typescript`, `tsx`, `@types/node`.
- **Domains (src/, 13 files):**
  | Domain | Files | Role |
  |---|---|---|
  | media/ffmpeg | `probe.ts`, `extract.ts`, `silence.ts`, `chunk.ts` | probe tracks, extract 16 kHz mono, silence detect, >24 MB chunking |
  | transcription | `transcribe.ts` | whisper-1 `verbose_json`, pure `segmentsFromVerboseJson` mapper, chunk orchestration |
  | diarization | `diarizeTrack.ts` | WhisperX CLI, `mapWhisperxJson`, `assessDiarization` silent-failure guard |
  | merge | `merge.ts`, `types.ts` | `mergeTranscripts` sort, `groupIntoTurns`, `detectCrosstalk`; the `Segment` contract |
  | concurrency/infra | `semaphore.ts`, `exec.ts`, `env.ts` | permit-transfer semaphore; no-shell `execFile` wrapper; dotenv override |
  | CLI | `index.ts` | `parseArgs`, output routing |
- **Data flow:** `probe → extract → [transcribeTrack | diarizeWithWhisperX] → mergeTranscripts(sort by start) → unified.json (+ turns.json)`.

## 3. API contracts (stable surfaces)

- `Segment = {speaker, track, start, end, text}` is the single unit every source returns; `DiarizedSegment extends Segment` adds optional `words` (`src/types.ts:39-65@1a7f821`). This is what lets the pipeline merge without a cast.
- `audioIndex` (audio-relative, for `-map 0:a:N`) ≠ `absoluteIndex` (container stream index); both zero-based (`src/types.ts:18-21`, `src/probe.ts:46-48@1a7f821`).
- CLI flags: `-o/--out` (`-`=stdout), `--turns`, `--format wav|mp3`, `--diarize`, `--system-track N`, `--min/--max-speakers` (`src/index.ts:50-59@1a7f821`).
- Pipeline options incl. `apiConcurrency` (default 4) and `labels` overrides (`src/pipeline.ts:32-47@1a7f821`).

## 4. Tooling-guaranteed conventions (POINT TO THE CHECK, don't write prose)

These are already enforced by an automated signal; skills must reference the check, never restate it as prose:

| Convention | Guaranteed by | Where |
|---|---|---|
| Strict types, no unchecked index access, no implicit override, no switch fallthrough | `npm run typecheck` (`tsc` strict) | `tsconfig.json:12-15` · CI `ci.yml:36` |
| `import type` for type-only imports | `verbatimModuleSyntax` via `tsc` | `tsconfig.json:16` |
| `.js` extension on every relative import | `NodeNext` via `tsc` | `tsconfig.json:5-6` |
| Compiles cleanly to `dist/` (+ d.ts) | `npm run build` | CI `ci.yml:38` |
| All tests green, no network | `npm test` (`node:test` via tsx) | `package.json:34` · CI `ci.yml:42` |
| Works on Node 20 **and** 24 | CI matrix | `ci.yml` |

Implication: the convention skill should say "run `npm run typecheck`," not enumerate strict-mode rules in prose.

## 5. High-value knowledge to encode (non-obvious; not inferable; changes how tasks are done)

Ranked; each becomes injected knowledge in a skill, with provenance and validity scope:

1. **Lazy OpenAI client + `.env` override + import order** — construct `new OpenAI()` lazily, import `./env.js` first; else a stale shell key shadows `.env`. Scope: any code reading `process.env`/OpenAI. `src/env.ts:14-18`, `src/transcribe.ts:43-47`, `src/index.ts:8@1a7f821`.
2. **NodeNext `.js` import extensions** — mandatory on all relative imports. `tsconfig.json:5-6@1a7f821`. (Tooling-guaranteed → point to `typecheck`.)
3. **`node --test` glob needs shell expansion** — use unquoted `test/*.test.ts`; Node 20's runner does not expand globs itself (Node 21+ does). Scope: the test script. `package.json:34@1a7f821`.
4. **whisper-1 only for segment timestamps + SDK cast** — `verbose_json` + `timestamp_granularities:["segment"]`; cast `res as unknown as WhisperVerboseResponse`. `src/transcribe.ts:66-74@1a7f821`.
5. **WhisperX silent-diarization failure** — exits 0 with all-`UNKNOWN`; detect via `assessDiarization`, warn, fall back to whisper-1. `src/diarizeTrack.ts:60-85@1a7f821`.
6. **24 MB chunk cap + re-absolutize timestamps** — `SAFE_BYTES=24*1024*1024`; add `chunk.startOffset` back before merge. `src/chunk.ts:20`, `src/transcribe.ts:88-102@1a7f821`.
7. **Re-encode, never `-c:a copy`** + 16 kHz mono — MKV codecs don't stream-copy to wav/mp3. `src/extract.ts:32-37@1a7f821`.
8. **No-shell `execFile` wrapper** — every binary via `run(bin, args[])`; ENOENT→`BinaryNotFoundError`, non-zero→`CommandFailedError`. No pipes/redirects (silence uses the `null` muxer). `src/exec.ts:61-88`, `src/silence.ts:48-57@1a7f821`.
9. **Pure-mapper + synth-fixture test pattern** — export pure mappers; tests use fixtures / synthesized MKV; never the network; `{skip:!hasFfmpeg}` / `!hasWhisperx`. `src/transcribe.ts:50-62`, `test/integration.test.ts:14-17@1a7f821`.
10. **Preserve overlaps / crosstalk** — never dedupe; `detectCrosstalk` is opt-in. `src/merge.ts:2-13,67-81@1a7f821`.

## 6. Candidate skill areas (input to Phase 2)

- **router** — project-router (one).
- **knowledge** — understanding-trackscribe-architecture (orientation/contracts); following-typescript-conventions (style + items 1-2-8, points to `typecheck`); transcribing-and-diarizing (items 4-5).
- **task** — working-with-ffmpeg-media (items 6-7-8-9, procedure); testing-trackscribe (items 3-9, procedure).
- **meta** — meta-skill-evolution, meta-skill-consolidate.

Granularity rationale: 2 domains (media, transcription/diarization) + style + testing + orientation = the directive's "minimal high-value set," avoiding sprawl that degrades routing.

## 7. Gate self-check (Phase 1)

- [x] Docs discovered & normative excerpts quoted with provenance.
- [x] "Not found" used (no ADRs/CONTRIBUTING/AGENTS.md/linter).
- [x] Annotated structure + domain map + contracts.
- [x] Tooling-guaranteed conventions enumerated with their check.
- [x] Candidate knowledge areas + gotchas ranked with provenance.
