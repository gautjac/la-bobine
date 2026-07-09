// Zod mirror of BobineProps (src/lib/timeline.ts) — the `satisfies` clause
// keeps the two definitions from drifting apart.

import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import type { BobineProps } from "./lib/timeline";

export const bobineSchema = z.object({
  audioUrl: z.string(),
  durationInFrames: z.number().int().min(1),
  bandPosition: z.enum(["bottom", "top"]),
  bandRatio: z.number().min(0.15).max(0.6),
  font: z.string(),
  fontSize: z.number().min(20).max(90),
  textColor: zColor(),
  textAlign: z.enum(["center", "left"]),
  showText: z.boolean(),
  credit: z.string(),
  cues: z.array(
    z.object({
      text: z.string(),
      from: z.number().int(),
      to: z.number().int(),
    }),
  ),
  clips: z.array(
    z.object({
      src: z.string().nullable(),
      from: z.number().int(),
      to: z.number().int(),
      transition: z.enum(["cut", "crossfade", "fadeblack"]),
      transitionF: z.number().int().min(1),
      motion: z.enum(["none", "pushIn", "pullOut", "driftLeft", "driftRight"]),
    }),
  ),
}) satisfies z.ZodType<BobineProps>;

export const DEFAULT_PROPS: BobineProps = {
  audioUrl: "",
  durationInFrames: 300,
  bandPosition: "bottom",
  bandRatio: 1 / 3,
  font: "Cormorant Garamond",
  fontSize: 44,
  textColor: "#f4efe6",
  textAlign: "center",
  showText: true,
  credit: "© Jac Gautreau",
  cues: [
    { text: "Le matin plie sa brume\ncomme un drap qu'on range", from: 10, to: 140 },
    { text: "et la table attend,\npatiente, le premier café", from: 150, to: 290 },
  ],
  clips: [
    { src: null, from: 0, to: 150, transition: "cut", transitionF: 21, motion: "pushIn" },
    { src: null, from: 150, to: 300, transition: "crossfade", transitionF: 21, motion: "pullOut" },
  ],
};
