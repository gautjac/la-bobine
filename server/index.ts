// La Bobine — the local studio server. Runs on Jac's Mac next to the Vite app:
//   npm run studio
//
// It owns the project library (projects/<id>/ on disk), the three external
// calls (ElevenLabs forced alignment, Fal image generation, Claude prompt
// drafting), and the Remotion render (spawned CLI → ~/Movies/La Bobine).
// Assets are served straight from projects/ with CORS + byte ranges, so the
// same absolute URLs feed the in-browser Player and the headless render.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePoem, flattenStanzas } from "../src/lib/poem";
import { lineWindows, stanzaCues, estimateCues, type AlignedChar } from "../src/lib/align";
import { buildRenderProps } from "../src/lib/timeline";
import { FAL_MODELS, DEFAULT_MODEL, getModel, fullPrompt } from "../src/lib/models";
import { slugify } from "../src/lib/format";
import {
  DEFAULT_CONTROLS,
  type ImageClip,
  type Project,
  type TextCue,
} from "../src/lib/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS = join(ROOT, "projects");
const OUT_DIR = join(ROOT, "out");
const APP_DIST = join(ROOT, "app", "dist");
const MOVIES = join(homedir(), "Movies", "La Bobine");
const PORT = Number(process.env.SERVER_PORT || 7788);

const FAL_KEY = process.env.FAL_KEY;
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

for (const d of [PROJECTS, OUT_DIR]) mkdirSync(d, { recursive: true });

// ---------- small plumbing ----------

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (res: ServerResponse, code: number, obj: unknown) => {
  res.writeHead(code, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(obj));
};
const readBody = (req: IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (d: Buffer) => {
      size += d.length;
      if (size > 400 * 1024 * 1024) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(d);
    });
    req.on("end", () => {
      const s = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });

const SAFE_ID = /^[a-z0-9-]+$/;
const pdir = (id: string, ...rest: string[]) => join(PROJECTS, id, ...rest);
const projectExists = (id: string) => SAFE_ID.test(id) && existsSync(pdir(id, "project.json"));
const readProject = (id: string): Project => JSON.parse(readFileSync(pdir(id, "project.json"), "utf8"));
const writeProject = (p: Project) => writeFileSync(pdir(p.id, "project.json"), JSON.stringify(p, null, 2) + "\n");
const assetBase = (id: string) => `http://localhost:${PORT}/projects/${id}`;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const mimeOf = (f: string) => MIME[extname(f).toLowerCase()] ?? "application/octet-stream";

/** Static file with byte-range support (audio seeking in the editor). */
function serveFile(req: IncomingMessage, res: ServerResponse, file: string) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, CORS).end();
    return;
  }
  const total = statSync(file).size;
  const type = mimeOf(file);
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m?.[1] ? parseInt(m[1], 10) : 0;
    let end = m?.[2] ? parseInt(m[2], 10) : total - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= total) end = total - 1;
    if (start > end) {
      res.writeHead(416, { "content-range": `bytes */${total}`, ...CORS }).end();
      return;
    }
    res.writeHead(206, {
      "content-type": type,
      "content-range": `bytes ${start}-${end}/${total}`,
      "accept-ranges": "bytes",
      "content-length": end - start + 1,
      "cache-control": "no-store",
      ...CORS,
    });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    "content-type": type,
    "content-length": total,
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    ...CORS,
  });
  createReadStream(file).pipe(res);
}

// ---------- alignment (ElevenLabs forced alignment → stanza cues) ----------

