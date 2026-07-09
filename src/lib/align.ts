// Mapping ElevenLabs forced alignment onto the poem's stanzas.
//
// The aligner returns one entry per CHARACTER of the text we sent it, each with
// start/end seconds. We locate every poem line inside that character stream
// (cursor + indexOf — the stream is our own text, so exact matching is safe),
// derive per-line spoken windows, then collapse lines into per-stanza cues with
// a small lead-in and tail. Unmatched lines (the aligner rarely drops one) get
// estimated windows so the reel never has a hole.

import { flattenStanzas } from "./poem";
import type { TextCue } from "./types";

export interface AlignedChar {
  text: string;
  start: number;
  end: number;
}

export interface LineWindow {
  start: number;
  end: number;
  matched: boolean;
}

const EST_GAP = 0.15; // unmatched line: starts a beat after the previous one
const EST_DUR = 1.5; //   … and lasts about a spoken line's worth
export const CUE_LEAD = 0.3; // stanza text arrives a hair before it's spoken
export const CUE_TAIL = 0.45; // … and lingers after the last word
const MIN_CUE = 0.5; // never let clamping crush a cue to nothing
const CUE_GAP = 0.05; // minimum daylight between consecutive cues

/** Locate each line's spoken window inside the aligned character stream. */
export function lineWindows(chars: AlignedChar[], lines: string[]): LineWindow[] {
  const full = chars.map((c) => c.text).join("");
  let cursor = 0;
  const windows: LineWindow[] = lines.map((line) => {
    const idx = full.indexOf(line, cursor);
    if (idx >= 0 && line.length > 0) {
      cursor = idx + line.length;
      return { start: chars[idx].start, end: chars[idx + line.length - 1].end, matched: true };
    }
    return { start: NaN, end: NaN, matched: false };
  });
  // Estimate any line the aligner missed, squeezed into the real gap between
  // its neighbours (which may be tiny — the audio owes a phantom line nothing).
  for (let i = 0; i < windows.length; i++) {
    if (windows[i].matched) continue;
    const prevEnd = i > 0 ? windows[i - 1].end : 0;
    const nextStart = windows.slice(i + 1).find((w) => w.matched)?.start;
    if (nextStart !== undefined) {
      const gap = Math.max(0, nextStart - prevEnd);
      const pad = Math.min(EST_GAP, gap / 4);
      const start = prevEnd + pad;
      windows[i] = { start, end: Math.max(start, nextStart - pad), matched: false };
    } else {
      const start = prevEnd + EST_GAP;
      windows[i] = { start, end: start + EST_DUR, matched: false };
    }
  }
  return windows;
}

/** Collapse per-line windows into per-stanza cues (lead/tail, clamped, ordered). */
export function stanzaCues(
  stanzas: string[][],
  windows: LineWindow[],
  audioDuration: number,
): TextCue[] {
  const lines = flattenStanzas(stanzas);
  if (lines.length !== windows.length) {
    throw new Error(`stanzaCues: ${lines.length} lines but ${windows.length} windows`);
  }
  const cues: TextCue[] = [];
  for (let s = 0; s < stanzas.length; s++) {
    const own = windows.filter((_, i) => lines[i].stanzaIndex === s);
    if (own.length === 0) continue;
    const start = Math.max(0, own[0].start - CUE_LEAD);
    const end = Math.min(audioDuration, own[own.length - 1].end + CUE_TAIL);
    cues.push({ stanzaIndex: s, start, end: Math.max(end, start + MIN_CUE) });
  }
  // One stanza at a time: never let a cue bleed into the next one.
  for (let i = 1; i < cues.length; i++) {
    if (cues[i].start < cues[i - 1].end + CUE_GAP) {
      const boundary = Math.max(
        cues[i - 1].start + MIN_CUE,
        Math.min(cues[i].start, cues[i - 1].end),
      );
      cues[i - 1].end = boundary;
      cues[i].start = Math.min(boundary + CUE_GAP, audioDuration - MIN_CUE);
      if (cues[i].end < cues[i].start + MIN_CUE) cues[i].end = Math.min(audioDuration, cues[i].start + MIN_CUE);
    }
  }
  return cues;
}

/**
 * No-alignment fallback: spread stanzas across the spoken part of the audio,
 * each proportional to its character count. Keeps the reel functional (and the
 * cues hand-draggable) when the aligner is unreachable.
 */
export function estimateCues(stanzas: string[][], audioDuration: number, speechEnd?: number): TextCue[] {
  const usable = Math.max(1, Math.min(speechEnd || audioDuration * 0.92, audioDuration));
  const weights = stanzas.map((st) => Math.max(1, st.join(" ").length));
  const total = weights.reduce((a, b) => a + b, 0);
  const cues: TextCue[] = [];
  let t = 0;
  for (let s = 0; s < stanzas.length; s++) {
    const dur = (weights[s] / total) * usable;
    cues.push({ stanzaIndex: s, start: t, end: Math.min(audioDuration, t + Math.max(MIN_CUE, dur - CUE_GAP)) });
    t += dur;
  }
  return cues;
}
