/**
 * Side-effect module: load the project `.env` with `override: true` so a
 * project key WINS over a stale/invalid value already exported in the shell
 * profile (a real, previously-observed shadowing gotcha). Import this FIRST,
 * before anything reads `process.env` — and note that `transcribe.ts`
 * constructs the OpenAI client lazily so the override is in effect by then.
 *
 * ---
 *
 * Módulo de efeito colateral: carrega o `.env` do projeto com `override: true`
 * para que a chave do projeto VENÇA uma chave obsoleta exportada no perfil do
 * shell. Importe-o ANTES de qualquer leitura de `process.env`.
 */
import { config } from "dotenv";

// `quiet: true` suppresses dotenv v17's startup banner, which would otherwise
// pollute stdout (and corrupt JSON written via `--out -`).
config({ override: true, quiet: true });
