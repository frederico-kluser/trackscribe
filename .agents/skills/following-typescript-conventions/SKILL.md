---
name: following-typescript-conventions
description: Encodes trackscribe's TypeScript/ESM conventions and the infra gotchas that tsc cannot catch. Use whenever you write or edit any .ts file, add an import, spawn an external process, read process.env, or touch the OpenAI client — even for a one-line change. The verification signal is `npm run typecheck`; run it before considering an edit done.
metadata:
  type: knowledge
  verification_signal: npm run typecheck
---
# Following trackscribe TypeScript conventions

## When to use
Any `.ts` edit; adding imports; spawning ffmpeg/ffprobe/whisperx; reading env or secrets; constructing/using the OpenAI client.

## Injected knowledge

**Most rules here are tooling-guaranteed — point to the check, don't memorize prose.** The single source of truth is `npm run typecheck` (`tsc` strict, `tsconfig.json:12-16@1a7f821`). It enforces: strict mode, `noUncheckedIndexedAccess` (use `arr[i]!` or a guard), `import type` for type-only imports (`verbatimModuleSyntax`), and `.js` extensions on every relative import (`NodeNext`). If typecheck is green, these are satisfied — so just run it.

The high-value items below are the ones `tsc` does NOT catch:

1. **No-shell process spawning (security + correctness).** Never use `child_process.exec` or a shell string. Every binary goes through `run(bin, args[])` in `src/exec.ts:61-88@1a7f821` (array args, no shell) → untrusted paths can't be shell-injected. Consequence: no pipes/redirects; when you'd reach for them, use a tool flag instead (e.g. ffmpeg's `-f null -` for silencedetect, `src/silence.ts:48-57@1a7f821`). Errors are typed: `BinaryNotFoundError` (ENOENT) vs `CommandFailedError` (non-zero) — catch by `instanceof`.

2. **Lazy OpenAI client + import order (the shadowing gotcha).** `src/index.ts:8@1a7f821` imports `"./env.js"` FIRST; `src/env.ts:14-18@1a7f821` runs `dotenv.config({ override: true, quiet: true })`; and `src/transcribe.ts:43-47@1a7f821` builds `new OpenAI()` LAZILY (first use), never at module top. Why all three: a stale `OPENAI_API_KEY` in the shell profile would otherwise shadow the project `.env`. If you add code that reads `process.env` or constructs an API client, preserve this ordering — construct lazily, after env load. `quiet:true` also keeps dotenv's banner off stdout so `--out -` JSON stays clean.

3. **`.js` on relative imports, even for `.ts` siblings.** `import { run } from "./exec.js"` (not `./exec`). Required by NodeNext; forgetting it fails at runtime. (Tooling-guaranteed → `typecheck` catches it, but it's the #1 thing newcomers trip on, so it's called out.)

4. **No linter/formatter configured.** Style is `.editorconfig` (2-space, LF, final newline). Match the surrounding file; there is no eslint/prettier to auto-fix, so keep diffs clean by hand.

5. **Dependency hygiene — don't add a utility dep for what Node does natively.** The `clean` script is `node -e "fs.rmSync(...)"`, not a `rimraf`/`del-cli` dependency (`package.json:30@aa3d3c2`); runtime deps are only `openai` + `dotenv`. Prefer a Node one-liner over a small utility package. Scope: build/utility scripts.

**Default + escape hatch:** treat `npm run typecheck` as the gate for "is this written correctly." If it passes and the 4 non-tsc items above hold, the edit follows house conventions.

## Evolution note
Knowledge skill (no registo de aprendizado (memória CoALA local)). Updated only via memória CoALA local (`coala.py add`) after `npm run typecheck` (or the cited file) confirms the change; the stale passage is replaced, not appended.
