import { describe, expect, it } from "vitest";
import { fmtTime, slugify, uid } from "../src/lib/format";

describe("fmtTime", () => {
  it("formats zero", () => {
    expect(fmtTime(0)).toBe("0:00.0");
  });

  it("formats minutes and tenths", () => {
    expect(fmtTime(65.25)).toBe("1:05.3");
    expect(fmtTime(9.94)).toBe("0:09.9");
  });

  it("never goes negative", () => {
    expect(fmtTime(-3)).toBe("0:00.0");
  });
});

describe("slugify", () => {
  it("folds Québécois accents and punctuation", () => {
    expect(slugify("Éloge du café, à l'aube")).toBe("eloge-du-cafe-a-l-aube");
  });

  it("falls back for empty titles", () => {
    expect(slugify("   ")).toBe("bobine");
    expect(slugify("!!!")).toBe("bobine");
  });

  it("trims stray dashes", () => {
    expect(slugify("—le matin—")).toBe("le-matin");
  });
});

describe("uid", () => {
  it("is short, url-safe, and collision-resistant enough for clips", () => {
    const ids = new Set(Array.from({ length: 500 }, () => uid()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+$/i);
  });
});
