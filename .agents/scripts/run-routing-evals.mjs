#!/usr/bin/env node
/**
 * Routing evals. For every skill's evals/routing.json, checks that each
 * `must_trigger` query routes to that skill and each `must_not_trigger` query
 * does not — using a deterministic keyword-overlap proxy across ALL skill
 * descriptions (the real selection is model-driven; this proves the descriptions
 * carry the discriminating keywords). A skill is "triggered" by a query when its
 * overlap score is positive AND tied for the maximum across skills.
 *
 * Exit 0 = all routing assertions pass; 1 = a failure.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
// Keep words ≥3 chars minus generic function words, so short domain tokens
// (fix, bug, api, cli, mkv, run, env) count while "the/and/for" don't.
const STOP = new Set(
  ("a an the and or of to in on for do does did is are be you your this that with how what why when " +
    "where new not no any per via use used my me we us so as at by from into it its i if can should " +
    "one more than even first many them they then here there about over only").split(/\s+/),
);
const tokenize = (s) =>
  new Set((s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((t) => !STOP.has(t)));

const skills = readdirSync(SKILLS).filter((d) => {
  const p = join(SKILLS, d);
  return statSync(p).isDirectory() && existsSync(join(p, "SKILL.md"));
});

const desc = {};
for (const s of skills) {
  const text = readFileSync(join(SKILLS, s, "SKILL.md"), "utf8");
  const m = /^description:\s?(.*)$/m.exec(text.slice(0, text.indexOf("\n---", 3)));
  desc[s] = tokenize(m ? m[1] : "");
}

function scores(query) {
  const q = tokenize(query);
  const out = {};
  for (const s of skills) out[s] = [...q].filter((t) => desc[s].has(t)).length;
  return out;
}
function triggered(query, skill) {
  const sc = scores(query);
  const max = Math.max(...Object.values(sc));
  return sc[skill] > 0 && sc[skill] === max;
}

let failed = 0;
let total = 0;
for (const s of skills) {
  const rp = join(SKILLS, s, "evals", "routing.json");
  if (!existsSync(rp)) continue;
  const r = JSON.parse(readFileSync(rp, "utf8"));
  for (const q of r.must_trigger ?? []) {
    total++;
    const ok = triggered(q, s);
    if (!ok) { failed++; console.error(`✗ [${s}] must_trigger NOT routed: "${q}"  scores=${JSON.stringify(scores(q))}`); }
  }
  for (const q of r.must_not_trigger ?? []) {
    total++;
    const ok = !triggered(q, s);
    if (!ok) { failed++; console.error(`✗ [${s}] must_not_trigger WAS routed: "${q}"  scores=${JSON.stringify(scores(q))}`); }
  }
}
console.log(`${total - failed}/${total} routing assertions passed`);
process.exit(failed ? 1 : 0);
