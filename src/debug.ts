/**
 * Tiny opt-in debug logger. Off by default; turned on by `--verbose` (which
 * calls `setDebug(true)`) or `TRACKSCRIBE_DEBUG=1`. Writes to STDERR so it never
 * pollutes the JSON written to stdout via `--out -`.
 *
 * ---
 *
 * Logger de debug opcional. Desligado por padrão; ligado por `--verbose` ou
 * `TRACKSCRIBE_DEBUG=1`. Escreve em STDERR para nunca poluir o JSON da stdout.
 */
let enabled =
  process.env.TRACKSCRIBE_DEBUG === "1" ||
  process.env.TRACKSCRIBE_DEBUG === "true";

/** Force debug on/off (the CLI calls this from the `--verbose` flag). */
export function setDebug(on: boolean): void {
  enabled = on;
}

export function isDebug(): boolean {
  return enabled;
}

/** Emit a debug line to stderr when enabled; a no-op otherwise. */
export function debug(msg: string): void {
  if (enabled) process.stderr.write(`[trackscribe:debug] ${msg}\n`);
}
