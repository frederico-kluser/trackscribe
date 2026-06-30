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
import { setDebug } from "./debug.js";

const HELP = `trackscribe — multi-track MKV → speaker-attributed JSON

USAGE
  trackscribe <input.mkv> [options]

OPTIONS
  -o, --out <file>        Output JSON path (default: unified.json; "-" = stdout)
      --turns             Also write a grouped "turns" view (default: turns.json)
      --format <wav|mp3>  Extraction format (default: wav)
      --diarize           Diarize EVERY audio track via pyannoteAI cloud (needs PYANNOTEAI_API_KEY)
      --system-track <N>  Track id used for the friendly fallback label (default: 1)
      --min-speakers <N>  Lower bound for diarization clustering (hint, applied to all tracks)
      --max-speakers <N>  Upper bound for diarization clustering (hint, applied to all tracks)
      --verbose           Verbose debug logging to stderr (probe, chunks, jobs, polling, alignment)
  -h, --help              Show this help

ENVIRONMENT
  OPENAI_API_KEY          Required for whisper-1 transcription
  PYANNOTEAI_API_KEY      Required only for --diarize (cloud diarization, precision-2)
  PYANNOTEAI_BASE_URL     Optional override of the pyannoteAI base URL

EXAMPLES
  trackscribe call.mkv
  trackscribe call.mkv -o transcript.json --turns
  trackscribe call.mkv --diarize --verbose
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
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
    process.exit(values.help ? 0 : 1);
  }

  const input = positionals[0]!;
  setDebug(!!values.verbose);
  const format = values.format === "mp3" ? "mp3" : "wav";
  if (values.format !== "wav" && values.format !== "mp3") {
    throw new Error(`--format must be "wav" or "mp3" (got "${values.format}").`);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[trackscribe] OPENAI_API_KEY is not set — transcription will fail. Add it to .env or your environment.",
    );
  }
  if (values.diarize && !process.env.PYANNOTEAI_API_KEY) {
    console.warn(
      "[trackscribe] --diarize was requested but PYANNOTEAI_API_KEY is not set; tracks will be transcribed WITHOUT diarization.",
    );
  }

  const opts: PipelineOptions = {
    diarize: values.diarize,
    format,
    pyannoteApiKey: process.env.PYANNOTEAI_API_KEY,
    pyannoteBaseUrl: process.env.PYANNOTEAI_BASE_URL,
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
