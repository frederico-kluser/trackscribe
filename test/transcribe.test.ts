import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  segmentsFromVerboseJson,
  type WhisperVerboseResponse,
} from "../src/transcribe.js";

const fixturePath = fileURLToPath(
  new URL("./fixtures/verbose.sample.json", import.meta.url),
);

test("segmentsFromVerboseJson maps, trims, and drops no-speech/empty", async () => {
  const res = JSON.parse(
    await readFile(fixturePath, "utf8"),
  ) as WhisperVerboseResponse;
  const segs = segmentsFromVerboseJson(res, 0, "Host (microphone)");

  // fixture: 2 good segments, 1 high no_speech_prob, 1 whitespace-only
  assert.equal(segs.length, 2);
  assert.ok(segs.every((s) => s.track === 0));
  assert.ok(segs.every((s) => s.speaker === "Host (microphone)"));
  assert.ok(segs.every((s) => s.text.length > 0));
  assert.equal(segs[0]!.text, "Hey, thanks for hopping on the call.");
  assert.equal(segs[0]!.start, 0.0);
  assert.equal(segs[0]!.end, 3.2);
});

test("segmentsFromVerboseJson tolerates a missing segments array", () => {
  const segs = segmentsFromVerboseJson({ text: "" }, 0, "Host");
  assert.deepEqual(segs, []);
});
