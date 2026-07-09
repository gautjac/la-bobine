import { describe, expect, it } from "vitest";
import {
  FPS,
  MIN_CLIP_F,
  toFrames,
  toSeconds,
  clipBoundaries,
  buildRenderProps,
  distributeEvenly,
  clipStartSeconds,
  projectDurationF,
} from "../src/lib/timeline";
import { DEFAULT_CONTROLS, type ImageClip, type Project } from "../src/lib/types";

const clip = (over: Partial<ImageClip> = {}): ImageClip => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  seconds: 4,
  transition: "crossfade",
  transitionSeconds: 0.7,
  motion: "none",
  prompt: "une table",
  model: "fal-ai/flux/dev",
  activeGenerationId: null,
  generations: [],
  ...over,
});

const project = (over: Partial<Project> = {}): Project => ({
  id: "test-bobine",
  title: "Test",
  createdAt: 0,
  poemText: "le matin\n\nla table",
  stanzas: [["le matin"], ["la table"]],
  audio: { file: "vo.mp3", duration: 20, speechEnd: 18, aligned: true },
  cues: [
    { stanzaIndex: 0, start: 0.5, end: 8 },
    { stanzaIndex: 1, start: 9, end: 17 },
  ],
  clips: [clip({ id: "c1" }), clip({ id: "c2" })],
  controls: { ...DEFAULT_CONTROLS },
  style: "",
  ...over,
});

describe("frame conversions", () => {
  it("round-trips seconds ↔ frames", () => {
    expect(toFrames(2)).toBe(60);
    expect(toSeconds(toFrames(3.5))).toBeCloseTo(3.5);
  });
});

describe("clipBoundaries", () => {
  it("lays clips out sequentially and extends the last to the end", () => {
    const bnd = clipBoundaries([4, 4, 4], 20 * FPS);
    expect(bnd).toEqual([0, 120, 240, 600]);
  });

  it("clamps overlong clips so every later clip keeps its minimum", () => {
    const bnd = clipBoundaries([100, 4, 4], 10 * FPS); // 100s clip in a 10s reel
    expect(bnd).toHaveLength(4);
    for (let i = 1; i < bnd.length; i++) expect(bnd[i] - bnd[i - 1]).toBeGreaterThanOrEqual(MIN_CLIP_F);
    expect(bnd[bnd.length - 1]).toBe(10 * FPS);
  });

  it("a single clip spans the whole reel", () => {
    expect(clipBoundaries([3], 300)).toEqual([0, 300]);
  });

  it("boundaries are strictly increasing even when everything overflows", () => {
    const bnd = clipBoundaries([50, 50, 50, 50], 4 * FPS);
    for (let i = 1; i < bnd.length; i++) expect(bnd[i]).toBeGreaterThan(bnd[i - 1]);
  });
});

describe("buildRenderProps", () => {
  const base = "http://localhost:7788/projects/test-bobine";

  it("derives duration from the audio", () => {
    const props = buildRenderProps(project(), base);
    expect(props.durationInFrames).toBe(20 * FPS);
    expect(projectDurationF(project())).toBe(20 * FPS);
  });

  it("joins stanza lines with newlines in cue text", () => {
    const p = project({ stanzas: [["ligne un", "ligne deux"], ["seule"]] });
    const props = buildRenderProps(p, base);
    expect(props.cues[0].text).toBe("ligne un\nligne deux");
  });

  it("sorts cues by start time and clamps to the reel", () => {
    const p = project({
      cues: [
        { stanzaIndex: 1, start: 9, end: 99 }, // end beyond audio
        { stanzaIndex: 0, start: 0.5, end: 8 },
      ],
    });
    const props = buildRenderProps(p, base);
    expect(props.cues[0].text).toBe("le matin");
    expect(props.cues[1].to).toBeLessThanOrEqual(props.durationInFrames);
  });

  it("drops cues that point at missing stanzas", () => {
    const p = project({ cues: [{ stanzaIndex: 7, start: 1, end: 3 }] });
    expect(buildRenderProps(p, base).cues).toHaveLength(0);
  });

  it("uses the ACTIVE generation for a clip's src, not the latest", () => {
    const c = clip({
      id: "c1",
      activeGenerationId: "g1",
      generations: [
        { id: "g1", model: "m", prompt: "p", file: "c1-g1.jpg", createdAt: 1 },
        { id: "g2", model: "m", prompt: "p", file: "c1-g2.jpg", createdAt: 2 },
      ],
    });
    const props = buildRenderProps(project({ clips: [c] }), base);
    expect(props.clips[0].src).toBe(`${base}/images/c1-g1.jpg`);
  });

  it("falls back to the newest generation when no active id is set", () => {
    const c = clip({
      id: "c1",
      activeGenerationId: null,
      generations: [
        { id: "g1", model: "m", prompt: "p", file: "c1-g1.jpg", createdAt: 1 },
        { id: "g2", model: "m", prompt: "p", file: "c1-g2.jpg", createdAt: 2 },
      ],
    });
    const props = buildRenderProps(project({ clips: [c] }), base);
    expect(props.clips[0].src).toBe(`${base}/images/c1-g2.jpg`);
  });

  it("renders a null src (placeholder plate) for ungenerated clips", () => {
    const props = buildRenderProps(project(), base);
    expect(props.clips[0].src).toBeNull();
  });

  it("builds the audio URL from the asset base", () => {
    expect(buildRenderProps(project(), base).audioUrl).toBe(`${base}/vo.mp3`);
  });

  it("keeps transition frames at least 1", () => {
    const p = project({ clips: [clip({ transitionSeconds: 0 }), clip()] });
    expect(buildRenderProps(p, base).clips[0].transitionF).toBeGreaterThanOrEqual(1);
  });
});

describe("distributeEvenly", () => {
  it("splits the audio equally", () => {
    const secs = distributeEvenly(4, 40);
    expect(secs).toHaveLength(4);
    for (const s of secs) expect(s).toBeCloseTo(10, 1);
  });

  it("respects the minimum clip length for many clips", () => {
    for (const s of distributeEvenly(100, 10)) expect(s).toBeGreaterThanOrEqual(toSeconds(MIN_CLIP_F));
  });

  it("handles zero clips", () => {
    expect(distributeEvenly(0, 30)).toEqual([]);
  });
});

describe("clipStartSeconds", () => {
  it("matches the boundary layout used by the composition", () => {
    const starts = clipStartSeconds([4, 4, 4], 20);
    expect(starts.map((s) => Math.round(s * FPS))).toEqual(clipBoundaries([4, 4, 4], 20 * FPS).slice(0, -1));
  });
});
