// The Fal model menu. Config-driven on purpose: adding a model is one entry.
// Each entry builds its own request body because Fal's parameter dialects vary
// by family (FLUX takes a pixel-exact image_size, Ultra speaks aspect_ratio,
// Ideogram prefers the named presets).
//
// The image area is the frame minus the text band: 1080×1280 at the default ⅓
// band. The composition cover-fits, so a model that can only approximate the
// aspect (3:4) still lands cleanly.

export const IMG_WIDTH = 1080;
export const IMG_HEIGHT = 1280;

export interface FalModel {
  id: string;
  label: string;
  note: string;
  buildBody: (prompt: string) => Record<string, unknown>;
}

const exactSize = { image_size: { width: IMG_WIDTH, height: IMG_HEIGHT } };

export const FAL_MODELS: FalModel[] = [
  {
    id: "fal-ai/flux/schnell",
    label: "FLUX Schnell — brouillon éclair",
    note: "Quasi instantané, parfait pour esquisser le montage.",
    buildBody: (prompt) => ({
      prompt,
      ...exactSize,
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: false,
    }),
  },
  {
    id: "fal-ai/flux/dev",
    label: "FLUX Dev — l'atelier",
    note: "Le bon défaut : riche, fidèle au prompt.",
    buildBody: (prompt) => ({
      prompt,
      ...exactSize,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: false,
    }),
  },
  {
    id: "fal-ai/flux-pro/v1.1",
    label: "FLUX 1.1 Pro — qualité fine",
    note: "Plus lent, plus cher, très propre.",
    buildBody: (prompt) => ({
      prompt,
      ...exactSize,
      num_images: 1,
      enable_safety_checker: false,
      safety_tolerance: "5",
    }),
  },
  {
    id: "fal-ai/flux-pro/v1.1-ultra",
    label: "FLUX 1.1 Ultra — grand format",
    note: "Le plus détaillé (parle en ratio 3:4, recadré au montage).",
    buildBody: (prompt) => ({
      prompt,
      aspect_ratio: "3:4",
      num_images: 1,
      enable_safety_checker: false,
      safety_tolerance: "5",
    }),
  },
  {
    id: "fal-ai/recraft-v3",
    label: "Recraft V3 — illustration",
    note: "Fort en matières, gravure, design graphique.",
    buildBody: (prompt) => ({
      prompt,
      ...exactSize,
      num_images: 1,
    }),
  },
  {
    id: "fal-ai/ideogram/v3",
    label: "Ideogram V3 — graphique",
    note: "Compositions typographiques et affiches.",
    buildBody: (prompt) => ({
      prompt,
      image_size: "portrait_4_3",
      num_images: 1,
    }),
  },
];

export const DEFAULT_MODEL = "fal-ai/flux/dev";

export function getModel(id: string): FalModel {
  return FAL_MODELS.find((m) => m.id === id) ?? FAL_MODELS[1];
}

/** Prompt + shared style clause, the way fog-reel proved it out. */
export function fullPrompt(prompt: string, style: string): string {
  const p = prompt.trim();
  const s = style.trim().replace(/^,\s*/, "");
  return s ? `${p}, ${s}` : p;
}
