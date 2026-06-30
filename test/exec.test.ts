import { test } from "node:test";
import assert from "node:assert/strict";
import { run, BinaryNotFoundError, CommandFailedError } from "../src/exec.js";

test("run returns stdout for a present binary", async () => {
  const { stdout } = await run("node", ["-e", "process.stdout.write('hello')"]);
  assert.equal(stdout, "hello");
});

test("run throws BinaryNotFoundError when the binary is missing", async () => {
  await assert.rejects(
    () => run("trackscribe-no-such-binary-xyz", ["--version"]),
    (err: unknown) =>
      err instanceof BinaryNotFoundError &&
      /not found on PATH/.test(err.message),
  );
});

test("run throws CommandFailedError with the stderr tail on non-zero exit", async () => {
  await assert.rejects(
    () => run("node", ["-e", "console.error('boom'); process.exit(3)"]),
    (err: unknown) =>
      err instanceof CommandFailedError &&
      err.code === 3 &&
      /boom/.test(err.message),
  );
});
