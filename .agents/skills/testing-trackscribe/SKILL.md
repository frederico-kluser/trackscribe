---
name: testing-trackscribe
description: How to write and run trackscribe's tests — Node's node:test via tsx, no-network fixtures, and the Node-20 glob gotcha. Use whenever you add, modify, or run tests, see a CI test failure, or need the pure-mapper / synthesized-fixture pattern. The verification signal is `npm test`.
metadata:
  type: task
  verification_signal: npm test
---
# Testing trackscribe

## When to use
Writing/modifying/running tests; debugging a CI test failure; needing the no-network test pattern.

## Injected knowledge (the non-obvious parts)

- **Runner:** `node --import tsx --test test/*.test.ts` (`package.json:34@1a7f821`). The glob is **unquoted on purpose** — the shell expands it to explicit file paths. Node 20's test runner does NOT expand globs itself (Node 21+ does); a quoted `"test/**/*.test.ts"` fails on Node 20 with "Could not find …". Keep it shell-expanded and flat in `test/`.
- **Tests are typechecked too** (`tsconfig.json:23` includes `test`), so strict rules apply in tests — use `arr[i]!` for indexed access, `import type` for types, and `.js` import extensions (`import { run } from "../src/exec.js"`).
- **No network, ever.** Two patterns:
  1. **Pure mappers + fixtures:** import the exported pure function (`segmentsFromVerboseJson`, or `alignSegmentsToTurns`/`assessAlignedDiarization` from `align.ts`) and feed a JSON fixture from `test/fixtures/` (`test/transcribe.test.ts:14-28@1a7f821`, `test/align.test.ts`). Never call the OpenAI API in a test.
  2. **Synthesized media:** generate a fixture with ffmpeg `lavfi` (e.g. a 2-track MKV from `sine`/`anullsrc`) in a `fs.mkdtemp` dir and clean up with `t.after` (`test/integration.test.ts@1a7f821`).
- **Skip when a binary is absent**, don't fail: compute the predicate with top-level await, then gate the test — `test(name, { skip: !hasFfmpeg }, fn)` (`test/integration.test.ts:14-17@1a7f821`). Network clients are NOT binary-gated: the pyannoteAI client is tested by swapping the global `fetch` for a routed mock and restoring it in `t.after` (`test/pyannote.test.ts`), never the live API.

## Procedure (adding a test)
1. Put it in `test/<area>.test.ts` (flat — the glob is single-level).
2. `import { test } from "node:test"; import assert from "node:assert/strict";` and import code under test with `../src/<m>.js`.
3. Prefer a pure mapper + fixture; only synthesize media when you must exercise ffmpeg.
4. Gate any binary-dependent test with `{ skip: !hasX }`.
5. Run the verification signal: `npm test` (and `npm run typecheck`, since tests are typechecked).

## <evolution>
On task completion, run the memory pipeline (`.agents/skills/meta-skill-evolution`). Update THIS SKILL.md directly ONLY if the learning is important AND externally verified (here: `npm test` passed after the change, or the cited source supports it). Detect conflicts and REPLACE the stale passage; keep provenance and stay lean. If nothing important-and-verified emerged, write nothing. Commit the skill update separately.
