#!/usr/bin/env node
/**
 * Per-skill eval/regression runner — the engine behind the verified memory
 * pipeline's gating (step 4). Usage: `node .agents/scripts/run-skill-evals.mjs <skill>`.
 *
 * It (1) runs the skill's routing assertions (evals/routing.json, a deterministic
 * keyword proxy for "the description would route this query here") and (2) runs
 * the skill's `verification_signal` command — the EXTERNAL correctness signal.
 * Only if BOTH are green does it write the `.eval-pass` token (stamped with the
 * current git HEAD). The PreToolUse write-gate requires that fresh token, so a
 * skill change cannot be persisted without an external signal — promote-or-discard.
 *
 * Exit 0 = green (+ token written); exit 1 = failed (+ stale token removed).
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS = join(ROOT, ".agents", "skills");

function die(msg) {
  console.error(`run-skill-evals: ${msg}`);
  process.exit(1);
}

const skill = process.argv[2];
if (!skill) die("usage: run-skill-evals.mjs <skill-name>");
const dir = join(SKILLS, skill);
const skillMd = join(dir, "SKILL.md");
if (!existsSync(skillMd)) die(`no SKILL.md for "${skill}"`);

// --- parse frontmatter (minimal) ---
const text = readFileSync(skillMd, "utf8");
const fmEnd = text.indexOf("\n---", 3);
const fm = text.slice(3, fmEnd);
let description = "";
let signal = "";
let inMeta = false;
for (const line of fm.split("\n")) {
  if (/^description:/.test(line)) description = line.replace(/^description:\s?/, "");
  else if (/^metadata:/.test(line)) inMeta = true;
  else if (inMeta && /^\s+verification_signal:/.test(line)) {
    signal = line.replace(/^\s+verification_signal:\s?/, "");
  }
}

const tokenize = (s) =>
  new Set((s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []));

// --- routing assertions (deterministic proxy) ---
const routingPath = join(dir, "evals", "routing.json");
let routingOk = true;
if (existsSync(routingPath)) {
  const routing = JSON.parse(readFileSync(routingPath, "utf8"));
  const descTokens = tokenize(description);
  for (const q of routing.must_trigger ?? []) {
    const overlap = [...tokenize(q)].filter((t) => descTokens.has(t)).length;
    if (overlap < 1) {
      routingOk = false;
      console.error(`  ✗ must_trigger has no keyword overlap with description: "${q}"`);
    }
  }
  for (const q of routing.must_not_trigger ?? []) {
    const overlap = [...tokenize(q)].filter((t) => descTokens.has(t)).length;
    if (overlap >= 2) {
      console.error(`  ! warn: must_not_trigger overlaps description (${overlap}): "${q}"`);
    }
  }
  console.log(`routing: ${routingOk ? "ok" : "FAILED"}`);
} else {
  console.log("routing: (no routing.json — skipped)");
}

// --- external verification signal ---
let signalOk = true;
if (signal) {
  console.log(`verification_signal: ${signal}`);
  try {
    execSync(signal, { cwd: ROOT, stdio: "inherit" });
  } catch {
    signalOk = false;
  }
} else {
  console.log("verification_signal: (none declared — e.g. router)");
}

const token = join(dir, ".eval-pass");
if (routingOk && signalOk) {
  let head = "unknown";
  try {
    head = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    /* not a git repo */
  }
  writeFileSync(token, JSON.stringify({ skill, head, signal, ok: true }) + "\n");
  console.log(`✓ ${skill}: green — wrote ${token} (head ${head})`);
  process.exit(0);
} else {
  if (existsSync(token)) rmSync(token);
  console.error(`✗ ${skill}: failed — token withheld (removed stale token if any)`);
  process.exit(1);
}
