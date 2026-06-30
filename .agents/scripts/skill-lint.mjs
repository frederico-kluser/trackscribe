#!/usr/bin/env node
/**
 * Deterministic skill linter. Enforces the authoring rules so "well-formed" is a
 * pass/fail signal, not a judgment call. Run: `node .agents/scripts/skill-lint.mjs`.
 * Exit 0 = all skills valid; exit 1 = at least one violation (prints them).
 *
 * Rules (see .agents/artifacts/skill-map.md and <skill_authoring_rules>):
 *  - frontmatter present; top-level keys ⊆ {name, description, metadata}
 *  - name: ^[a-z0-9]+(-[a-z0-9]+)*$, ≤64 chars; gerund (first token ends "ing")
 *    for type knowledge|task (router/meta keep canonical names → exempt)
 *  - description: present, ≤1024 chars, third-person-ish (not starting with a verb-less stub)
 *  - metadata.type ∈ {knowledge,task,router,meta}; verification_signal required
 *    for knowledge|task|meta
 *  - body < 500 lines; contains "## When to use"
 *  - knowledge|task cite provenance (a `@<hash>` or `file:line` reference)
 *  - task skills contain an "<evolution>" section
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
const TYPES = new Set(["knowledge", "task", "router", "meta"]);
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function parseFrontmatter(text) {
  if (!text.startsWith("---")) return { error: "no frontmatter (must start with ---)" };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { error: "unterminated frontmatter" };
  const fmText = text.slice(3, end).replace(/^\n/, "");
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const top = {};
  const metadata = {};
  let inMeta = false;
  for (const line of fmText.split("\n")) {
    if (!line.trim()) continue;
    if (/^\S/.test(line)) {
      inMeta = false;
      const m = /^([A-Za-z_]+):\s?(.*)$/.exec(line);
      if (!m) continue;
      if (m[1] === "metadata") {
        inMeta = true;
        top.metadata = metadata;
      } else {
        top[m[1]] = m[2];
      }
    } else if (inMeta) {
      const m = /^\s+([A-Za-z_]+):\s?(.*)$/.exec(line);
      if (m) metadata[m[1]] = m[2];
    }
  }
  return { top, body };
}

function lintSkill(name, text) {
  const errs = [];
  const { error, top, body } = parseFrontmatter(text);
  if (error) return [error];

  const allowed = new Set(["name", "description", "metadata"]);
  for (const k of Object.keys(top)) {
    if (!allowed.has(k)) errs.push(`frontmatter has disallowed top-level key "${k}" (only name/description/metadata)`);
  }

  const type = top.metadata?.type;
  if (!type || !TYPES.has(type)) errs.push(`metadata.type missing or invalid (got "${type}")`);

  if (!top.name) errs.push("missing name");
  else {
    if (!NAME_RE.test(top.name)) errs.push(`name "${top.name}" must be lowercase-hyphen (^[a-z0-9-]+$)`);
    if (top.name.length > 64) errs.push(`name >64 chars`);
    if (top.name !== name) errs.push(`name "${top.name}" must match directory "${name}"`);
    const gerundExempt = type === "router" || type === "meta";
    if (!gerundExempt && !/ing$/.test(top.name.split("-")[0])) {
      errs.push(`name "${top.name}" must be gerund (first token ends in -ing) for type ${type}`);
    }
  }

  if (!top.description) errs.push("missing description");
  else if (top.description.length > 1024) errs.push(`description >1024 chars (${top.description.length})`);

  if (["knowledge", "task", "meta"].includes(type) && !top.metadata?.verification_signal) {
    errs.push(`metadata.verification_signal required for type ${type}`);
  }

  const lines = (body ?? "").split("\n").length;
  if (lines >= 500) errs.push(`body has ${lines} lines (must be < 500)`);
  if (!/##\s*When to use/i.test(body ?? "")) errs.push('missing "## When to use" section');

  if (["knowledge", "task"].includes(type)) {
    const hasProvenance = /@[0-9a-f]{7,}/.test(body) || /[\w./-]+:\d+/.test(body);
    if (!hasProvenance) errs.push("knowledge/task skill must cite provenance (`file:line` or `@<hash>`)");
  }
  if (type === "task" && !/<evolution>/i.test(body)) {
    errs.push("task skill must contain an <evolution> section");
  }
  return errs;
}

function main() {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`skills dir not found: ${SKILLS_DIR}`);
    process.exit(1);
  }
  const dirs = readdirSync(SKILLS_DIR).filter((d) => {
    const p = join(SKILLS_DIR, d);
    return statSync(p).isDirectory() && existsSync(join(p, "SKILL.md"));
  });
  let failed = 0;
  let checked = 0;
  for (const d of dirs.sort()) {
    checked++;
    const errs = lintSkill(d, readFileSync(join(SKILLS_DIR, d, "SKILL.md"), "utf8"));
    if (errs.length) {
      failed++;
      console.error(`✗ ${d}`);
      for (const e of errs) console.error(`    - ${e}`);
    } else {
      console.log(`✓ ${d}`);
    }
  }
  console.log(`\n${checked - failed}/${checked} skills valid`);
  process.exit(failed ? 1 : 0);
}

main();
