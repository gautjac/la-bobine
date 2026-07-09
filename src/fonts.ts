// The poem-band typefaces, loaded up front so the composition can switch live
// from the editor. Add one by importing another @remotion/google-fonts
// submodule and adding an entry + name.

import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as loadEBGaramond } from "@remotion/google-fonts/EBGaramond";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
import { loadFont as loadSpectral } from "@remotion/google-fonts/Spectral";
import { loadFont as loadQuicksand } from "@remotion/google-fonts/Quicksand";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

const cormorant = loadCormorant("normal", { weights: ["500", "600"], subsets: ["latin", "latin-ext"] }).fontFamily;
const ebGaramond = loadEBGaramond("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] }).fontFamily;
const fraunces = loadFraunces("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] }).fontFamily;
const playfair = loadPlayfair("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] }).fontFamily;
const lora = loadLora("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] }).fontFamily;
const spectral = loadSpectral("normal", { weights: ["300", "400"], subsets: ["latin", "latin-ext"] }).fontFamily;
const quicksand = loadQuicksand("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] }).fontFamily;
const spaceGrotesk = loadSpaceGrotesk("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] }).fontFamily;

export type FontSpec = { family: string; weight: number };

export const FONTS: Record<string, FontSpec> = {
  "Cormorant Garamond": { family: cormorant, weight: 600 },
  "EB Garamond": { family: ebGaramond, weight: 500 },
  Fraunces: { family: fraunces, weight: 400 },
  "Playfair Display": { family: playfair, weight: 400 },
  Lora: { family: lora, weight: 400 },
  Spectral: { family: spectral, weight: 300 },
  Quicksand: { family: quicksand, weight: 400 },
  "Space Grotesk": { family: spaceGrotesk, weight: 400 },
};

export const FONT_NAMES = Object.keys(FONTS);
export const DEFAULT_FONT = "Cormorant Garamond";
