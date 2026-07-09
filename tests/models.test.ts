import { describe, expect, it } from "vitest";
import { FAL_MODELS, DEFAULT_MODEL, getModel, fullPrompt, IMG_WIDTH, IMG_HEIGHT } from "../src/lib/models";

describe("FAL_MODELS registry", () => {
  it("has unique ids and human labels", () => {
    const ids = FAL_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of FAL_MODELS) {
      expect(m.label.length).toBeGreaterThan(3);
      expect(m.note.length).toBeGreaterThan(3);
    }
  });

  it("includes the default model", () => {
    expect(FAL_MODELS.some((m) => m.id === DEFAULT_MODEL)).toBe(true);
  });

  it("every body carries the prompt, one image, and is JSON-serializable", () => {
    for (const m of FAL_MODELS) {
      const body = m.buildBody("a quiet kitchen table at dawn");
      expect(body.prompt).toBe("a quiet kitchen table at dawn");
      expect(body.num_images).toBe(1);
      expect(() => JSON.stringify(body)).not.toThrow();
    }
  });

  it("FLUX-family bodies request the exact band-complement size", () => {
    const flux = getModel("fal-ai/flux/dev").buildBody("x") as { image_size: { width: number; height: number } };
    expect(flux.image_size).toEqual({ width: IMG_WIDTH, height: IMG_HEIGHT });
    // 1080×1280 is the image area left by the default ⅓ text band on 1080×1920.
    expect(IMG_HEIGHT).toBe(1920 - Math.round(1920 / 3));
  });

  it("Ultra speaks aspect_ratio instead of pixels", () => {
    const body = getModel("fal-ai/flux-pro/v1.1-ultra").buildBody("x");
    expect(body.aspect_ratio).toBe("3:4");
    expect(body.image_size).toBeUndefined();
  });
});

describe("getModel", () => {
  it("returns the requested model", () => {
    expect(getModel("fal-ai/flux/schnell").id).toBe("fal-ai/flux/schnell");
  });

  it("falls back to a sane default for unknown ids", () => {
    expect(FAL_MODELS.map((m) => m.id)).toContain(getModel("fal-ai/does-not-exist").id);
  });
});

describe("fullPrompt", () => {
  it("appends the shared style clause", () => {
    expect(fullPrompt("a table", "woodcut, muted palette")).toBe("a table, woodcut, muted palette");
  });

  it("tolerates a leading comma in the stored style", () => {
    expect(fullPrompt("a table", ", woodcut")).toBe("a table, woodcut");
  });

  it("returns the bare prompt when style is empty", () => {
    expect(fullPrompt("a table", "   ")).toBe("a table");
  });

  it("trims the prompt", () => {
    expect(fullPrompt("  a table  ", "")).toBe("a table");
  });
});
