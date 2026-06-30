/**
 * Pure alignment of pyannoteAI speaker turns onto whisper-1 segments by maximal
 * temporal overlap, plus a post-hoc quality assessment. No network, no I/O —
 * unit-tested with fixtures.
 *
 * Diarization runs on EVERY track, so speakers are labelled per-track as
 * `t{trackId}/SPEAKER_xx` (pyannoteAI numbers speakers independently within each
 * track; there is no cross-track identity without voiceprints). A track with a
 * single speaker is a VALID result, not a failure.
 *
 * Why overlap (not nearest boundary): pyannoteAI's boundaries are finer than
 * whisper's, so matching by start-proximity errors on short interruptions.
 * Overlap is robust to that granularity mismatch. We prefer `exclusiveDiarization`
 * (one speaker per instant) so each whisper segment maps to exactly one speaker.
 *
 * ---
 *
 * Alinhamento puro dos turnos da pyannoteAI sobre os segmentos do whisper-1 por
 * máxima sobreposição temporal, com avaliação de qualidade. A diarização roda em
 * TODAS as trilhas; locutores são rotulados por trilha como `t{trackId}/SPEAKER_xx`.
 * Uma trilha com um único locutor é um resultado VÁLIDO, não uma falha.
 */
import type { PyannoteTurn } from "./pyannote.js";
import type { DiarizedSegment, Segment } from "./types.js";

/** Overlap (seconds) between two [start,end] intervals; 0 if disjoint. */
export function overlapSeconds(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Assign each whisper segment the diarization speaker with the largest temporal
 * overlap. Segments with no overlapping turn get `fallbackSpeaker`. Speaker
 * labels are namespaced per track as `t{trackId}/SPEAKER_xx`.
 */
export function alignSegmentsToTurns(
  segments: Segment[],
  turns: PyannoteTurn[],
  trackId: number,
  fallbackSpeaker = "UNKNOWN",
): DiarizedSegment[] {
  return segments.map((seg) => {
    let best: PyannoteTurn | null = null;
    let bestOverlap = 0;
    for (const turn of turns) {
      const ov = overlapSeconds(seg.start, seg.end, turn.start, turn.end);
      if (ov > bestOverlap) {
        bestOverlap = ov;
        best = turn;
      }
    }
    const rawSpeaker = best ? best.speaker : fallbackSpeaker;
    return {
      speaker: `t${trackId}/${rawSpeaker}`,
      track: trackId,
      start: seg.start,
      end: seg.end,
      text: seg.text,
    };
  });
}

export interface DiarizationAssessment {
  ok: boolean;
  reason?: string;
  /** Distinct speakers actually present in the diarization turns. */
  speakerCount: number;
}

/**
 * Decide whether the cloud diarization is usable. Because diarization runs on
 * every track, a SINGLE speaker is a legitimate outcome (the track has one
 * person) — NOT a failure. We only reject genuinely broken alignments: no turns
 * at all, or most segments matching no turn (the turns don't line up with the
 * transcript). On rejection the caller keeps the plain whisper-1 transcript.
 */
export function assessAlignedDiarization(
  segments: DiarizedSegment[],
  turns: PyannoteTurn[],
): DiarizationAssessment {
  const speakerCount = new Set(turns.map((t) => t.speaker)).size;

  if (turns.length === 0) {
    return {
      ok: false,
      reason: "pyannoteAI returned no speaker turns.",
      speakerCount: 0,
    };
  }
  // Coverage: aligned speech should cover a sane fraction of segment time.
  const covered = segments.filter((s) => !s.speaker.endsWith("/UNKNOWN")).length;
  if (segments.length > 0 && covered / segments.length < 0.5) {
    return {
      ok: false,
      reason: `Less than half of segments matched a speaker turn (${covered}/${segments.length}).`,
      speakerCount,
    };
  }
  return { ok: true, speakerCount };
}