async function alignAudio(
  audioPath: string,
  stanzas: string[][],
  audioDuration: number,
): Promise<{ cues: TextCue[]; speechEnd: number; aligned: boolean }> {
  const lines = flattenStanzas(stanzas);
  if (!ELEVEN_KEY || lines.length === 0) {
    return { cues: estimateCues(stanzas, audioDuration), speechEnd: audioDuration, aligned: false };
  }
  try {
    const fd = new FormData();
    fd.append("file", new Blob([readFileSync(audioPath)], { type: "audio/mpeg" }), "vo.mp3");
    fd.append("text", lines.map((l) => l.text).join("\n"));
    const res = await fetch("https://api.elevenlabs.io/v1/forced-alignment", {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY },
      body: fd,
    });
    if (!res.ok) throw new Error(`forced-alignment ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { characters?: AlignedChar[] };
    const chars = data.characters ?? [];
    if (chars.length === 0) throw new Error("empty alignment");
    const windows = lineWindows(chars, lines.map((l) => l.text));
    const cues = stanzaCues(stanzas, windows, audioDuration);
    return { cues, speechEnd: chars[chars.length - 1].end, aligned: true };
  } catch (e) {
    console.error("alignment failed, falling back to estimate:", (e as Error).message);
    return { cues: estimateCues(stanzas, audioDuration), speechEnd: audioDuration, aligned: false };
  }
}

/** Default clips: one per stanza, spanning its cue, alternating gentle motion. */
function defaultClips(stanzas: string[][], cues: TextCue[]): ImageClip[] {
  return stanzas.map((_, i) => {
    const cue = cues.find((c) => c.stanzaIndex === i);
    const seconds = cue ? Math.max(2.5, Number((cue.end - cue.start).toFixed(2))) : 4;
    return {
      id: newId(),
      seconds,
      transition: i === 0 ? ("cut" as const) : ("crossfade" as const),
      transitionSeconds: 0.7,
      motion: i % 2 === 0 ? ("pushIn" as const) : ("pullOut" as const),
      prompt: "",
      model: DEFAULT_MODEL,
      activeGenerationId: null,
      generations: [],
    };
  });
}

// ---------- Fal generation ----------

async function generateImage(project: Project, clip: ImageClip): Promise<Project> {
  if (!FAL_KEY) throw new Error("FAL_KEY manquante dans .env");
  const prompt = fullPrompt(clip.prompt, project.style);
  if (!prompt) throw new Error("Écris un prompt pour cette image d'abord");
  const model = getModel(clip.model);
  const res = await fetch(`https://fal.run/${model.id}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(model.buildBody(prompt)),
  });
  if (!res.ok) throw new Error(`Fal ${res.status} (${model.id}) : ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { images?: { url?: string }[]; image?: { url?: string } };
  const url = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error(`Fal (${model.id}) n'a pas retourné d'image`);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());

  const genId = newId();
  const file = `${clip.id}-${genId}.jpg`;
  mkdirSync(pdir(project.id, "images"), { recursive: true });
  writeFileSync(pdir(project.id, "images", file), buf);

  const fresh = readProject(project.id);
  const target = fresh.clips.find((c) => c.id === clip.id);
  if (target) {
    target.generations.push({ id: genId, model: model.id, prompt: clip.prompt, file, createdAt: Date.now() });
    target.activeGenerationId = genId;
    target.prompt = clip.prompt;
    target.model = clip.model;
  }
  writeProject(fresh);
  return fresh;
}

// ---------- Claude art direction (drafts only — Jac's fields stay editable) ----------

async function artDirect(stanzaTexts: string[]): Promise<{ style: string; prompts: string[] }> {
  const fallback = {
    style: "cinematic still, muted evocative palette, soft natural light, no people, no text",
    prompts: stanzaTexts,
  };
  if (!ANTHROPIC_KEY) return fallback;
  const sys =
    'You are an art director turning a poem into a coherent set of image-generation prompts. Return STRICT JSON only: {"style": string, "prompts": string[]}. `style` is a shared trailing style clause (medium, palette, light, mood, and "no people, no text") applied to every image. `prompts` has EXACTLY one entry per stanza, in order — a concrete, evocative visual scene inspired by that stanza, one consistent world. The poem may be in French; write the prompts in English. No faces, no lettering.';
  const user =
    "Poem stanzas:\n" + stanzaTexts.map((t, i) => `${i + 1}. ${t}`).join("\n") + `\n\nReturn ${stanzaTexts.length} prompts.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2000, system: sys, messages: [{ role: "user", content: user }] }),
    });
    const data = (await res.json()) as { content?: { text?: string }[] };
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
      style?: string;
      prompts?: string[];
    };
    if (parsed.prompts?.length) {
      const prompts = parsed.prompts.slice(0, stanzaTexts.length);
      while (prompts.length < stanzaTexts.length) prompts.push(stanzaTexts[prompts.length]);
      return { style: (parsed.style ?? fallback.style).replace(/^,\s*/, ""), prompts };
    }
  } catch (e) {
    console.error("artDirect:", (e as Error).message);
  }
  return fallback;
}

