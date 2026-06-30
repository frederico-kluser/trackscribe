#!/usr/bin/env node
/**
 * PreToolUse security guardrail (fires for subagent tool calls too).
 *
 * Blocks (exit 2):
 *   - Read/Edit/Write of secret files: `.env` (and `.env.<x>` except `.env.example`),
 *     or anything under a `secrets/` directory.
 *   - Bash commands that READ those secrets (cat/head/tail/less/strings/…), or that
 *     are destructive (rm -rf of /, ~, $HOME, cwd or glob; fork bomb; mkfs; dd to a
 *     device; redirect to /dev/sd*; chmod -R 777 /; `curl|wget … | sh`;
 *     git history rewrite).
 *
 * Everything else → allow (exit 0). Parse/unknown errors → fail open (exit 0) so a
 * normal workflow is never bricked; the patterns are deliberately narrow.
 */
import { readFileSync } from "node:fs";

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
  process.exit(0);
}

const tool = payload?.tool_name || "";
const input = payload?.tool_input || {};

function isSecretPath(p) {
  if (!p) return false;
  const base = String(p).split(/[\\/]/).pop();
  if (base === ".env") return true;
  if (base.startsWith(".env.") && base !== ".env.example") return true;
  if (/(^|\/)secrets(\/|$)/.test(String(p))) return true;
  return false;
}

function block(reason) {
  process.stderr.write(`[security-guard] Blocked: ${reason}\n`);
  process.exit(2);
}

// File-path tools.
if (tool === "Read" || tool === "Edit" || tool === "Write" || tool === "MultiEdit") {
  if (isSecretPath(input.file_path || input.path)) {
    block(`access to a secret file (${input.file_path || input.path}). .env/secrets are off-limits.`);
  }
  process.exit(0);
}

if (tool === "Bash") {
  const cmd = String(input.command || "");

  // 1) reading secrets via a pager/printer
  const READERS = /\b(cat|less|more|head|tail|strings|xxd|od|nano|vim|vi|view|emacs|bat|tac)\b/;
  if (READERS.test(cmd)) {
    const tokens = cmd.split(/\s+/).map((t) => t.replace(/^["']|["']$/g, ""));
    if (tokens.some(isSecretPath)) block("a command that reads a secret file (.env/secrets).");
  }

  // 2) destructive patterns
  const DANGER = [
    /\brm\s+-[a-z]*[rf][a-z]*\s+(-[a-z]+\s+)*(\/(\s|$)|\/\*|~(\/|\s|$)|\$HOME|\*\s*$|\.\s*$)/, // rm -rf / ~ $HOME * .
    /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, // fork bomb
    /\bmkfs(\.|\b)/,
    /\bdd\b[^\n]*\bof=\/dev\//,
    />\s*\/dev\/(sd|nvme|hd|vd|disk)/,
    /\bchmod\s+-R?\s*0?777\s+\//,
    /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/,
    /\bgit\s+(filter-branch|filter-repo)\b/,
  ];
  for (const re of DANGER) {
    if (re.test(cmd)) block(`a destructive command matched ${re}.`);
  }
}

process.exit(0);
