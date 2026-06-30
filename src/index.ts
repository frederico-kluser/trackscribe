#!/usr/bin/env node
/**
 * trackscribe CLI — multi-track MKV → speaker-attributed JSON.
 *
 * `./env.js` MUST be imported first (side effect: dotenv override) so the
 * OpenAI key is resolved correctly before any client is constructed.
 */
import "./env.js";
import { parseArgs } from "node:util";
import fs from "node:fs/promises";
import { runPipeline, type PipelineOptions } from "./pipeline.js";
import { groupIntoTurns } from "./merge.js";
import { BinaryNotFoundError, CommandFailedError } from "./exec.js";

const HELP = `trackscribe — multi-track MKV → speaker-attributed JSON

USAGE
  trackscribe <input.mkv> [options]

OPTIONS
  -o, --out <file>        Output JSON path (default: unified.json; "-" = stdout)
      --turns             Also write a grouped "turns" view (default: turns.json)
      --format <wav|mp3>  Extraction format (default: wav)
      --diarize           Diarize the system track with WhisperX (needs HF_TOKEN)
      --system-track <N>  Track id treated as the multi-speaker system mix (default: 1)
      --min-speakers <N>  Lower bound for diarization clustering
      --max-speakers <N>  Upper bound for diarization clustering
  -h, --help              Show this help

ENVIRONMENT
  OPENAI_API_KEY          Required for whisper-1 transcription
  HF_TOKEN                Required only for --diarize (WhisperX + pyannote)

EXAMPLES
  trackscribe call.mkv
  trackscribe call.mkv -o transcript.json --turns
  trackscribe call.mkv --diarize --system-track 1 --min-speakers 2 --max-speakers 4
`;

function parseIntOrUndefined(v: string | undefined, name: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isInteger(n)) throw new Error(`--${name} must be an integer (got "${v}").`);
  return n;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      turns: { type: "boolean", default: false },
      format: { type: "string", default: "wav" },
      diarize: { type: "boolean", default: false },
      "system-track": { type: "string" },
      "min-speakers": { type: "string" },
      "max-speakers": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
    process.exit(values.help ? 0 : 1);
  }

  const input = positionals[0]!;
  const format = values.format === "mp3" ? "mp3" : "wav";
  if (values.format !== "wav" && values.format !== "mp3") {
    throw new Error(`--format must be "wav" or "mp3" (got "${values.format}").`);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[trackscribe] OPENAI_API_KEY is not set — transcription will fail. Add it to .env or your environment.",
    );
  }
  if (values.diarize && !process.env.HF_TOKEN) {
    console.warn(
      "[trackscribe] --diarize was requested but HF_TOKEN is not set; the system track will be transcribed as a single \"Call\" speaker instead.",
    );
  }

  const opts: PipelineOptions = {
    diarize: values.diarize,
    format,
    hfToken: process.env.HF_TOKEN,
    systemTrack: parseIntOrUndefined(values["system-track"], "system-track"),
    minSpeakers: parseIntOrUndefined(values["min-speakers"], "min-speakers"),
    maxSpeakers: parseIntOrUndefined(values["max-speakers"], "max-speakers"),
  };

  const { segments, trackCount } = await runPipeline(input, opts);

  const json = JSON.stringify(segments, null, 2);
  const outPath = values.out ?? "unified.json";

  if (outPath === "-") {
    process.stdout.write(json + "\n");
  } else {
    await fs.writeFile(outPath, json + "\n", "utf8");
    console.warn(
      `[trackscribe] wrote ${segments.length} segments from ${trackCount} track(s) → ${outPath}`,
    );
  }

  if (values.turns) {
    const turns = groupIntoTurns(segments);
    const turnsPath = outPath === "-" ? "turns.json" : deriveTurnsPath(outPath);
    await fs.writeFile(turnsPath, JSON.stringify(turns, null, 2) + "\n", "utf8");
    console.warn(`[trackscribe] wrote ${turns.length} turns → ${turnsPath}`);
  }
}

function deriveTurnsPath(outPath: string): string {
  return outPath.replace(/\.json$/i, "") + ".turns.json";
}

main().catch((err: unknown) => {
  if (err instanceof BinaryNotFoundError || err instanceof CommandFailedError) {
    console.error(`[trackscribe] ${err.message}`);
  } else if (err instanceof Error) {
    console.error(`[trackscribe] ${err.message}`);
  } else {
    console.error("[trackscribe] unexpected error:", err);
  }
  process.exit(1);
});
