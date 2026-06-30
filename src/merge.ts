/**
 * Merge per-track segment lists into one time-ordered transcript.
 *
 * Overlap across tracks is EXPECTED (the sources were recorded separately) and
 * must be preserved — we never dedupe. `detectCrosstalk` surfaces overlaps
 * across *different* tracks for consumers that want to flag simultaneous
 * speech.
 *
 * ---
 *
 * Faz o merge das listas de segmentos por trilha em um único transcript
 * ordenado no tempo. Sobreposição entre trilhas é ESPERADA e preservada (nunca
 * deduplicamos). `detectCrosstalk` expõe sobreposições entre trilhas distintas.
 */
import type { Segment, Turn } from "./types.js";

/** Flatten all tracks and sort by start (tie-break end, then track). */
export function mergeTranscripts(perTrack: Segment[][]): Segment[] {
  const all = perTrack.flat();
  all.sort((a, b) => a.start - b.start || a.end - b.end || a.track - b.track);
  return all;
}

/**
 * Group consecutive segments from the same speaker (and track) into turns,
 * breaking on a speaker change or a gap larger than `maxGapSeconds`.
 */
export function groupIntoTurns(
  segments: Segment[],
  maxGapSeconds = 1.5,
): Turn[] {
  const turns: Turn[] = [];
  for (const seg of segments) {
    const last = turns[turns.length - 1];
    if (
      last &&
      last.speaker === seg.speaker &&
      last.track === seg.track &&
      seg.start - last.end <= maxGapSeconds
    ) {
      last.end = seg.end;
      last.text += " " + seg.text;
    } else {
      turns.push({
        speaker: seg.speaker,
        track: seg.track,
        start: seg.start,
        end: seg.end,
        text: seg.text,
      });
    }
  }
  return turns;
}

/** Strict time overlap (touching boundaries do not count). */
export function overlaps(a: Segment, b: Segment): boolean {
  return a.start < b.end && b.start < a.end;
}

export interface Crosstalk {
  a: Segment;
  b: Segment;
}

/** All overlapping segment pairs that come from *different* tracks. */
export function detectCrosstalk(segments: Segment[]): Crosstalk[] {
  const result: Crosstalk[] = [];
  const sorted = [...segments].sort((x, y) => x.start - y.start);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.start >= a.end) break; // sorted by start → no later segment overlaps `a`
      if (a.track !== b.track && overlaps(a, b)) {
        result.push({ a, b });
      }
    }
  }
  return result;
}
