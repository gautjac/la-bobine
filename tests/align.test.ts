import { describe, expect, it } from "vitest";
import { lineWindows, stanzaCues, estimateCues, CUE_LEAD, CUE_TAIL, type AlignedChar } from "../src/lib/align";

/** Build a character stream the way the aligner returns it: the lines joined
 *  by \n, each character spanning `perChar` seconds from `t0`. */
function charsFor(lines: string[], t0 = 0, perChar = 0.05): AlignedChar[] {
  const text = lines.join("\n");
  return [...text].map((ch, i) => ({ text: ch, start: t0 + i * perChar, end: t0 + (i + 1) * perChar }));
}

describe("lineWindows", () => {
  it("finds each line's spoken window in order", () => {
    const lines = ["le matin", "la table"];
    const chars = charsFor(lines);
    const w = lineWindows(chars, lines);
    expect(w[0].matched && w[1].matched).toBe(true);
    expect(w[0].start).toBeCloseTo(0);
    expect(w[0].end).toBeCloseTo(8 * 0.05); // "le matin" = 8 chars
    expect(w[1].start).toBeCloseTo(9 * 0.05); // after the \n
    expect(w[1].end).toBeGreaterThan(w[1].start);
  });

  it("advances the cursor so repeated identical lines map to successive occurrences", () => {
    const lines = ["encore", "encore"];
    const w = lineWindows(charsFor(lines), lines);
    expect(w[0].matched && w[1].matched).toBe(true);
    expect(w[1].start).toBeGreaterThan(w[0].end - 1e-9);
  });

  it("estimates an unmatched line between its neighbours", () => {
    const lines = ["le matin", "PAS DANS LE FLUX", "la table"];
    // The aligner only saw lines 1 and 3.
    const chars = charsFor(["le matin", "la table"], 0, 0.1);
    const w = lineWindows(chars, lines);
    expect(w[0].matched).toBe(true);
    expect(w[1].matched).toBe(false);
    expect(w[2].matched).toBe(true);
    expect(w[1].start).toBeGreaterThan(w[0].end);
    expect(w[1].end).toBeLessThanOrEqual(w[2].start);
  });

  it("estimates a trailing unmatched line after the previous end", () => {
    const lines = ["le matin", "JAMAIS PRONONCÉ"];
    const w = lineWindows(charsFor(["le matin"]), lines);
    expect(w[1].matched).toBe(false);
    expect(w[1].start).toBeGreaterThan(w[0].end);
    expect(w[1].end).toBeGreaterThan(w[1].start);
  });
});

describe("stanzaCues", () => {
  const stanzas = [
    ["le matin plie sa brume", "comme un drap"],
    ["et la table attend"],
  ];
  const lines = stanzas.flat();

  it("wraps each stanza with a lead-in and a tail", () => {
    const chars = charsFor(lines, 1, 0.05);
    const w = lineWindows(chars, lines);
    const cues = stanzaCues(stanzas, w, 60);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBeCloseTo(w[0].start - CUE_LEAD, 5);
    expect(cues[0].stanzaIndex).toBe(0);
    expect(cues[1].end).toBeCloseTo(w[2].end + CUE_TAIL, 5);
  });

  it("clamps to [0, audioDuration]", () => {
    const chars = charsFor(lines, 0.05, 0.05); // starts almost at 0
    const w = lineWindows(chars, lines);
    const shortDur = w[2].end + 0.1; // tail would overflow
    const cues = stanzaCues(stanzas, w, shortDur);
    expect(cues[0].start).toBeGreaterThanOrEqual(0);
    expect(cues[1].end).toBeLessThanOrEqual(shortDur);
  });

  it("never lets consecutive cues overlap (one stanza at a time)", () => {
    // Deliberately squeezed: stanza 2 starts before stanza 1's tail would end.
    const w = [
      { start: 1, end: 4, matched: true },
      { start: 4.1, end: 5, matched: true },
      { start: 5.2, end: 8, matched: true },
    ];
    const cues = stanzaCues(stanzas, w, 30);
    expect(cues[0].end).toBeLessThanOrEqual(cues[1].start);
  });

  it("throws when windows don't match the line count", () => {
    expect(() => stanzaCues(stanzas, [], 30)).toThrow();
  });
});

describe("estimateCues", () => {
  const stanzas = [["une strophe assez longue pour peser lourd"], ["courte"], ["moyenne, disons"]];

  it("spans the usable audio in order, within bounds", () => {
    const cues = estimateCues(stanzas, 45, 40);
    expect(cues).toHaveLength(3);
    expect(cues[0].start).toBe(0);
    for (const c of cues) {
      expect(c.end).toBeGreaterThan(c.start);
      expect(c.end).toBeLessThanOrEqual(45);
    }
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].start);
  });

  it("gives longer stanzas proportionally more time", () => {
    const cues = estimateCues(stanzas, 45, 40);
    const len = (i: number) => cues[i].end - cues[i].start;
    expect(len(0)).toBeGreaterThan(len(1));
  });

  it("works without a speechEnd hint", () => {
    const cues = estimateCues(stanzas, 30);
    expect(cues[cues.length - 1].end).toBeLessThanOrEqual(30);
  });
});
