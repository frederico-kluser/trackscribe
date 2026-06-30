# AGENTS.md

Single source of truth for agents working in trackscribe. Kept short on purpose
(long always-on files reduce adherence). Deep, on-demand knowledge lives in the
skills — see below.

## Commands
- build: `npm run build`
- typecheck: `npm run typecheck`
- test: `npm test` — single file: `node --import tsx --test test/<name>.test.ts`
- lint/format: none configured. The quality gate is `npm run typecheck` + `npm test`.

## Rules (only what differs from language defaults AND is not tooling-guaranteed)
- **No-shell process spawning.** Call external binaries via `run(bin, args[])` in `src/exec.ts` (array args, no shell). Why: untrusted paths can't be injected; consequence: no pipes/redirects (use tool flags, e.g. ffmpeg `-f null -`). Scope: every ffmpeg/ffprobe/whisperx call.
- **Lazy OpenAI client + env order.** Import `./env.js` first; construct `new OpenAI()` lazily. Why: a stale `OPENAI_API_KEY` in the shell shadows the project `.env`. Scope: any code reading `process.env` or building an API client.
- **Never dedupe cross-track overlaps.** Segments from different tracks legitimately overlap; preserve them. Scope: `merge.ts`.
- (Everything else — strict types, `.js` import extensions, `import type` — is enforced by `npm run typecheck`; just run it.)

## Skills
Every task goes through `.agents/skills/project-router` (asks PT-BR questions, writes a disposable `TASK_PLAN.md`, assembles the skill chain, runs verified evolution on completion). Catalog: `.agents/skills/catalog.md`.

## Security
- Never read or commit `.env` or `secrets/**`.
- Hooks (`.claude/settings.json`) enforce, deterministically: a SKILL.md write-gate (no skill write without a green eval token), a Stop completion gate, and a secret/destructive-command guard. Rationale & tests: `.agents/hooks/` + `.agents/scripts/test-hooks.mjs`.
