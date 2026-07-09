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
  {
    id: "fal-ai/flux-2-dev",
    label: "FLUX.2 Dev — la relève",
    note: "La nouvelle génération FLUX (32B), ouverte.",
    buildBody: (prompt) => ({
      prompt,
      ...exactSize,
      output_format: "jpeg",
      enable_safety_checker: false,
    }),
  },
  {
    id: "fal-ai/flux-2-pro",
    label: "FLUX.2 Pro — le nouveau standard",
    note: "Fidélité de scène et typographie nettement meilleures.",
    buildBody: (prompt) => ({
      prompt,
      ...exactSize,
      output_format: "jpeg",
      safety_tolerance: 5,
      enable_safety_checker: false,
    }),
  },
  {
    id: "fal-ai/flux-2-max",
    label: "FLUX.2 Max — le sommet",
    note: "Le plus fort de la famille FLUX; plus lent, plus cher.",
    buildBody: (prompt) => ({
      prompt,
      ...exactSize,
      output_format: "jpeg",
      safety_tolerance: 5,
      enable_safety_checker: false,
    }),
  },
  {
    id: "fal-ai/nano-banana-2",
    label: "Nano Banana 2 (Google) — l'obéissant",
    note: "Suit les consignes à la lettre, très naturel.",
    buildBody: (prompt) => ({
      prompt,
      aspect_ratio: "3:4",
      resolution: "1K",
      num_images: 1,
      output_format: "jpeg",
    }),
  },
  {
    id: "fal-ai/bytedance/seedream/v5/lite/text-to-image",
    label: "Seedream 5.0 Lite — le raisonneur",
    note: "Réfléchit avant de peindre; détail 2K, 3,5 ¢.",
    buildBody: (prompt) => ({
      prompt,
      image_size: "portrait_4_3",
      num_images: 1,
    }),
  },
  {
    id: "fal-ai/imagen4",
    label: "Imagen 4 (Google) — photoréaliste",
    note: "Lumière et matières photographiques.",
    buildBody: (prompt) => ({
      prompt,
      aspect_ratio: "3:4",
      num_images: 1,
      output_format: "jpeg",
    }),
  },
  {
    id: "fal-ai/luma-photon",
    label: "Luma Photon — le cinéaste",
    note: "Regard cinématographique, très économique.",
    buildBody: (prompt) => ({
      prompt,
      aspect_ratio: "3:4",
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
