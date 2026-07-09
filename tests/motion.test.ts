import { describe, expect, it } from "vitest";
import { motionTransform, motionToCss } from "../src/lib/motion";
import { MOTIONS } from "../src/lib/types";

describe("motionTransform", () => {
  it("none is the identity at any progress", () => {
    for (const p of [0, 0.5, 1]) expect(motionTransform("none", p)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it("pushIn grows over the clip's life", () => {
    expect(motionTransform("pushIn", 1).scale).toBeGreaterThan(motionTransform("pushIn", 0).scale);
  });

  it("pullOut shrinks over the clip's life", () => {
    expect(motionTransform("pullOut", 1).scale).toBeLessThan(motionTransform("pullOut", 0).scale);
  });

  it("drifts travel horizontally in opposite directions", () => {
    const left = motionTransform("driftLeft", 1).tx - motionTransform("driftLeft", 0).tx;
    const right = motionTransform("driftRight", 1).tx - motionTransform("driftRight", 0).tx;
    expect(left).toBeLessThan(0);
    expect(right).toBeGreaterThan(0);
  });

  it("every motion keeps scale ≥ 1 so a cover-fit image never shows edges", () => {
    for (const m of MOTIONS) {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) expect(motionTransform(m, p).scale).toBeGreaterThanOrEqual(1);
    }
  });

  it("clamps progress outside [0, 1]", () => {
    expect(motionTransform("pushIn", -5)).toEqual(motionTransform("pushIn", 0));
    expect(motionTransform("pushIn", 5)).toEqual(motionTransform("pushIn", 1));
  });
});

describe("motionToCss", () => {
  it("emits a scale + translate transform", () => {
    expect(motionToCss({ scale: 1.1, tx: 5, ty: -2 })).toBe("scale(1.1000) translate(5.0px, -2.0px)");
  });
});
