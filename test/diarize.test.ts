import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  mapWhisperxJson,
  assessDiarization,
  type WhisperxOutput,
} from "../src/diarizeTrack.js";

const fixturePath = fileURLToPath(
  new URL("./fixtures/whisperx.sample.json", import.meta.url),
);

async function loadFixture(): Promise<WhisperxOutput> {
  return JSON.parse(await readFile(fixturePath, "utf8")) as WhisperxOutput;
}

test("mapWhisperxJson prefixes system/ and defaults missing speakers to UNKNOWN", async () => {
  const segs = mapWhisperxJson(await loadFixture(), 1);
  assert.equal(segs.length, 3);
  assert.ok(segs.every((s) => s.track === 1));
  assert.equal(segs[0]!.speaker, "system/SPEAKER_00");
  assert.equal(segs[1]!.speaker, "system/SPEAKER_01");
  assert.equal(segs[2]!.speaker, "system/UNKNOWN");
  assert.equal(segs[0]!.text, "Welcome back.");
});

test("assessDiarization passes when real speaker labels are present", async () => {
  const segs = mapWhisperxJson(await loadFixture(), 1);
  assert.equal(assessDiarization(segs, "").ok, true);
});

test("assessDiarization fails when every speaker is UNKNOWN", () => {
  const segs = mapWhisperxJson(
    {
      segments: [
        { start: 0, end: 1, text: "a" },
        { start: 1, end: 2, text: "b" },
      ],
    },
    1,
  );
  const a = assessDiarization(segs, "");
  assert.equal(a.ok, false);
  assert.match(a.reason ?? "", /UNKNOWN/);
});

test("assessDiarization detects a gated-model error in stderr", () => {
  const a = assessDiarization(
    [],
    "Could not download pyannote/segmentation-3.0: 403 Forbidden — accept the user conditions",
  );
  assert.equal(a.ok, false);
});
