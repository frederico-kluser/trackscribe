import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeTranscripts,
  groupIntoTurns,
  detectCrosstalk,
  overlaps,
} from "../src/merge.js";
import type { Segment } from "../src/types.js";

const seg = (
  track: number,
  start: number,
  end: number,
  speaker: string,
  text = "x",
): Segment => ({ speaker, track, start, end, text });

test("mergeTranscripts sorts by start and preserves cross-track overlaps", () => {
  const a = [seg(0, 0, 3.2, "Host"), seg(0, 5.6, 9.1, "Host")];
  const b = [seg(1, 3.0, 5.8, "Call"), seg(1, 9.4, 12, "Call")];
  const merged = mergeTranscripts([a, b]);
  assert.equal(merged.length, 4); // nothing deduped
  assert.deepEqual(
    merged.map((s) => s.start),
    [0, 3.0, 5.6, 9.4],
  );
  // track 0 ending at 3.2 overlaps track 1 starting at 3.0 — preserved
  assert.ok(merged[0]!.end > merged[1]!.start);
});

test("mergeTranscripts tie-breaks equal start by end then track", () => {
  const merged = mergeTranscripts([
    [seg(2, 1, 5, "C")],
    [seg(0, 1, 3, "A")],
    [seg(1, 1, 3, "B")],
  ]);
  assert.deepEqual(
    merged.map((s) => s.track),
    [0, 1, 2],
  );
});

test("groupIntoTurns merges same speaker within gap, breaks on speaker change", () => {
  const segs = [
    seg(0, 0, 1, "Host", "a"),
    seg(0, 1.2, 2, "Host", "b"),
    seg(1, 2.1, 3, "Call", "c"),
  ];
  const turns = groupIntoTurns(segs, 1.5);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]!.text, "a b");
  assert.equal(turns[0]!.end, 2);
  assert.equal(turns[1]!.speaker, "Call");
});

test("groupIntoTurns breaks when gap exceeds maxGap", () => {
  const segs = [seg(0, 0, 1, "Host", "a"), seg(0, 3, 4, "Host", "b")];
  assert.equal(groupIntoTurns(segs, 1.5).length, 2);
});

test("groupIntoTurns breaks on speaker change even at gap 0 (same track)", () => {
  const segs = [
    seg(1, 0, 1, "t1/SPEAKER_00", "a"),
    seg(1, 1, 2, "t1/SPEAKER_01", "b"),
  ];
  assert.equal(groupIntoTurns(segs, 1.5).length, 2);
});

test("overlaps is strict — touching boundaries do not count", () => {
  assert.equal(overlaps(seg(0, 0, 3, "A"), seg(1, 3, 5, "B")), false);
  assert.equal(overlaps(seg(0, 0, 3.2, "A"), seg(1, 3, 5, "B")), true);
});

test("detectCrosstalk flags only cross-track overlaps", () => {
  const segs = [
    seg(0, 0, 3.2, "Host"),
    seg(1, 3.0, 5.8, "Call"),
    seg(0, 3.1, 3.15, "Host"),
  ];
  const ct = detectCrosstalk(segs);
  assert.ok(ct.length >= 1);
  for (const { a, b } of ct) assert.notEqual(a.track, b.track);
});
