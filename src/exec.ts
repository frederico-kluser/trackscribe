/**
 * One typed wrapper around `execFile` for every external binary
 * (ffmpeg / ffprobe / whisperx). Array args, NO shell — so untrusted file paths
 * can never be interpreted as shell metacharacters. Maps the two failure modes
 * that callers care about: a missing binary (`ENOENT`) vs a non-zero exit.
 *
 * ---
 *
 * Wrapper tipado único sobre `execFile` para todo binário externo. Args em
 * array, SEM shell. Mapeia os dois modos de falha: binário ausente (`ENOENT`)
 * vs saída com código diferente de zero.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RunResult {
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Max captured output bytes; defaults to 64 MiB (ffprobe JSON / whisperx logs can be large). */
  maxBuffer?: number;
}

const INSTALL_HINTS: Record<string, string> = {
  ffmpeg: "Install ffmpeg (e.g. `sudo apt install ffmpeg` or `brew install ffmpeg`).",
  ffprobe: "Install ffmpeg — it provides ffprobe (e.g. `sudo apt install ffmpeg`).",
  whisperx: "Install WhisperX (e.g. `pipx install whisperx`). Only needed for --diarize.",
};

/** Thrown when the binary is not on PATH. Carries an install hint. */
export class BinaryNotFoundError extends Error {
  constructor(
    public readonly bin: string,
    public readonly hint: string,
  ) {
    super(`Required binary "${bin}" was not found on PATH. ${hint}`);
    this.name = "BinaryNotFoundError";
  }
}

/** Thrown when the binary ran but exited non-zero. Carries a trimmed stderr tail. */
export class CommandFailedError extends Error {
  constructor(
    public readonly bin: string,
    public readonly code: number | null,
    public readonly stderrTail: string,
  ) {
    super(`"${bin}" exited with code ${code ?? "null"}.\n${stderrTail}`);
    this.name = "CommandFailedError";
  }
}

/**
 * Run `bin` with `args` (no shell). Returns captured stdout/stderr on success;
 * throws {@link BinaryNotFoundError} or {@link CommandFailedError} otherwise.
 */
export async function run(
  bin: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
      encoding: "utf8",
    });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & {
      stderr?: string | Buffer;
      code?: string | number;
    };
    if (e.code === "ENOENT") {
      throw new BinaryNotFoundError(
        bin,
        INSTALL_HINTS[bin] ?? "Install it and ensure it is on PATH.",
      );
    }
    const stderrStr = e.stderr ? e.stderr.toString() : "";
    const tail = stderrStr.split("\n").filter(Boolean).slice(-20).join("\n");
    const code = typeof e.code === "number" ? e.code : null;
    throw new CommandFailedError(bin, code, tail || e.message || String(err));
  }
}
