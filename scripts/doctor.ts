/**
 * Preflight "doctor": validate everything needed for a live run BEFORE spending
 * credits. Checks Node, ffmpeg/ffprobe, the two API keys, OpenAI + pyannoteAI
 * connectivity (FREE endpoints — `models.list` and `GET /v1/test`, no
 * transcription/diarization job), and, if a media path is given, probes it
 * (tracks/codecs/duration/size) and prints a rough cost estimate.
 *
 * Usage: `npm run doctor [path/to/video.mkv]`. Exit 0 = ready, 1 = something off.
 *
 * ---
 *
 * "Doctor" de preflight: valida tudo (Node, ffmpeg, chaves, conectividade OpenAI
 * + pyannoteAI via endpoints grátis) ANTES de gastar crédito; opcionalmente faz
 * probe do vídeo e estima custo. Uso: `npm run doctor [video.mkv]`.
 */
import "../src/env.js";
import OpenAI from "openai";
import { run, BinaryNotFoundError } from "../src/exec.js";
import { PyannoteClient, PyannoteError } from "../src/pyannote.js";
import { probeAudioTracks } from "../src/probe.js";
import { probeDurationSec } from "../src/chunk.js";

let failures = 0;
const ok = (m: string): void => void process.stdout.write(`  ✓ ${m}\n`);
const warn = (m: string): void => void process.stdout.write(`  ! ${m}\n`);
const fail = (m: string): void => {
  failures++;
  process.stdout.write(`  ✗ ${m}\n`);
};
const section = (t: string): void => void process.stdout.write(`\n${t}\n`);

function checkNode(): void {
  section("Runtime");
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) ok(`Node ${process.versions.node} (>= 20)`);
  else fail(`Node ${process.versions.node} — needs >= 20`);
}

async function checkBinary(bin: string): Promise<void> {
  try {
    const { stdout, stderr } = await run(bin, ["-version"]);
    const line = (stdout || stderr).split("\n")[0] ?? bin;
    ok(`${bin}: ${line}`);
  } catch (err) {
    if (err instanceof BinaryNotFoundError) fail(`${bin} not on PATH — ${err.hint}`);
    else fail(`${bin} check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function keyStatus(name: string): string | undefined {
  const v = process.env[name];
  if (v && v.trim()) {
    ok(`${name}: set (length ${v.length})`);
    return v;
  }
  fail(`${name}: MISSING — add it to .env`);
  return undefined;
}

async function checkOpenAI(key: string | undefined): Promise<void> {
  section("OpenAI (whisper-1 transcription)");
  if (!key) {
    warn("skipped — OPENAI_API_KEY missing");
    return;
  }
  try {
    const models = await new OpenAI({ apiKey: key }).models.list();
    const hasWhisper = models.data.some((m) => m.id === "whisper-1");
    ok(`API key valid (${models.data.length} models)${hasWhisper ? ", whisper-1 available" : ""}`);
    if (!hasWhisper) warn("whisper-1 not listed for this account — transcription may fail");
  } catch (err) {
    fail(`OpenAI auth failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function checkPyannote(key: string | undefined): Promise<void> {
  section("pyannoteAI (cloud diarization)");
  if (!key) {
    warn("skipped — PYANNOTEAI_API_KEY missing (needed for --diarize)");
    return;
  }
  try {
    const client = new PyannoteClient(key, process.env.PYANNOTEAI_BASE_URL);
    const res = await client.testAuth();
    ok(`API key valid (GET /v1/test → ${res.status ?? "ok"})`);
  } catch (err) {
    if (err instanceof PyannoteError) {
      fail(`pyannoteAI auth failed (HTTP ${err.status ?? "?"}): ${err.message}`);
    } else {
      fail(`pyannoteAI check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function checkMedia(file: string): Promise<void> {
  section(`Media: ${file}`);
  if (!/\.mkv$/i.test(file)) warn("not an .mkv — trackscribe targets multi-track MKV");
  let duration = 0;
  try {
    duration = await probeDurationSec(file);
  } catch (err) {
    fail(`cannot probe (missing/unreadable?): ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  let tracks;
  try {
    tracks = await probeAudioTracks(file);
  } catch (err) {
    fail(`ffprobe failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (tracks.length === 0) {
    fail("no audio tracks found");
    return;
  }
  ok(`${tracks.length} audio track(s), duration ${duration.toFixed(1)}s (${(duration / 60).toFixed(1)} min)`);
  for (const t of tracks) {
    process.stdout.write(
      `      track ${t.audioIndex}: ${t.codec}, ${t.channels}ch` +
        `${t.title ? `, title="${t.title}"` : ""}${t.language ? `, lang=${t.language}` : ""}\n`,
    );
  }
  const minutes = duration / 60;
  const whisperUsd = minutes * tracks.length * 0.006;
  const pyannoteEur = (duration / 3600) * tracks.length * 0.1;
  warn(
    `rough estimate (CONFIRM pricing): whisper-1 ~$${whisperUsd.toFixed(3)} ` +
      `+ ~€${pyannoteEur.toFixed(3)} pyannote (if --diarize), over ${tracks.length} track(s)`,
  );
}

async function main(): Promise<void> {
  process.stdout.write("trackscribe doctor — preflight checks\n");
  checkNode();
  section("External binaries");
  await checkBinary("ffmpeg");
  await checkBinary("ffprobe");
  section("API keys (.env)");
  const openaiKey = keyStatus("OPENAI_API_KEY");
  const pyannoteKey = keyStatus("PYANNOTEAI_API_KEY");
  await checkOpenAI(openaiKey);
  await checkPyannote(pyannoteKey);
  const media = process.argv[2];
  if (media) {
    await checkMedia(media);
  } else {
    section("Media");
    warn("no media path — run `npm run doctor path/to/video.mkv` to probe one");
  }
  process.stdout.write(
    `\n${failures === 0 ? "✓ all critical checks passed — ready for a live run" : `✗ ${failures} check(s) failed`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `doctor crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
