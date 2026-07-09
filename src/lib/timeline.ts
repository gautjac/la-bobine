// Frame math shared by the composition, the editor's timeline lanes, and the
// render props builder — one source of truth, so the blocks Jac drags in the
// editor are exactly what the MP4 does.

import { activeGeneration, type Project, type Transition, type Motion } from "./types";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const MIN_CLIP_F = 15; // half a second — a clip can't collapse below this
export const HEAD_FADE_F = 14; // fade in from black
export const TAIL_FADE_F = 24; // fade out to black over the audio's last beat
export const CUE_FADE_F = 12; // stanza cross-fade
export const TITLE_CARD_SEC = 3; // black title card before the audio begins
export const CARD_FADE_F = 22; // title/closing card cross-fades
export const CLOSING_LEAD_F = 20; // beat after the last spoken word before the poem card
export const MIN_CLOSING_HOLD_F = 150; // the full poem needs at least 5 s of air

export const toFrames = (seconds: number): number => Math.round(seconds * FPS);
export const toSeconds = (frames: number): number => frames / FPS;

export type CueProps = {
  text: string;
  from: number;
  to: number;
};

export type ClipProps = {
  /** Absolute URL of the active generation — null renders the placeholder plate. */
  src: string | null;
  from: number;
  to: number;
  transition: Transition;
  transitionF: number;
  motion: Motion;
};

// A type alias (not an interface) so it satisfies Remotion's
// Record<string, unknown> component constraint.
export type BobineProps = {
  audioUrl: string;
  /** TOTAL length: title card + body (audio, possibly extended for the closing card). */
  durationInFrames: number;
  title: string;
  /** The whole poem, for the closing card. */
  poem: string[][];
  /** Title-card length in frames — 0 when disabled. The body (audio, clips,
   *  cues — all body-relative) starts at this frame. */
  titleF: number;
  /** Body-relative frame where the closing card takes over; Infinity-like
   *  (>= body end) when disabled. */
  closingStartF: number;
  showClosingCard: boolean;
  bandPosition: "bottom" | "top";
  bandRatio: number;
  font: string;
  fontSize: number;
  textColor: string;
  textAlign: "center" | "left";
  showText: boolean;
  credit: string;
  cues: CueProps[];
  clips: ClipProps[];
}

/**
 * Sequential clip boundaries in frames: clip i spans [b[i], b[i+1]). Each clip
 * takes its requested seconds, clamped so every later clip keeps at least
 * MIN_CLIP_F; the last clip absorbs whatever remains to the end of the audio.
 */
export function clipBoundaries(clipSeconds: number[], durationF: number): number[] {
  const n = clipSeconds.length;
  const bnd: number[] = [0];
  for (let i = 0; i < n - 1; i++) {
    let next = bnd[i] + Math.max(MIN_CLIP_F, toFrames(clipSeconds[i]));
    next = Math.min(next, durationF - (n - 1 - i) * MIN_CLIP_F);
    bnd.push(Math.max(next, bnd[i] + MIN_CLIP_F));
  }
  bnd.push(Math.max(durationF, bnd[n - 1] + MIN_CLIP_F));
  return bnd;
}

export function projectDurationF(project: Pick<Project, "audio">): number {
  return Math.max(FPS, toFrames(project.audio.duration));
}

/** Derive the composition's props from a project. `assetBase` is the absolute
 *  URL of projects/<id>/ on the studio server (works in the Player AND in the
 *  headless render browser, which both fetch from the running server). */
export function buildRenderProps(project: Project, assetBase: string): BobineProps {
  const audioF = projectDurationF(project);
  const c = project.controls;

  // Title card: 3 s of black+title BEFORE the audio, so an immediate first
  // stanza never collides with it.
  const titleF = c.showTitleCard && project.title.trim() ? toFrames(TITLE_CARD_SEC) : 0;

  // Closing card: takes over once the narration is done (last cue or aligned
  // speech end, whichever is later). If the music outro is too short to read
  // the whole poem, the body extends past the audio into held silence.
  const lastCueEndF = project.cues.reduce((m, cue) => Math.max(m, toFrames(cue.end)), 0);
  let closingStartF = audioF + 1;
  let bodyF = audioF;
  if (c.showClosingCard) {
    const speechEndF = Math.max(lastCueEndF, toFrames(project.audio.speechEnd));
    closingStartF = Math.max(0, Math.min(speechEndF + CLOSING_LEAD_F, audioF - 1));
    bodyF = Math.max(audioF, closingStartF + MIN_CLOSING_HOLD_F);
  }
  const durationInFrames = titleF + bodyF;

  const cues = [...project.cues]
    .sort((a, b) => a.start - b.start)
    .map((cue) => ({
      text: (project.stanzas[cue.stanzaIndex] ?? []).join("\n"),
      from: Math.max(0, Math.min(toFrames(cue.start), bodyF - 1)),
      to: Math.max(1, Math.min(toFrames(cue.end), bodyF)),
    }))
    .filter((cc) => cc.text.length > 0 && cc.to > cc.from);

  const bnd = clipBoundaries(project.clips.map((cl) => cl.seconds), bodyF);
  const clips = project.clips.map((clip, i) => {
    const gen = activeGeneration(clip);
    return {
      src: gen ? `${assetBase}/images/${gen.file}` : null,
      from: bnd[i],
      to: bnd[i + 1],
      transition: clip.transition,
      transitionF: Math.max(1, toFrames(clip.transitionSeconds)),
      motion: clip.motion,
    };
  });

  return {
    audioUrl: `${assetBase}/${project.audio.file}`,
    durationInFrames,
    title: project.title,
    poem: project.stanzas,
    titleF,
    closingStartF,
    showClosingCard: c.showClosingCard,
    bandPosition: c.bandPosition,
    bandRatio: c.bandRatio,
    font: c.font,
    fontSize: c.fontSize,
    textColor: c.textColor,
    textAlign: c.textAlign,
    showText: c.showText,
    credit: c.credit,
    cues,
    clips,
  };
}

/** Move one item to a new index (drag-to-reorder on the image lane). */
export function reorder<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length) return arr;
  const target = Math.max(0, Math.min(arr.length - 1, to));
  const out = [...arr];
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}

/** Where a dragged block lands: how many OTHER slots' midpoints sit left of
 *  the dragged block's (moving) centre — i.e. its insertion index. */
export function dropTargetIndex(
  bounds: { start: number; end: number }[],
  from: number,
  center: number,
): number {
  let target = 0;
  bounds.forEach((b, i) => {
    if (i === from) return;
    if ((b.start + b.end) / 2 < center) target++;
  });
  return Math.max(0, Math.min(bounds.length - 1, target));
}

/** Even redistribution — the « Répartir également » button. */
export function distributeEvenly(count: number, audioDuration: number): number[] {
  if (count <= 0) return [];
  const each = Math.max(toSeconds(MIN_CLIP_F), audioDuration / count);
  return Array(count).fill(Number(each.toFixed(2)));
}

/** Start seconds of each clip as laid on the timeline (for the editor lane). */
export function clipStartSeconds(clipSeconds: number[], audioDuration: number): number[] {
  const bnd = clipBoundaries(clipSeconds, Math.max(FPS, toFrames(audioDuration)));
  return bnd.slice(0, -1).map(toSeconds);
}
