import React, { useEffect, useRef, useState } from "react";
import { api, fileToBase64, SERVER_BASE, type Health, type ProjectSummary } from "./api";
import { fmtTime } from "../src/lib/format";
import { OfflineBanner } from "./App";

const dateFmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long" });

export const Library: React.FC<{ health: Health | null; serverUp: boolean; onOpen: (id: string) => void }> = ({
  health,
  serverUp,
  onOpen,
}) => {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => api.projects().then(setProjects).catch(() => setProjects([]));
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    if (!text.trim() || !audio || busy) return;
    setBusy(true);
    setError("");
    try {
      const b64 = await fileToBase64(audio);
      const res = await api.ingest(title, text, b64);
      if (!res.ok || !res.project) throw new Error(res.error || "l'ingestion a échoué");
      onOpen(res.project.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const pickAudio = (files: FileList | null) => {
    const f = files?.[0];
    if (f) setAudio(f);
  };

  const missingEleven = health ? !health.keys.eleven : false;

  return (
    <div className="library">
      {!serverUp ? <OfflineBanner /> : null}
      <div className="masthead">
        <h1>
          La Bobine<span className="reel-dot">.</span>
        </h1>
        <span className="sub">un poème, une narration → un reel monté</span>
      </div>

      {(projects?.length ?? 0) === 0 ? (
        <div className="onboarding">
          <div className="step">
            <span className="n">1</span>
            <span>
              <b>Colle ton poème</b> — une ligne vide sépare les strophes
            </span>
          </div>
          <div className="step">
            <span className="n">2</span>
            <span>
              <b>Dépose ton audio</b> — le mix fini, narration + musique
            </span>
          </div>
          <div className="step">
            <span className="n">3</span>
            <span>
              <b>La Bobine cale le texte sur ta voix</b>, puis tu montes les images
            </span>
          </div>
        </div>
      ) : null}

      <div className="intake">
        <h2>Nouvelle bobine du matin</h2>
        <label className="field">
          <span>Titre</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Le poème d'aujourd'hui" />
        </label>
        <label className="field">
          <span>Poème (ligne vide = nouvelle strophe)</span>
          <textarea
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Le matin plie sa brume\ncomme un drap qu'on range\n\net la table attend, patiente,\nle premier café"}
          />
        </label>
        <label className="field">
          <span>Audio (narration + musique, le mix fini)</span>
          <div
            className={`dropzone ${dragOver ? "over" : ""} ${audio ? "filled" : ""}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickAudio(e.dataTransfer.files);
            }}
          >
            {audio ? `♪ ${audio.name}` : "Dépose ton fichier ici (mp3, wav, m4a…) ou clique"}
            <input
              ref={fileInput}
              type="file"
              accept="audio/*,.m4a,.aiff"
              style={{ display: "none" }}
              onChange={(e) => pickAudio(e.target.files)}
            />
          </div>
        </label>
        {missingEleven ? (
          <p className="hint">
            ⚠ Pas de clé ElevenLabs — la synchro sera estimée (et reste ajustable sur la timeline).
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="btn primary" onClick={create} disabled={busy || !text.trim() || !audio}>
          {busy ? "J'écoute ta narration…" : "Créer la bobine"}
        </button>
      </div>

      {projects && projects.length > 0 ? (
        <div className="cards">
          {projects.map((p) => (
            <button key={p.id} className="card" onClick={() => onOpen(p.id)}>
              <div className="thumb">{p.thumb ? <img src={`${SERVER_BASE}${p.thumb}`} alt="" /> : "◉"}</div>
              <div className="meta">
                <div className="t">{p.title}</div>
                <div className="d">
                  {dateFmt.format(p.createdAt)} · {fmtTime(p.duration)} · {p.generatedCount}/{p.clipCount} images
                  {p.aligned ? "" : " · synchro estimée"}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
