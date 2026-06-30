# Validation Report — trackscribe knowledge-skills system

> Phase-5 artifact. All checks are reproducible: re-run the commands shown.

## Gate summary (all green)

| Check | Command | Result |
|---|---|---|
| Skill linter | `node .agents/scripts/skill-lint.mjs` | **8/8 valid** |
| Routing evals | `node .agents/scripts/run-routing-evals.mjs` | **38/38** |
| Hook assertions | `node .agents/scripts/test-hooks.mjs` | **20/20** |
| Provenance | `node .agents/scripts/check-provenance.mjs --strict` | **20 citations, 0 stale, 0 missing** |
| Typecheck | `npm run typecheck` | green |
| Tests | `npm test` | 19/19 |

The provenance and hook checks each caught a **real defect** during validation
(3 bare `file.ts` citations missing the `src/` prefix; a stale test-fixture
token), which were fixed — evidence the gates work rather than rubber-stamp.

## Evolution pipeline — end-to-end

**ACCEPT (important + verified → persisted).** Added a dependency-hygiene note to
`following-typescript-conventions` (use a Node one-liner, not a rimraf dep),
backed by entailment against `package.json:30` + green `npm run typecheck`. The
eval runner wrote a HEAD-stamped `.eval-pass`; the write-gate (forced enforce)
returned **exit 0 (allow)**; committed as `8bb932c`.

**REJECT (clean but wrong → blocked).** A plausible but false claim ("Whisper
accepts 50 MB files", contradicting `src/chunk.ts:20`) has no external signal, so
no token is produced. The write-gate (forced enforce, no token) returned **exit 2
(block)** — a clean-but-wrong update cannot be persisted. This is the core
guarantee: importance/form never authorizes a write; only an external signal does.

**REGRESSION (promote-or-discard).** A temporary failing test made
`testing-trackscribe`'s `verification_signal` (`npm test`) fail; the eval runner
**withheld the token** (exit 1), so the write-gate blocked the update (exit 2).
Removing the failing test restored green and the token — the update is discarded
on regression, accepted only on a clean signal.

**Router lifecycle.** `project-router/SKILL.md` statically encodes: Brazilian-
Portuguese clarifying questions, `TASK_PLAN.md` creation, and its deletion on
completion. A lifecycle run confirmed `TASK_PLAN.md` is git-ignored, is deleted at
the end, and that the bootstrap artifacts (`project-analysis.md`, `skill-map.md`,
`catalog.md`, `.bootstrap-state.json`) are preserved.

## Success-criteria re-check

1. Lean skills, valid frontmatter (gerund name, ≤1024 desc) — ✅ linter-enforced (8/8).
2. Exactly one `project-router` — ✅.
3. Every task skill ends with `<evolution>`; no LEARNINGS files/buffers — ✅ (both task skills; `grep -L LEARNINGS` clean).
4. `meta-skill-evolution` + `meta-skill-consolidate` exist with verification/gating/conflict safeguards implemented as scripts+hooks — ✅.
5. Persisted knowledge respects rules a–g — ✅ (see below).
6. Knowledge is a reviewable draft; exact commands/constraints; no generic overviews; no unexplained ALL-CAPS imperatives — ✅ (the one remaining `ALWAYS`, in the router, is the load-bearing PT-BR requirement and is explained).
7. Portable: `.agents/skills/` source, `.claude/skills` symlink, frontmatter limited to name+description+metadata — ✅ (linter enforces key set).
8. Each phase → committed artifact — ✅ (commits `6364f75`, `f0a83b7`, `1b413d5`, `aa3d3c2`, plus this).
9. Router asks many PT questions, creates+deletes `TASK_PLAN.md`, never deletes bootstrap artifacts — ✅.
10. First action = repo-docs discovery — ✅ (Phase 1 grounding, `project-analysis.md`).
11. Deterministic enforcement (linter + 3 hooks) — ✅.
12. Runs to completion across 5 phases; Stop hook + state file prevent premature termination; clean-but-wrong blocked — ✅.

## Design-principles re-check (a–g)

- **a IMPORTANT/SELECTIVE** — skills encode non-obvious gotchas (lazy client, NodeNext `.js`, Node-20 glob, WhisperX silent failure), not trivia.
- **b MINIMAL + scope** — every item carries its validity scope ("Scope: …", "in `merge.ts`").
- **c CITED** — `file:line@hash` provenance; checked by `check-provenance.mjs` (20, all resolve).
- **d CLEAN STATE / git history** — no dates/changelogs inside skills; history is in git.
- **e EXTERNAL VERIFICATION before persist** — the write-gate + eval token make it deterministic (REJECT case).
- **f REGRESSION GATING** — promote-or-discard (REGRESSION case).
- **g CONFLICT DETECTION** — the pipeline replaces (not appends) and blocks untrusted/injected rules; documented in `meta-skill-evolution`.

## Gaps & honest limitations

- **Routing evals are a deterministic keyword proxy**, not the model's real selection; they prove each description carries the discriminating keywords (and near-misses don't). True routing remains model-driven.
- **Hooks are captured by Claude Code at session start**, so they may not be live in the very session that authored them; their correctness is proven by direct invocation (`test-hooks.mjs`, 20/20) and they take effect for subsequent sessions — the intended model.
- **Token freshness is HEAD-based**: after a commit, tokens go stale and must be regenerated before the next skill edit. This is intentional (ties validation to a code state) but means routine skill edits run their eval first.
- **The model still makes the importance/entailment judgments** in steps 1–3 of the pipeline; the deterministic layer (eval signal → token → write-gate) is what prevents an unverified judgment from being persisted.

## Reproduce everything
```
node .agents/scripts/skill-lint.mjs
node .agents/scripts/run-routing-evals.mjs
node .agents/scripts/test-hooks.mjs
node .agents/scripts/check-provenance.mjs --strict
npm run typecheck && npm test
```
