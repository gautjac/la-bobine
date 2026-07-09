import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef, type CallbackListener } from "@remotion/player";
import { Bobine } from "../src/Bobine";
import { buildRenderProps, distributeEvenly, FPS, toFrames, WIDTH, HEIGHT } from "../src/lib/timeline";
import type { Project } from "../src/lib/types";
import { DEFAULT_MODEL } from "../src/lib/models";
import { fmtTime, uid } from "../src/lib/format";
import { api, projectAssetBase, type Health } from "./api";
import { Timeline, type Selection } from "./Timeline";
import { Inspector } from "./Inspector";

type SaveState = "clean" | "dirty" | "saving" | "saved";
type Toast = { kind: "ok" | "err"; msg: string } | null;
type RenderState = { kind: "reel" | "affiche"; startedAt: number } | null;

const stageFor = (elapsed: number, kind: "reel" | "affiche") => {
  if (kind === "affiche") return "Rendu de l'image…";
  if (elapsed < 8) return "Préparation de la composition…";
  if (elapsed < 45) return "Rendu image par image (Remotion)…";
  return "Toujours en cours — une minute de reel prend quelques minutes…";
};

export const Editor: React.FC<{ id: string; health: Health | null; onClose: () => void }> = ({ id, health, onClose }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "project" });
  const [zoom, setZoom] = useState(60);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [busyClipId, setBusyClipId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [realigning, setRealigning] = useState(false);
  const [rendering, setRendering] = useState<RenderState>(null);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState<Toast>(null);

  const playerRef = useRef<PlayerRef>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;

  // ---------- load ----------
  useEffect(() => {
    api
      .project(id)
      .then(setProject)
      .catch(() => setToast({ kind: "err", msg: "Projet introuvable" }));
  }, [id]);

  // ---------- waveform peaks (decode only — nothing is played) ----------
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${projectAssetBase(id)}/${project.audio.file}`);
        const buf = await res.arrayBuffer();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(buf);
        await ctx.close();
        const ch = decoded.getChannelData(0);
        const buckets = 2400;
        const per = Math.max(1, Math.floor(ch.length / buckets));
        const out: number[] = [];
        for (let b = 0; b < buckets; b++) {
          let min = 0;
          let max = 0;
          const start = b * per;
          for (let i = start; i < Math.min(ch.length, start + per); i += 4) {
            if (ch[i] < min) min = ch[i];
            if (ch[i] > max) max = ch[i];
          }
          out.push(min, max);
        }
        if (!cancelled) setPeaks(out);
      } catch {
        /* waveform is a nicety — the lane just stays flat */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, project?.audio.file]);

  // ---------- autosave ----------
  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const p = projectRef.current;
      if (!p) return;
      setSaveState("saving");
      try {
        await api.save(p);
        setSaveState("saved");
      } catch {
        setSaveState("dirty");
        setToast({ kind: "err", msg: "Sauvegarde impossible — le serveur tourne ?" });
      }
    }, 800);
  }, []);

  const update = useCallback(
    (fn: (p: Project) => Project) => {
      setProject((p) => (p ? fn(p) : p));
      scheduleSave();
    },
    [scheduleSave],
  );

  /** Server-mutating calls need the latest doc on disk first. */
  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const p = projectRef.current;
    if (!p) return;
    setSaveState("saving");
    await api.save(p);
    setSaveState("saved");
  }, []);

  useEffect(() => () => {
    // Leaving the editor: flush any pending edit.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      const p = projectRef.current;
      if (p) void api.save(p);
    }
  }, []);

  // ---------- player sync ----------
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame: CallbackListener<"frameupdate"> = (e) => setPlayhead(e.detail.frame / FPS);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, [project === null]);

  const seek = useCallback((t: number) => {
    playerRef.current?.seekTo(Math.round(t * FPS));
    setPlayhead(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        playerRef.current?.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- render veil clock ----------
  useEffect(() => {
    if (!rendering) return;
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - rendering.startedAt) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [rendering]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------- server-backed actions ----------
  const generate = useCallback(
    async (clipId: string) => {
      const p = projectRef.current;
      if (!p) return;
      const clip = p.clips.find((c) => c.id === clipId);
      if (!clip) return;
      setBusyClipId(clipId);
      try {
        await flushSave();
        const res = await api.generate(p.id, clipId, clip.prompt, clip.model, p.style);
        if (!res.ok || !res.project) throw new Error(res.error || "la génération a échoué");
        const freshClip = res.project.clips.find((c) => c.id === clipId);
        if (freshClip) {
          // Merge only this clip's generations — edits made while waiting survive.
          setProject((cur) =>
            cur
              ? {
                  ...cur,
                  clips: cur.clips.map((c) =>
                    c.id === clipId
                      ? { ...c, generations: freshClip.generations, activeGenerationId: freshClip.activeGenerationId }
                      : c,
                  ),
                }
              : cur,
          );
        }
      } catch (e) {
        setToast({ kind: "err", msg: (e as Error).message });
      } finally {
        setBusyClipId(null);
      }
    },
    [flushSave],
  );

  const draftPrompts = useCallback(async () => {
    const p = projectRef.current;
    if (!p) return;
    setDrafting(true);
    try {
      await flushSave();
      const res = await api.draftPrompts(p.id, true);
      if (!res.ok || !res.project) throw new Error(res.error || "pas de propositions");
      const fresh = res.project;
      setProject((cur) =>
        cur
          ? {
              ...cur,
              style: cur.style.trim() ? cur.style : fresh.style,
              clips: cur.clips.map((c) => {
                const f = fresh.clips.find((fc) => fc.id === c.id);
                return f && !c.prompt.trim() ? { ...c, prompt: f.prompt } : c;
              }),
            }
          : cur,
      );
      setToast({ kind: "ok", msg: "Propositions déposées dans les prompts vides — modifie à ton goût." });
    } catch (e) {
      setToast({ kind: "err", msg: (e as Error).message });
    } finally {
      setDrafting(false);
    }
  }, [flushSave]);

  const realign = useCallback(async () => {
    const p = projectRef.current;
    if (!p) return;
    setRealigning(true);
    try {
      await flushSave();
      const res = await api.realign(p.id, p.poemText);
      if (!res.ok || !res.project) throw new Error(res.error || "le réalignement a échoué");
      const fresh = res.project;
      setProject((cur) => (cur ? { ...cur, stanzas: fresh.stanzas, cues: fresh.cues, audio: fresh.audio } : cur));
      setToast({ kind: "ok", msg: fresh.audio.aligned ? "Texte réaligné sur la narration ✓" : "Alignement indisponible — synchro estimée." });
    } catch (e) {
      setToast({ kind: "err", msg: (e as Error).message });
    } finally {
      setRealigning(false);
    }
  }, [flushSave]);

  const doRender = useCallback(
    async (kind: "reel" | "affiche") => {
      const p = projectRef.current;
      if (!p) return;
      playerRef.current?.pause();
      setElapsed(0);
      setRendering({ kind, startedAt: Date.now() });
      try {
        await flushSave();
        const res = kind === "reel" ? await api.render(p.id) : await api.still(p.id, toFrames(playhead));
        if (!res.ok || !res.path) throw new Error(res.error || "le rendu a échoué");
        setToast({ kind: "ok", msg: `${kind === "reel" ? "Reel exporté" : "Affiche exportée"} ✓ — ${res.path} (révélé dans le Finder)` });
      } catch (e) {
        setToast({ kind: "err", msg: (e as Error).message });
      } finally {
        setRendering(null);
      }
    },
    [flushSave, playhead],
  );

  const deleteProject = useCallback(async () => {
    const p = projectRef.current;
    if (!p) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await api.remove(p.id);
    onClose();
  }, [onClose]);

  // ---------- local clip operations ----------
  const moveClip = useCallback(
    (clipId: string, dir: -1 | 1) =>
      update((p) => {
        const i = p.clips.findIndex((c) => c.id === clipId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= p.clips.length) return p;
        const clips = [...p.clips];
        [clips[i], clips[j]] = [clips[j], clips[i]];
        return { ...p, clips };
      }),
    [update],
  );

  const removeClip = useCallback(
    (clipId: string) => {
      update((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== clipId) }));
      setSelection({ kind: "project" });
    },
    [update],
  );

  const addClip = useCallback(
    () =>
      update((p) => {
        const model = p.clips[p.clips.length - 1]?.model ?? DEFAULT_MODEL;
        const clip = {
          id: uid(),
          seconds: 4,
          transition: "crossfade" as const,
          transitionSeconds: 0.7,
          motion: "none" as const,
          prompt: "",
          model,
          activeGenerationId: null,
          generations: [],
        };
        setSelection({ kind: "clip", id: clip.id });
        return { ...p, clips: [...p.clips, clip] };
      }),
    [update],
  );

  const setActive = useCallback(
    (clipId: string, genId: string) =>
      update((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === clipId ? { ...c, activeGenerationId: genId } : c)),
      })),
    [update],
  );

  // ---------- derived ----------
  const renderProps = useMemo(() => (project ? buildRenderProps(project, projectAssetBase(project.id)) : null), [project]);

  if (!project || !renderProps) {
    return (
      <div className="library">
        <p className="hint">Ouverture de la bobine…</p>
      </div>
    );
  }

  const saveLabel = { clean: "", dirty: "modifié…", saving: "sauvegarde…", saved: "sauvegardé ✓" }[saveState];

  return (
    <div className="editor">
      <div className="topbar">
        <button className="btn small ghost" onClick={onClose}>
          ‹ Bibliothèque
        </button>
        <span className="title">{project.title}</span>
        {!project.audio.aligned ? <span className="tag warn">synchro estimée</span> : null}
        <span className="spacer" />
        <span className="save-state">{saveLabel}</span>
        <button className="btn" onClick={() => doRender("affiche")} disabled={!!rendering}>
          Affiche (PNG)
        </button>
        <button className="btn primary" onClick={() => doRender("reel")} disabled={!!rendering}>
          Exporter le reel
        </button>
      </div>

      <div className="workspace">
        <div className="preview-pane">
          <div className="player-shell">
            <Player
              ref={playerRef}
              component={Bobine}
              inputProps={renderProps}
              durationInFrames={renderProps.durationInFrames}
              fps={FPS}
              compositionWidth={WIDTH}
              compositionHeight={HEIGHT}
              style={{ width: "100%" }}
              controls={false}
              clickToPlay
              acknowledgeRemotionLicense
            />
          </div>
          <div className="transport">
            <button className="btn small" onClick={() => playerRef.current?.toggle()}>
              {playing ? "❚❚ Pause" : "► Jouer"}
            </button>
            <button className="btn small ghost" onClick={() => seek(0)} title="Retour au début">
              ⏮
            </button>
            <span className="time">
              {fmtTime(playhead)} / {fmtTime(project.audio.duration)}
            </span>
          </div>
          <p className="hint" style={{ width: "100%" }}>
            Espace = jouer/pauser · clique la règle pour naviguer
          </p>
        </div>

        <div className="inspector">
          <Inspector
            project={project}
            selection={selection}
            health={health}
            busyClipId={busyClipId}
            drafting={drafting}
            realigning={realigning}
            onUpdate={update}
            onGenerate={generate}
            onDraftPrompts={draftPrompts}
            onRealign={realign}
            onMoveClip={moveClip}
            onRemoveClip={removeClip}
            onSetActive={setActive}
            onDeleteProject={deleteProject}
          />
        </div>
      </div>

      <div className="timeline-pane">
        <div className="tl-toolbar">
          <button className="btn small" onClick={addClip}>
            + Image
          </button>
          <button
            className="btn small ghost"
            onClick={() =>
              update((p) => {
                const secs = distributeEvenly(p.clips.length, p.audio.duration);
                return { ...p, clips: p.clips.map((c, i) => ({ ...c, seconds: secs[i] ?? c.seconds })) };
              })
            }
            title="Donne la même durée à chaque image"
          >
            Répartir également
          </button>
          <span className="spacer" />
          <span>Zoom</span>
          <input
            type="range"
            min={20}
            max={160}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: 130 }}
          />
        </div>
        <Timeline
          project={project}
          peaks={peaks}
          playhead={playhead}
          zoom={zoom}
          selection={selection}
          onSeek={seek}
          onSelect={setSelection}
          onCueChange={(i, start, end) =>
            update((p) => ({ ...p, cues: p.cues.map((c, k) => (k === i ? { ...c, start, end } : c)) }))
          }
          onClipSeconds={(clipId, seconds) =>
            update((p) => ({ ...p, clips: p.clips.map((c) => (c.id === clipId ? { ...c, seconds } : c)) }))
          }
        />
      </div>

      {rendering ? (
        <div className="render-veil">
          <div className="render-card">
            <div className="reel-spin" />
            <h3>{rendering.kind === "reel" ? "Export du reel" : "Export de l'affiche"}</h3>
            <div className="stage">{stageFor(elapsed, rendering.kind)}</div>
            <div className="elapsed">{elapsed}s — le fichier atterrira dans ~/Movies/La Bobine</div>
          </div>
        </div>
      ) : null}

      {toast ? <div className={`toast ${toast.kind}`}>{toast.msg}</div> : null}
    </div>
  );
};
