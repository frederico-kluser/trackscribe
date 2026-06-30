import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { run } from "../src/exec.js";
import { probeAudioTracks } from "../src/probe.js";
import { extractAllTracks } from "../src/extract.js";

const hasFfmpeg = await run("ffmpeg", ["-version"])
  .then(() => true)
  .catch(() => false);

test(
  "probe + extract a synthesized 2-audio-track MKV (no OpenAI)",
  { skip: !hasFfmpeg },
  async (t) => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "trackscribe-it-"));
    t.after(() => fs.rm(tmp, { recursive: true, force: true }));

    const mkv = path.join(tmp, "fixture.mkv");
    await run("ffmpeg", [
      "-hide_banner",
      "-y",
      "-f",
      "lavfi",
      "-t",
      "2",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-f",
      "lavfi",
      "-t",
      "2",
      "-i",
      "sine=frequency=880:sample_rate=48000",
      "-map",
      "0:a",
      "-map",
      "1:a",
      "-c:a",
      "pcm_s16le",
      "-metadata:s:a:0",
      "language=eng",
      "-metadata:s:a:0",
      "title=Host",
      "-metadata:s:a:1",
      "language=por",
      "-metadata:s:a:1",
      "title=System",
      "-disposition:a:0",
      "default",
      mkv,
    ]);

    const tracks = await probeAudioTracks(mkv);
    assert.equal(tracks.length, 2);
    assert.equal(tracks[0]!.audioIndex, 0);
    assert.equal(tracks[1]!.audioIndex, 1);
    assert.equal(tracks[0]!.channels, 1);
    assert.equal(tracks[0]!.title, "Host");
    assert.equal(tracks[1]!.title, "System");
    assert.equal(tracks[0]!.language, "eng");
    assert.equal(tracks[0]!.isDefault, true);

    const extracted = await extractAllTracks(mkv, tracks, tmp, "wav");
    assert.equal(extracted.length, 2);

    for (const e of extracted) {
      const stat = await fs.stat(e.file);
      assert.ok(stat.size > 0, `${e.file} should be non-empty`);

      const { stdout } = await run("ffprobe", [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_streams",
        e.file,
      ]);
      const streams = (JSON.parse(stdout).streams ?? []) as Array<
        Record<string, unknown>
      >;
      const audio = streams.find((s) => s["codec_type"] === "audio");
      assert.ok(audio, "extracted file should contain an audio stream");
      assert.equal(Number(audio!["sample_rate"]), 16000);
      assert.equal(audio!["channels"], 1);
    }
  },
);
