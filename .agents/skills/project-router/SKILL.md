---
name: project-router
description: Routes EVERY implementation task in this codebase to the correct skills BEFORE any step. Use whenever the user asks for any change, fix, feature, analysis, or refactor, even if they do not mention skills. Always interacts with the user in Brazilian Portuguese, asks many clarifying questions first, and manages a disposable TASK_PLAN.md.
metadata:
  type: router
---
# Project Router

IMPORTANT: all questions and interactions with the user are ALWAYS in BRAZILIAN PORTUGUESE. The router's internal reasoning and skill bodies are English; only the user-facing turns are Portuguese.

## When to use
At the very start of EVERY task in this repo — any change/fix/feature/analysis/refactor — before reading or editing code, even if the user never mentions skills.

## Protocol (run BEFORE any work)
1. **ASK A LOT (in Portuguese).** Before anything, ask SEVERAL clarifying questions to pin down: exact scope, expected inputs/outputs, constraints, edge cases, acceptance criteria, and what explicitly NOT to do. Do not advance while the task is underspecified. Suggested openers (PT-BR):
   - "Qual é exatamente o escopo? O que está dentro e o que está fora desta tarefa?"
   - "Quais são as entradas e saídas esperadas, com um exemplo concreto?"
   - "Quais restrições e casos de borda eu devo considerar?"
   - "Como vamos saber que terminou? Qual é o critério de aceitação verificável?"
   - "Há algo que eu NÃO devo mexer ou mudar?"
2. **Create `TASK_PLAN.md` (in Portuguese)** at the repo root, with the agreed plan, steps, and acceptance criteria. It is DISPOSABLE.
3. **Classify the task:** domain(s) touched, type (bug/feature/refactor/analysis), complexity.
4. **Consult `.agents/skills/catalog.md`** and select the relevant knowledge + task skills. On ambiguity, prefer the most domain-specific skill.
5. **Assemble the skill CHAIN** (order + what can run in parallel via isolated-context subagents). Default order: `understanding-trackscribe-architecture` → `following-typescript-conventions` → domain skill(s) → `testing-trackscribe`.
6. **Load the selected skills' knowledge BEFORE implementing.**
7. **Execute the chain following `TASK_PLAN.md`.** End every code change by running `npm run typecheck` and `npm test`.
8. **ON COMPLETION:** (a) run each involved TASK skill's registo de aprendizado (memória CoALA local) (the verified memory pipeline); for knowledge-skill updates or a new area, invoke a memória CoALA local (`coala.py add`). (b) **DELETE `TASK_PLAN.md`** — it must not remain in the repo.

## Rules
- If no skill covers the task, invoke the local CoALA memory (`coala.py add`) to PROPOSE a new skill (a draft for human review, never a direct publish).
- Skills with broad side effects (deploy, structural rewrites) are NOT auto-invocable without explicit user confirmation.
- Never skip the evolution step on completion. Never leave `TASK_PLAN.md` behind.
- `TASK_PLAN.md` is disposable and deleted at the end. The bootstrap artifacts (`.agents/artifacts/project-analysis.md`, `skill-map.md`, `validation-report.md`, `.agents/skills/catalog.md`, `.agents/skills/.bootstrap-state.json`) are NOT — never delete them.
