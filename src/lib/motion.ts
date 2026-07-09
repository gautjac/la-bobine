// Ken Burns moves for still images — deliberately subtle. `progress` is the
// clip's own 0→1 life; the returned transform is applied to a cover-fit image.

import type { Motion } from "./types";

export interface MotionTransform {
  scale: number;
  tx: number;
  ty: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function motionTransform(motion: Motion, progress: number): MotionTransform {
  const p = Math.max(0, Math.min(1, progress));
  switch (motion) {
    case "pushIn":
      return { scale: lerp(1.04, 1.16, p), tx: 0, ty: lerp(6, -6, p) };
    case "pullOut":
      return { scale: lerp(1.16, 1.04, p), tx: 0, ty: lerp(-6, 6, p) };
    case "driftLeft":
      return { scale: 1.12, tx: lerp(30, -30, p), ty: 0 };
    case "driftRight":
      return { scale: 1.12, tx: lerp(-30, 30, p), ty: 0 };
    case "none":
      return { scale: 1, tx: 0, ty: 0 };
  }
}

export const motionToCss = ({ scale, tx, ty }: MotionTransform): string =>
  `scale(${scale.toFixed(4)}) translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
