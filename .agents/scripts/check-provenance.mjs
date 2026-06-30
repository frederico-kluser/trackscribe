#!/usr/bin/env node
/**
 * Provenance staleness checker (used by meta-skill-consolidate, step 4).
 *
 * Scans every SKILL.md for `path/file:line@hash` citations and, for each, asks
 * git whether the cited FILE changed between that commit and HEAD
 * (`git diff --quiet <hash> HEAD -- <path>`). A citation is flagged "revalidate"
 * only when the source actually moved — not merely because HEAD advanced — so
 * the signal stays low-noise. Missing cited files are reported as errors.
 *
 * Report-only by default (exit 0). Pass `--strict` to exit 1 when anything is
 * flagged (useful in a consolidation gate).
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS = join(ROOT, ".agents", "skills");
const strict = process.argv.includes("--strict");
// Matches single-line and range/list citations: path:line@hash, path:line-line@hash, path:l1,l2@hash
const CITE = /([\w./-]+):(\d+(?:[-,]\d+)*)@([0-9a-f]{7,40})/g;

function changedSince(hash, path) {
  const r = spawnSync("git", ["diff", "--quiet", `${hash}`, "HEAD", "--", path], { cwd: ROOT });
  // exit 0 = no change, 1 = changed, >1 = error (e.g. unknown rev) → treat as revalidate
  return r.status !== 0;
}

let flagged = 0;
let missing = 0;
let total = 0;
const dirs = readdirSync(SKILLS).filter(
  (d) => statSync(join(SKILLS, d)).isDirectory() && existsSync(join(SKILLS, d, "SKILL.md")),
);
for (const d of dirs) {
  const body = readFileSync(join(SKILLS, d, "SKILL.md"), "utf8");
  const seen = new Set();
  let m;
  while ((m = CITE.exec(body))) {
    const [, path, , hash] = m;
    const key = `${path}@${hash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total++;
    if (!existsSync(join(ROOT, path))) {
      missing++;
      console.error(`✗ [${d}] cited file missing: ${path}`);
      continue;
    }
    if (changedSince(hash, path)) {
      flagged++;
      console.error(`! [${d}] revalidate: ${path} changed since @${hash}`);
    }
  }
}
let head = "?";
try { head = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch {}
console.log(`\nprovenance: ${total} citations, ${flagged} to revalidate, ${missing} missing (HEAD ${head})`);
process.exit(strict && (flagged || missing) ? 1 : 0);
