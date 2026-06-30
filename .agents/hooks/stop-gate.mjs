#!/usr/bin/env node
/**
 * Bootstrap Stop-gate hook.
 *
 * Blocks turn termination (exit 2) while any bootstrap phase in
 * .agents/skills/.bootstrap-state.json is not { done:true, gate_passed:true },
 * so the autonomous build cannot stop half-finished.
 *
 * Fail-safe by design — it ALWAYS allows termination (exit 0) when:
 *   - the Stop-hook chain is already active (stop_hook_active === true) → no loops,
 *   - the state file is missing or unparseable → never trap an unrelated session,
 *   - every phase is green.
 * Exit codes: 0 = allow stop, 2 = block stop (stderr is fed back to the agent).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function findState() {
  const candidates = [];
  const root = process.env.CLAUDE_PROJECT_DIR;
  if (root) candidates.push(join(root, ".agents/skills/.bootstrap-state.json"));
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    candidates.push(join(dir, ".agents/skills/.bootstrap-state.json"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const c of candidates) {
    try {
      return JSON.parse(readFileSync(c, "utf8"));
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

let payload = {};
try {
  const raw = readStdin();
  payload = raw ? JSON.parse(raw) : {};
} catch {
  payload = {};
}

// Loop guard: never block a stop that is itself the result of a prior block.
if (payload.stop_hook_active === true) process.exit(0);

const state = findState();
if (!state || !Array.isArray(state.phases)) process.exit(0); // fail-safe: allow

const incomplete = state.phases.filter(
  (p) => !(p.done === true && p.gate_passed === true),
);
if (incomplete.length === 0) process.exit(0); // all green: allow

const names = incomplete.map((p) => `#${p.id} ${p.name}`).join("; ");
process.stderr.write(
  `[bootstrap stop-gate] Mission incomplete — ${incomplete.length} phase(s) not green: ${names}. ` +
    `Finish each phase's gate, then set done+gate_passed in ` +
    `.agents/skills/.bootstrap-state.json before stopping.\n`,
);
process.exit(2);
