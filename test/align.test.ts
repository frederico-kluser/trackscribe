import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  overlapSeconds,
  alignSegmentsToTurns,
  assessAlignedDiarization,
} from "../src/align.js";
import type { PyannoteJob } from "../src/pyannote.js";
import type { Segment } from "../src/types.js";

const fixturePath = fileURLToPath(
  new URL("./fixtures/pyannote.sample.json", import.meta.url),
);

const seg = (start: number, end: number, text = "x"): Segment => ({
  speaker: "Call (system)",
  track: 1,
  start,
  end,
  text,
});

test("overlapSeconds computes intersection, 0 when disjoint", () => {
  assert.equal(overlapSeconds(0, 3, 1, 5), 2);
  assert.equal(overlapSeconds(0, 3, 3, 5), 0);
  assert.equal(overlapSeconds(0, 3, 5, 9), 0);
});

test("alignSegmentsToTurns assigns the max-overlap speaker, namespaced t{track}/", async () => {
  const job = JSON.parse(await readFile(fixturePath, "utf8")) as PyannoteJob;
  const turns = job.output!.exclusiveDiarization!;

  const segs = [seg(0.2, 2.8), seg(3.1, 5.5), seg(6.2, 8.9)];
  const out = alignSegmentsToTurns(segs, turns, 1);

  assert.equal(out.length, 3);
  assert.ok(out.every((s) => s.track === 1));
  assert.equal(out[0]!.speaker, "t1/SPEAKER_00");
  assert.equal(out[1]!.speaker, "t1/SPEAKER_01");
  assert.equal(out[2]!.speaker, "t1/SPEAKER_00");
});

test("alignSegmentsToTurns namespaces speakers by trackId (per-track)", () => {
  const turns = [{ speaker: "SPEAKER_00", start: 0, end: 3 }];
  assert.equal(alignSegmentsToTurns([seg(0.2, 2.8)], turns, 0)[0]!.speaker, "t0/SPEAKER_00");
  assert.equal(alignSegmentsToTurns([seg(0.2, 2.8)], turns, 2)[0]!.speaker, "t2/SPEAKER_00");
});

test("alignSegmentsToTurns falls back to UNKNOWN with no overlap", () => {
  const out = alignSegmentsToTurns([seg(100, 101)], [], 1);
  assert.equal(out[0]!.speaker, "t1/UNKNOWN");
});

test("assessAlignedDiarization passes with multiple speakers", async () => {
  const job = JSON.parse(await readFile(fixturePath, "utf8")) as PyannoteJob;
  const turns = job.output!.exclusiveDiarization!;
  const out = alignSegmentsToTurns([seg(0.2, 2.8), seg(3.1, 5.5)], turns, 1);
  const a = assessAlignedDiarization(out, turns);
  assert.equal(a.ok, true);
  assert.equal(a.speakerCount, 2);
});

test("assessAlignedDiarization treats a SINGLE speaker as valid (not a failure)", () => {
  const turns = [
    { speaker: "SPEAKER_00", start: 0, end: 3 },
    { speaker: "SPEAKER_00", start: 3, end: 6 },
  ];
  const out = alignSegmentsToTurns([seg(0.2, 2.8), seg(3.1, 5.5)], turns, 1);
  const a = assessAlignedDiarization(out, turns);
  assert.equal(a.ok, true);
  assert.equal(a.speakerCount, 1);
});

test("assessAlignedDiarization fails on empty turns", () => {
  const a = assessAlignedDiarization([], []);
  assert.equal(a.ok, false);
  assert.equal(a.speakerCount, 0);
});

test("assessAlignedDiarization fails when under half the segments match a turn", () => {
  const turns = [
    { speaker: "SPEAKER_00", start: 0, end: 1 },
    { speaker: "SPEAKER_01", start: 1, end: 2 },
  ];
  // Only the first of three segments overlaps a turn → coverage 1/3 < 0.5.
  const out = alignSegmentsToTurns([seg(0.1, 0.9), seg(50, 51), seg(60, 61)], turns, 1);
  const a = assessAlignedDiarization(out, turns);
  assert.equal(a.ok, false);
  assert.match(a.reason ?? "", /half/i);
});
