# Skill Map — trackscribe knowledge-skills system

> Phase-2 artifact. Proposes the library BEFORE any skill file exists. Catalog +
> composition graph + per-skill external verification signal + granularity
> rationale. Source of truth lives in `.agents/skills/`; `.claude/skills`
> symlinks to it.

## Design stance

Start from the directive's minimal high-value set — "router + style + 2–3 domains
+ testing" — because routing precision degrades as the catalog grows (a large
catalog makes the model pick wrong). 8 skills total: 1 router, 1 orientation, 1
style, 2 domain, 1 testing, 2 meta. No `LEARNINGS.md`, no buffers — each
`SKILL.md` is its own memory, updated only through the verified memory pipeline.

## Catalog

| # | name | type | verification_signal | exists because |
|---|---|---|---|---|
| 1 | `project-router` | router | `scripts/skill-lint.mjs` + routing evals | single entry point; classifies every task, asks PT-BR questions, builds the skill chain, runs evolution, manages TASK_PLAN.md |
| 2 | `understanding-trackscribe-architecture` | knowledge | `npm run build` + provenance entailment | orientation: domain map, data flow, the `Segment` contract, where code lives — so tasks don't re-scan the repo |
| 3 | `following-typescript-conventions` | knowledge | `npm run typecheck` | how to write code here: NodeNext `.js` imports, `import type`, no-shell `execFile`, lazy OpenAI client + `.env` override, strict tsconfig |
| 4 | `working-with-ffmpeg-media` | task | `npm test` (`integration.test.ts`, `silence.test.ts`) | probe/extract/silence/chunk: exact ffmpeg/ffprobe calls, 16 kHz mono, re-encode-not-copy, 24 MB chunk cap + timestamp re-absolutization |
| 5 | `transcribing-and-diarizing` | knowledge | `npm test` (`transcribe.test.ts`, `diarize.test.ts`) | whisper-1 segment-timestamps + SDK cast; WhisperX silent-failure + fallback; system-track-only diarization |
| 6 | `testing-trackscribe` | task | `npm test` | node:test + tsx, shell-expanded glob (Node 20), pure-mapper + synth-fixture (no network), `{skip:!hasFfmpeg/!hasWhisperx}` |
| 7 | `meta-skill-evolution` | meta | `scripts/skill-lint.mjs` + memory-pipeline gate | end-of-task decision: update a skill (verified), propose a new one (draft), or discard |
| 8 | `meta-skill-consolidate` | meta | `scripts/skill-lint.mjs` + regression gate + 2nd-opinion | periodic GC: dedupe, conflict-resolve, staleness-by-provenance, token budget |

### Per-skill draft descriptions & triggers (pushy on triggers)

- **project-router** — "Routes EVERY implementation task to the right skills BEFORE any step. Use whenever the user asks for any change/fix/feature/analysis/refactor, even if skills aren't mentioned." Triggers: any task start.
- **understanding-trackscribe-architecture** — "Explains the pipeline layout, data flow, and the `Segment` contract. Use when starting any non-trivial task, deciding where new code lives, or asking how a stage connects." Triggers: "where does X live", onboarding, cross-module change.
- **following-typescript-conventions** — "Encodes this repo's TS/ESM conventions and infra gotchas. Use whenever you write or edit any `.ts`, add an import, spawn a process, read env, or touch the OpenAI client — even for a one-line change." Triggers: any `.ts` edit.
- **working-with-ffmpeg-media** — "Procedures for probing/extracting/chunking audio with ffmpeg/ffprobe. Use whenever a task touches `probe.ts`/`extract.ts`/`silence.ts`/`chunk.ts`, audio extraction, track probing, silence, or container codecs." Triggers: ffmpeg/audio/MKV.
- **transcribing-and-diarizing** — "Whisper + WhisperX knowledge. Use whenever a task touches transcription, diarization, the OpenAI audio API, speaker labels, `transcribe.ts`/`diarizeTrack.ts`, or chunked transcription." Triggers: Whisper/WhisperX/diarization.
- **testing-trackscribe** — "How to write and run tests here. Use whenever you add/modify/run tests, see a CI test failure, or need the no-network fixture pattern." Triggers: test/CI.
- **meta-skill-evolution** / **meta-skill-consolidate** — see `<evolution_spec>`.

## Composition graph

```
project-router (entry)
  ├─ loads catalog.md, classifies task, asks PT-BR questions, writes TASK_PLAN.md
  ├─ almost always loads first: understanding-architecture + following-typescript-conventions
  ├─ domain chain (parallelizable via isolated subagents):
  │     working-with-ffmpeg-media   ── feeds ──▶ transcribing-and-diarizing
  │       (depends on following-conventions: no-shell exec, .js imports)
  ├─ cross-cutting: testing-trackscribe (any code change → run npm test)
  └─ on completion: each task skill runs <evolution> → meta-skill-evolution
                    (router invokes evolution for knowledge-skill updates / new areas)
meta-skill-consolidate: periodic, operates over ALL skills (out-of-band GC)
```
Edge rationale: transcription consumes extraction output, and the diarization
fallback re-runs transcription — tight coupling justifies keeping
transcribe+diarize in ONE skill and ordering media→transcription in the chain.

## Granularity decisions

- **Don't split media into 4 skills** (probe/extract/silence/chunk): one shared
  mental model (no-shell exec → 16 kHz mono → re-encode) and they're always
  touched together; splitting fragments context and forces cross-loading. → one
  `working-with-ffmpeg-media`.
- **Keep transcribe+diarize together**: different services (OpenAI API vs
  WhisperX CLI) but coupled by the fallback path; 2 skills would desync.
- **Orientation ≠ style**: different triggers ("where does X live" vs "I'm
  writing TS") and different verification signals (`build` vs `typecheck`), so a
  skill carries exactly ONE verification signal for clean evolution gating.
- **No one-big-skill**: a test edit must not load ffmpeg internals; per-domain
  skills keep injected context lean (the whole point of investing tokens up
  front).

## Verification & gating design (feeds Phase 4)

- Each skill dir holds `evals/` (routing assertions + the verification command)
  and, when validated, a fresh `.eval-pass` token written by
  `scripts/run-skill-evals.mjs`.
- The PreToolUse write-gate on `**/skills/**/SKILL.md` requires a fresh
  `.eval-pass` (bootstrap-aware: it allows writes while the bootstrap is still
  running, then enforces). This makes `<external_validation_rule>` a guarantee.
- "Promote-or-discard": an update ships only if the skill's verification signal
  is green and its eval set shows no correct→wrong flips.

## Gate self-check (Phase 2)

- [x] Catalog with type + triggers + WHY per skill.
- [x] Per-skill external verification signal named.
- [x] Composition/dependency graph with edge rationale.
- [x] Granularity justified; minimal-set discipline respected (8 skills).
