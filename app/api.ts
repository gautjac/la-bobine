// Client for the studio server. API calls go through relative /api (Vite
// proxies them in dev; the server serves the built app in `npm run web`).
// Asset URLs inside Remotion props are ABSOLUTE (localhost:7788) so the same
// props work in the in-browser Player and in the headless render browser.

import type { Project } from "../src/lib/types";

export const SERVER_BASE = `http://${window.location.hostname}:7788`;
export const projectAssetBase = (id: string) => `${SERVER_BASE}/projects/${id}`;

export interface ProjectSummary {
  id: string;
  title: string;
  createdAt: number;
  duration: number;
  clipCount: number;
  generatedCount: number;
  aligned: boolean;
  thumb: string | null;
}

export interface Health {
  ok: boolean;
  keys: { fal: boolean; eleven: boolean; anthropic: boolean };
  models: { id: string; label: string; note: string }[];
  moviesDir: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!res.ok && res.headers.get("content-type")?.includes("json") !== true) {
    throw new Error(`serveur ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<Health>("/api/health"),
  projects: () => request<{ projects: ProjectSummary[] }>("/api/projects").then((r) => r.projects),
  project: (id: string) => request<{ project: Project }>(`/api/projects/${id}`).then((r) => r.project),
  save: (p: Project) => request<{ ok: boolean }>(`/api/projects/${p.id}`, { method: "PUT", body: JSON.stringify(p) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  ingest: (title: string, text: string, audioBase64: string) =>
    request<{ ok: boolean; error?: string; project?: Project }>("/api/ingest", {
      method: "POST",
      body: JSON.stringify({ title, text, audioBase64 }),
    }),
  realign: (id: string, text?: string) =>
    request<{ ok: boolean; error?: string; project?: Project }>(`/api/projects/${id}/realign`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  generate: (id: string, clipId: string, prompt: string, model: string, style: string) =>
    request<{ ok: boolean; error?: string; project?: Project }>(`/api/projects/${id}/generate`, {
      method: "POST",
      body: JSON.stringify({ clipId, prompt, model, style }),
    }),
  draftPrompts: (id: string, onlyEmpty: boolean) =>
    request<{ ok: boolean; error?: string; project?: Project }>(`/api/projects/${id}/draft-prompts`, {
      method: "POST",
      body: JSON.stringify({ onlyEmpty }),
    }),
  render: (id: string) =>
    request<{ ok: boolean; error?: string; path?: string; file?: string }>(`/api/projects/${id}/render`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  still: (id: string, frame: number) =>
    request<{ ok: boolean; error?: string; path?: string }>(`/api/projects/${id}/still`, {
      method: "POST",
      body: JSON.stringify({ frame }),
    }),
};

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
