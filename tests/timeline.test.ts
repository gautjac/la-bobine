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
  reorder,
  dropTargetIndex,
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
  // Cards off in the base fixture so the granular tests keep the plain
  // audio-length reel; the cards get their own suite below.
  controls: { ...DEFAULT_CONTROLS, showTitleCard: false, showClosingCard: false },
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

describe("title & closing cards", () => {
  const base = "http://localhost:7788/projects/test-bobine";
  const cardControls = { ...DEFAULT_CONTROLS, showTitleCard: true, showClosingCard: true };

  it("title card prepends 3 s before the body", () => {
    const p = project({ controls: { ...cardControls, showClosingCard: false } });
    const props = buildRenderProps(p, base);
    expect(props.titleF).toBe(3 * FPS);
    expect(props.durationInFrames).toBe(3 * FPS + 20 * FPS);
    expect(props.title).toBe("Test");
  });

  it("no title card when the title is blank, even if enabled", () => {
    const p = project({ title: "   ", controls: cardControls });
    expect(buildRenderProps(p, base).titleF).toBe(0);
  });

  it("body-relative cues and clips are NOT shifted by the title card", () => {
    const with_ = buildRenderProps(project({ controls: { ...cardControls, showClosingCard: false } }), base);
    const without = buildRenderProps(project(), base);
    expect(with_.cues).toEqual(without.cues);
    expect(with_.clips).toEqual(without.clips);
  });

  it("closing card starts a beat after the last spoken moment", () => {
    // speechEnd 18 s beats the last cue (17 s): 540 + 20 lead = 560.
    const p = project({ controls: { ...cardControls, showTitleCard: false } });
    const props = buildRenderProps(p, base);
    expect(props.closingStartF).toBe(560);
    expect(props.showClosingCard).toBe(true);
  });

  it("extends the reel when the outro is too short to read the poem", () => {
    // Audio ends at 20 s (600f) but the card starts at 560 — it needs 150f.
    const p = project({ controls: { ...cardControls, showTitleCard: false } });
    expect(buildRenderProps(p, base).durationInFrames).toBe(560 + 150);
  });

  it("does not extend when the outro already gives the card enough air", () => {
    const p = project({
      audio: { file: "vo.mp3", duration: 30, speechEnd: 18, aligned: true },
      controls: { ...cardControls, showTitleCard: false },
    });
    expect(buildRenderProps(p, base).durationInFrames).toBe(30 * FPS);
  });

  it("both cards compose: total = title + extended body", () => {
    const props = buildRenderProps(project({ controls: cardControls }), base);
    expect(props.durationInFrames).toBe(90 + 710);
  });

  it("the last clip stretches under the closing card", () => {
    const props = buildRenderProps(project({ controls: { ...cardControls, showTitleCard: false } }), base);
    expect(props.clips[props.clips.length - 1].to).toBe(710);
  });

  it("cards off keeps the reel exactly audio-length", () => {
    const props = buildRenderProps(project(), base);
    expect(props.titleF).toBe(0);
    expect(props.closingStartF).toBeGreaterThan(props.durationInFrames - props.titleF);
    expect(props.durationInFrames).toBe(20 * FPS);
  });

  it("ships the whole poem for the closing card", () => {
    const props = buildRenderProps(project({ controls: cardControls }), base);
    expect(props.poem).toEqual([["le matin"], ["la table"]]);
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

describe("reorder", () => {
  it("moves an item forward", () => {
    expect(reorder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item backward", () => {
    expect(reorder(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("is identity for same index or out-of-range from", () => {
    const arr = ["a", "b"];
    expect(reorder(arr, 1, 1)).toBe(arr);
    expect(reorder(arr, 5, 0)).toBe(arr);
    expect(reorder(arr, -1, 0)).toBe(arr);
  });

  it("clamps the target into range", () => {
    expect(reorder(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
    expect(reorder(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
  });

  it("never mutates the input", () => {
    const arr = ["a", "b", "c"];
    reorder(arr, 0, 2);
    expect(arr).toEqual(["a", "b", "c"]);
  });
});

describe("dropTargetIndex", () => {
  // Three slots: [0,100) [100,200) [200,400)
  const bounds = [
    { start: 0, end: 100 },
    { start: 100, end: 200 },
    { start: 200, end: 400 },
  ];

  it("stays home when the centre hasn't crossed a neighbour's midpoint", () => {
    expect(dropTargetIndex(bounds, 0, 60)).toBe(0);
    expect(dropTargetIndex(bounds, 1, 160)).toBe(1);
  });

  it("moves right once past the next slot's midpoint", () => {
    expect(dropTargetIndex(bounds, 0, 160)).toBe(1);
    expect(dropTargetIndex(bounds, 0, 350)).toBe(2);
  });

  it("moves left once past the previous slot's midpoint", () => {
    expect(dropTargetIndex(bounds, 2, 140)).toBe(1);
    expect(dropTargetIndex(bounds, 2, 20)).toBe(0);
  });

  it("clamps to the lane", () => {
    expect(dropTargetIndex(bounds, 1, -500)).toBe(0);
    expect(dropTargetIndex(bounds, 1, 5000)).toBe(2);
  });
});

describe("clipStartSeconds", () => {
  it("matches the boundary layout used by the composition", () => {
    const starts = clipStartSeconds([4, 4, 4], 20);
    expect(starts.map((s) => Math.round(s * FPS))).toEqual(clipBoundaries([4, 4, 4], 20 * FPS).slice(0, -1));
  });
});