// ---------- render ----------

function uniquePath(dir: string, name: string, ext: string): string {
  let candidate = join(dir, `${name}${ext}`);
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${name}-${n}${ext}`);
  return candidate;
}

function spawnRemotion(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["remotion", ...args, "--log=error"], { cwd: ROOT, stdio: "inherit" });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`remotion exited ${code}`))));
    child.on("error", reject);
  });
}

async function renderProject(id: string, kind: "video" | "still", frame = 0): Promise<string> {
  const project = readProject(id);
  const props = buildRenderProps(project, assetBase(id));
  const stamp = `${Date.now().toString(36)}`;
  const propsPath = join(OUT_DIR, `props-${stamp}.json`);
  writeFileSync(propsPath, JSON.stringify(props));
  mkdirSync(MOVIES, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const base = `${slugify(project.title)}-${day}`;
  try {
    if (kind === "video") {
      const tmp = join(OUT_DIR, `export-${stamp}.mp4`);
      await spawnRemotion(["render", "Bobine", tmp, `--props=${propsPath}`, "--crf=18"]);
      const dest = uniquePath(MOVIES, base, ".mp4");
      copyFileSync(tmp, dest);
      return dest;
    }
    const tmp = join(OUT_DIR, `poster-${stamp}.png`);
    await spawnRemotion(["still", "Bobine", tmp, `--props=${propsPath}`, `--frame=${frame}`]);
    const dest = uniquePath(MOVIES, `${base}-affiche`, ".png");
    copyFileSync(tmp, dest);
    return dest;
  } finally {
    rmSync(propsPath, { force: true });
  }
}

const revealInFinder = (path: string) => {
  try {
    execFileSync("open", ["-R", path], { stdio: "ignore" });
  } catch {
    /* headless — no Finder */
  }
};

// ---------- library ----------

interface ProjectSummary {
  id: string;
  title: string;
  createdAt: number;
  duration: number;
  clipCount: number;
  generatedCount: number;
  aligned: boolean;
  thumb: string | null;
}

function summarize(id: string): ProjectSummary {
  const p = readProject(id);
  const firstGen = p.clips
    .map((c) => c.generations.find((g) => g.id === c.activeGenerationId) ?? c.generations[c.generations.length - 1])
    .find(Boolean);
  return {
    id: p.id,
    title: p.title,
    createdAt: p.createdAt,
    duration: p.audio.duration,
    clipCount: p.clips.length,
    generatedCount: p.clips.filter((c) => c.generations.length > 0).length,
    aligned: p.audio.aligned,
    thumb: firstGen ? `/projects/${p.id}/images/${firstGen.file}` : null,
  };
}

const listProjects = (): ProjectSummary[] =>
  readdirSync(PROJECTS)
    .filter((d) => projectExists(d))
    .map(summarize)
    .sort((a, b) => b.createdAt - a.createdAt);

// ---------- HTTP ----------

const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (req.method === "OPTIONS") return json(res, 200, {});

    // --- api ---
    if (parts[0] === "api") {
      if (req.method === "GET" && parts[1] === "health") {
        return json(res, 200, {
          ok: true,
          keys: { fal: !!FAL_KEY, eleven: !!ELEVEN_KEY, anthropic: !!ANTHROPIC_KEY },
          models: FAL_MODELS.map(({ id, label, note }) => ({ id, label, note })),
          moviesDir: MOVIES,
        });
      }

      if (req.method === "GET" && parts[1] === "projects" && parts.length === 2) {
        return json(res, 200, { projects: listProjects() });
      }

      if (req.method === "POST" && parts[1] === "ingest") {
        const { title, text, audioBase64 } = (await readBody(req)) as {
          title?: string;
          text?: string;
          audioBase64?: string;
        };
        if (!text?.trim() || !audioBase64) return json(res, 400, { ok: false, error: "poème et audio requis" });
        const stanzas = parsePoem(text);
        if (stanzas.length === 0) return json(res, 400, { ok: false, error: "le poème est vide" });

        const id = `${slugify(title || stanzas[0][0]).slice(0, 24)}-${Date.now().toString(36)}`;
        mkdirSync(pdir(id, "images"), { recursive: true });
        const tmp = pdir(id, ".upload.tmp");
        writeFileSync(tmp, Buffer.from(audioBase64, "base64"));
        try {
          // Keep the mix intact: stereo, 44.1 kHz, generous bitrate.
          execFileSync("ffmpeg", ["-y", "-i", tmp, "-ac", "2", "-ar", "44100", "-b:a", "192k", pdir(id, "vo.mp3")], {
            stdio: "ignore",
          });
        } catch {
          rmSync(pdir(id), { recursive: true, force: true });
          return json(res, 400, { ok: false, error: "ffmpeg n'a pas pu lire ce fichier audio" });
        } finally {
          rmSync(tmp, { force: true });
        }
        const duration = Number(
          execFileSync(
            "ffprobe",
            ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", pdir(id, "vo.mp3")],
            { encoding: "utf8" },
          ).trim(),
        );

        const { cues, speechEnd, aligned } = await alignAudio(pdir(id, "vo.mp3"), stanzas, duration);
        const project: Project = {
          id,
          title: title?.trim() || stanzas[0][0].slice(0, 40),
          createdAt: Date.now(),
          poemText: text,
          stanzas,
          audio: { file: "vo.mp3", duration, speechEnd, aligned },
          cues,
          clips: defaultClips(stanzas, cues),
          controls: { ...DEFAULT_CONTROLS },
          style: "",
        };
        writeProject(project);
        return json(res, 200, { ok: true, project });
      }

      if (parts[1] === "projects" && parts[2]) {
        const id = parts[2];
        if (!projectExists(id)) return json(res, 404, { ok: false, error: "projet introuvable" });

        if (req.method === "GET" && parts.length === 3) return json(res, 200, { project: readProject(id) });

        if (req.method === "PUT" && parts.length === 3) {
          const patch = await readBody(req);
          const merged = { ...readProject(id), ...patch, id } as Project;
          writeProject(merged);
          return json(res, 200, { ok: true });
        }

        if (req.method === "DELETE" && parts.length === 3) {
          rmSync(pdir(id), { recursive: true, force: true });
          return json(res, 200, { ok: true });
        }

        if (req.method === "POST" && parts[3] === "realign") {
          const { text } = (await readBody(req)) as { text?: string };
          const p = readProject(id);
          if (typeof text === "string" && text.trim()) {
            p.poemText = text;
            p.stanzas = parsePoem(text);
          }
          const { cues, speechEnd, aligned } = await alignAudio(pdir(id, p.audio.file), p.stanzas, p.audio.duration);
          p.cues = cues;
          p.audio.speechEnd = speechEnd;
          p.audio.aligned = aligned;
          writeProject(p);
          return json(res, 200, { ok: true, project: p });
        }

        if (req.method === "POST" && parts[3] === "generate") {
          const { clipId, prompt, model, style } = (await readBody(req)) as {
            clipId?: string;
            prompt?: string;
            model?: string;
            style?: string;
          };
          const p = readProject(id);
          if (typeof style === "string") {
            p.style = style;
            writeProject(p);
          }
          const clip = p.clips.find((c) => c.id === clipId);
          if (!clip) return json(res, 404, { ok: false, error: "clip introuvable" });
          if (typeof prompt === "string") clip.prompt = prompt;
          if (typeof model === "string") clip.model = model;
          writeProject(p);
          try {
            const fresh = await generateImage(p, clip);
            return json(res, 200, { ok: true, project: fresh });
          } catch (e) {
            return json(res, 200, { ok: false, error: (e as Error).message });
          }
        }

        if (req.method === "POST" && parts[3] === "draft-prompts") {
          const { onlyEmpty = true } = (await readBody(req)) as { onlyEmpty?: boolean };
          const p = readProject(id);
          const stanzaTexts = p.stanzas.map((st) => st.join(" "));
          const { style, prompts } = await artDirect(stanzaTexts);
          p.clips.forEach((clip, i) => {
            const draft = prompts[Math.min(i, prompts.length - 1)] ?? "";
            if (!onlyEmpty || !clip.prompt.trim()) clip.prompt = draft;
          });
          if (!p.style.trim()) p.style = style;
          writeProject(p);
          return json(res, 200, { ok: true, project: p });
        }

        if (req.method === "POST" && parts[3] === "render") {
          try {
            const path = await renderProject(id, "video");
            revealInFinder(path);
            return json(res, 200, { ok: true, path, file: basename(path) });
          } catch (e) {
            return json(res, 200, { ok: false, error: (e as Error).message });
          }
        }

        if (req.method === "POST" && parts[3] === "still") {
          const { frame = 0 } = (await readBody(req)) as { frame?: number };
          try {
            const path = await renderProject(id, "still", Math.max(0, Math.round(frame)));
            revealInFinder(path);
            return json(res, 200, { ok: true, path, file: basename(path) });
          } catch (e) {
            return json(res, 200, { ok: false, error: (e as Error).message });
          }
        }
      }
      return json(res, 404, { ok: false, error: "route inconnue" });
    }

    // --- project assets: /projects/<id>/vo.mp3 · /projects/<id>/images/<file> ---
    if (req.method === "GET" && parts[0] === "projects" && parts[1] && SAFE_ID.test(parts[1])) {
      const rest = parts.slice(2).join("/");
      if (!rest || rest.includes("..")) {
        res.writeHead(404, CORS).end();
        return;
      }
      return serveFile(req, res, pdir(parts[1], rest));
    }

    // --- built app (npm run web — no Vite needed) ---
    if (req.method === "GET") {
      const rel = u.pathname === "/" ? "/index.html" : decodeURIComponent(u.pathname);
      if (!rel.includes("..")) {
        const f = join(APP_DIST, rel);
        if (existsSync(f) && statSync(f).isFile()) return serveFile(req, res, f);
        if (existsSync(join(APP_DIST, "index.html")) && !extname(rel))
          return serveFile(req, res, join(APP_DIST, "index.html"));
      }
    }

    res.writeHead(404, CORS).end();
  } catch (e) {
    json(res, 500, { ok: false, error: (e as Error).message });
  }
});

// Renders can outlast Node's default request timeout.
server.requestTimeout = 0;
server.headersTimeout = 60_000;

server.listen(PORT, () => {
  console.log(`La Bobine — serveur studio → http://localhost:${PORT}`);
  console.log(
    `  clés : Fal ${FAL_KEY ? "✓" : "✗"} · ElevenLabs ${ELEVEN_KEY ? "✓" : "✗"} · Anthropic ${ANTHROPIC_KEY ? "✓" : "✗"}`,
  );
});
