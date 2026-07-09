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
  durationInFrames: number;
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
  const durationInFrames = projectDurationF(project);
  const cues = [...project.cues]
    .sort((a, b) => a.start - b.start)
    .map((cue) => ({
      text: (project.stanzas[cue.stanzaIndex] ?? []).join("\n"),
      from: Math.max(0, Math.min(toFrames(cue.start), durationInFrames - 1)),
      to: Math.max(1, Math.min(toFrames(cue.end), durationInFrames)),
    }))
    .filter((c) => c.text.length > 0 && c.to > c.from);

  const bnd = clipBoundaries(project.clips.map((c) => c.seconds), durationInFrames);
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
    bandPosition: project.controls.bandPosition,
    bandRatio: project.controls.bandRatio,
    font: project.controls.font,
    fontSize: project.controls.fontSize,
    textColor: project.controls.textColor,
    textAlign: project.controls.textAlign,
    showText: project.controls.showText,
    credit: project.controls.credit,
    cues,
    clips,
  };
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
