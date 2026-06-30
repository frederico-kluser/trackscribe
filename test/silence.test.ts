import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { run } from "../src/exec.js";
import { detectSilence, parseSilenceLog } from "../src/silence.js";

const hasFfmpeg = await run("ffmpeg", ["-version"])
  .then(() => true)
  .catch(() => false);

test("parseSilenceLog extracts start/end pairs", () => {
  const log = [
    "[silencedetect @ 0x55] silence_start: 0",
    "[silencedetect @ 0x55] silence_end: 1.98 | silence_duration: 1.98",
  ].join("\n");
  const intervals = parseSilenceLog(log);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0]!.start, 0);
  assert.ok(Math.abs(intervals[0]!.end - 1.98) < 1e-6);
});

test(
  "detectSilence finds silence in a synthesized silent wav",
  { skip: !hasFfmpeg },
  async (t) => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "trackscribe-sil-"));
    t.after(() => fs.rm(tmp, { recursive: true, force: true }));

    const wav = path.join(tmp, "silent.wav");
    await run("ffmpeg", [
      "-hide_banner",
      "-y",
      "-f",
      "lavfi",
      "-t",
      "2",
      "-i",
      "anullsrc=channel_layout=mono:sample_rate=16000",
      "-c:a",
      "pcm_s16le",
      wav,
    ]);

    const intervals = await detectSilence(wav);
    assert.ok(intervals.length >= 1);
  },
);
