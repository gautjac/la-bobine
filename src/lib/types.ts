// The project document — one per reel, stored as projects/<id>/project.json by
// the studio server. Everything the editor touches lives here; the composition
// receives a derived, frame-based view of it (see timeline.buildRenderProps).

export type Transition = "cut" | "crossfade" | "fadeblack";
export type Motion = "none" | "pushIn" | "pullOut" | "driftLeft" | "driftRight";
export type BandPosition = "bottom" | "top";
export type TextAlign = "center" | "left";

export interface Generation {
  id: string;
  model: string;
  prompt: string;
  /** File name inside projects/<id>/images/ */
  file: string;
  createdAt: number;
}

export interface ImageClip {
  id: string;
  /** Requested duration; the LAST clip always extends to the end of the audio. */
  seconds: number;
  transition: Transition;
  transitionSeconds: number;
  motion: Motion;
  prompt: string;
  /** Fal model id used for the next generation of this slot. */
  model: string;
  activeGenerationId: string | null;
  generations: Generation[];
}

export interface TextCue {
  stanzaIndex: number;
  start: number;
  end: number;
}

export interface ProjectAudio {
  /** File name inside projects/<id>/ (always vo.mp3 after ingest). */
  file: string;
  duration: number;
  /** Last aligned spoken second (the file may run longer — music outro). */
  speechEnd: number;
  /** False when forced alignment failed and cues were estimated. */
  aligned: boolean;
}

export interface Controls {
  bandPosition: BandPosition;
  /** Fraction of the frame height given to the black text band. */
  bandRatio: number;
  font: string;
  fontSize: number;
  textColor: string;
  textAlign: TextAlign;
  showText: boolean;
  credit: string;
}

export interface Project {
  id: string;
  title: string;
  createdAt: number;
  /** The poem exactly as pasted (blank line = stanza break). */
  poemText: string;
  stanzas: string[][];
  audio: ProjectAudio;
  cues: TextCue[];
  clips: ImageClip[];
  controls: Controls;
  /** Shared trailing style clause appended to every image prompt. */
  style: string;
}

export const DEFAULT_CONTROLS: Controls = {
  bandPosition: "bottom",
  bandRatio: 1 / 3,
  font: "Cormorant Garamond",
  fontSize: 44,
  textColor: "#f4efe6",
  textAlign: "center",
  showText: true,
  credit: "© Jac Gautreau",
};

export const TRANSITION_LABELS: Record<Transition, string> = {
  cut: "Coupe franche",
  crossfade: "Fondu enchaîné",
  fadeblack: "Fondu au noir",
};

export const MOTION_LABELS: Record<Motion, string> = {
  none: "Immobile",
  pushIn: "Poussée avant",
  pullOut: "Recul lent",
  driftLeft: "Dérive gauche",
  driftRight: "Dérive droite",
};

export const TRANSITIONS = Object.keys(TRANSITION_LABELS) as Transition[];
export const MOTIONS = Object.keys(MOTION_LABELS) as Motion[];

export function activeGeneration(clip: ImageClip): Generation | null {
  if (clip.generations.length === 0) return null;
  return (
    clip.generations.find((g) => g.id === clip.activeGenerationId) ??
    clip.generations[clip.generations.length - 1]
  );
}
