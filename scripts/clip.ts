/**
 * Make a short clip of an MKV for cheap debug iterations, preserving ALL audio
 * tracks via stream copy (no re-encode, fast, lossless).
 *
 * Usage: `npm run clip -- <input.mkv> <seconds> [output.mkv]`
 *
 * ---
 *
 * Corta um trecho curto de um MKV para iterar barato no debug, preservando TODAS
 * as trilhas de áudio via stream copy. Uso: `npm run clip -- <in.mkv> <segundos> [out.mkv]`.
 */
import path from "node:path";
import { run } from "../src/exec.js";

async function main(): Promise<void> {
  const [input, secsArg, outArg] = process.argv.slice(2);
  if (!input || !secsArg) {
    process.stderr.write("usage: npm run clip -- <input.mkv> <seconds> [output.mkv]\n");
    process.exit(1);
  }
  const seconds = Number.parseInt(secsArg, 10);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    process.stderr.write(`seconds must be a positive integer (got "${secsArg}")\n`);
    process.exit(1);
  }
  const base = path.basename(input, path.extname(input));
  const out = outArg ?? path.join(path.dirname(input), `${base}.clip${seconds}s.mkv`);

  // -map 0 keeps every stream; -c copy avoids re-encoding (fast, all audio tracks intact).
  await run("ffmpeg", [
    "-hide_banner",
    "-y",
    "-i",
    input,
    "-t",
    String(seconds),
    "-map",
    "0",
    "-c",
    "copy",
    out,
  ]);
  process.stdout.write(`wrote ${out} (first ${seconds}s, all tracks copied)\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`clip failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
