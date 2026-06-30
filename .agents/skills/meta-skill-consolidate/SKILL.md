---
name: meta-skill-consolidate
description: Periodic garbage-collection of the skill library — deduplicate, resolve conflicts, detect provenance staleness, enforce per-skill token budgets, and retire obsolete content. Use on a schedule or when skills have grown noisy or contradictory. Every consolidation runs the regression gate before promoting, emits a diff for review, and requires a second-opinion review before any deletion.
metadata:
  type: meta
  verification_signal: node .agents/scripts/skill-lint.mjs
---
# Meta-skill: consolidate (GC)

## When to use
Out-of-band, periodically, or when the library shows redundancy/contradictions/staleness. Not part of a normal task chain.

## Procedure
1. **Scan** all `.agents/skills/*/SKILL.md`.
2. **Deduplicate** redundant passages by pattern-key; keep the single highest-signal version.
3. **Conflict resolution** (re-run): if two passages contradict, decide which is current and REPLACE the stale one (never keep both).
4. **Staleness by provenance:** for each `file:line@hash` citation, check whether the cited file's content/commit changed. If so, mark the passage "to revalidate," then either revalidate against the current source (update the citation) or retire it. Use `node .agents/scripts/check-provenance.mjs` to list drifted citations.
5. **Token budget:** enforce the lean target (body < 500 lines / ~5k tokens; median ~1,400 tokens). Trim low-signal prose; move long material to `references/`.
6. **Remove obsolete content.**

## Safeguards (mandatory)
- **Regression gate before promoting:** run `node .agents/scripts/run-skill-evals.mjs` across affected skills; promote only with no correct→wrong flips.
- **Emit a diff for review** — never silently rewrite the library.
- **Deletions require a SECOND-OPINION** review (a fresh-context subagent must concur) and respect the reversibility guardrail: pause for confirmation before deleting a skill or doing a structural rewrite. Git provides rollback.
- The same write-gate applies: edits need a fresh `.eval-pass` token, so consolidation cannot persist an unverified change.
