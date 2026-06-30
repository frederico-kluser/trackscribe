#!/usr/bin/env node
/**
 * PreToolUse write-gate for SKILL.md edits.
 *
 * Blocks (exit 2) any Edit/Write/MultiEdit to a `**​/skills/**​/SKILL.md` unless a
 * fresh `.eval-pass` token sits next to it, stamped with the current git HEAD —
 * i.e. the skill's verification signal went green at this code state (written by
 * run-skill-evals.mjs). This makes "no skill write without an external signal" a
 * deterministic guarantee, defeating clean-but-wrong persistence.
 *
 * Bootstrap-aware: while .bootstrap-state.json still has incomplete phases (the
 * initial library is being authored), it ALLOWS edits. It only ENFORCES once the
 * bootstrap is complete (all phases done) — normal operation. Missing state →
 * allow (fail-safe). Non-SKILL.md paths → allow.
 *
 * Exit 0 = allow, exit 2 = block.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { execSync } from "node:child_process";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

let payload = {};
try {
  payload = JSON.parse(readStdin() || "{}");
} catch {
  process.exit(0); // can't parse → fail open
}

const filePath = payload?.tool_input?.file_path || payload?.tool_input?.path || "";
// Only gate SKILL.md files under a skills/ tree.
if (!/(^|\/)skills\/[^/]+\/SKILL\.md$/.test(filePath)) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Enforce only when bootstrap is complete (or, optionally, forced for tests).
function bootstrapComplete() {
  const candidates = [
    join(projectDir, ".agents/skills/.bootstrap-state.json"),
    join(dirname(dirname(filePath)), "..", ".bootstrap-state.json"),
  ];
  for (const c of candidates) {
    try {
      const st = JSON.parse(readFileSync(c, "utf8"));
      if (Array.isArray(st.phases)) {
        return st.phases.every((p) => p.done === true && p.gate_passed === true);
      }
    } catch {
      /* try next */
    }
  }
  return null; // no state found
}

const force = process.env.SKILL_WRITE_GATE_FORCE === "1";
const complete = bootstrapComplete();
if (!force) {
  if (complete === null) process.exit(0); // no state → fail-safe allow
  if (complete === false) process.exit(0); // bootstrap in progress → allow authoring
}

// ENFORCE: require a fresh, HEAD-matched token.
const skillDir = dirname(filePath);
const skill = basename(skillDir);
const token = join(skillDir, ".eval-pass");
let head = "";
try {
  head = execSync("git rev-parse --short HEAD", { cwd: projectDir }).toString().trim();
} catch {
  /* not a git repo */
}

let ok = false;
if (existsSync(token)) {
  try {
    const t = JSON.parse(readFileSync(token, "utf8"));
    ok = t.ok === true && (!head || t.head === head);
  } catch {
    ok = false;
  }
}

if (ok) process.exit(0);

process.stderr.write(
  `[skill-write-gate] Blocked edit to ${skill}/SKILL.md: no fresh validation token.\n` +
    `Run \`node .agents/scripts/run-skill-evals.mjs ${skill}\` — it persists a\n` +
    `.eval-pass token only when the skill's verification_signal is green at HEAD\n` +
    `(${head || "?"}). This enforces external verification before any skill write.\n`,
);
process.exit(2);
