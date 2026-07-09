// The right-hand panel: whatever is selected on the timeline gets its controls
// here — an image clip (prompt, model, gallery, durée, transition, motion), a
// stanza cue (timing), or the project itself (bande, typo, style, réalignage).

import React, { useState } from "react";
import type { Project, ImageClip, Motion, Transition } from "../src/lib/types";
import { MOTION_LABELS, TRANSITION_LABELS, TRANSITIONS, MOTIONS } from "../src/lib/types";
import { FONT_NAMES } from "../src/fonts";
import { fmtTime } from "../src/lib/format";
import { projectAssetBase, type Health } from "./api";
import type { Selection } from "./Timeline";

interface Props {
  project: Project;
  selection: Selection;
  health: Health | null;
  busyClipId: string | null;
  drafting: boolean;
  realigning: boolean;
  onUpdate: (fn: (p: Project) => Project) => void;
  onGenerate: (clipId: string) => void;
  onDraftPrompts: () => void;
  onRealign: () => void;
  onMoveClip: (clipId: string, dir: -1 | 1) => void;
  onRemoveClip: (clipId: string) => void;
  onSetActive: (clipId: string, genId: string) => void;
  onDeleteProject: () => void;
}

/** Two-step inline confirmation — destructive actions per the house doctrine. */
const ConfirmButton: React.FC<{ label: string; confirmLabel: string; className?: string; onConfirm: () => void }> = ({
  label,
  confirmLabel,
  className,
  onConfirm,
}) => {
  const [armed, setArmed] = useState(false);
  return (
    <button
      className={`btn ${className ?? ""}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          setTimeout(() => setArmed(false), 3500);
        } else {
          setArmed(false);
          onConfirm();
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
};

const ClipPanel: React.FC<Props & { clip: ImageClip; index: number }> = (p) => {
  const { clip, index, project } = p;
  const isLast = index === project.clips.length - 1;
  const busy = p.busyClipId === clip.id;
  const models = p.health?.models ?? [];
  const modelNote = models.find((m) => m.id === clip.model)?.note;
  const base = projectAssetBase(project.id);

  const setClip = (patch: Partial<ImageClip>) =>
    p.onUpdate((prj) => ({
      ...prj,
      clips: prj.clips.map((c) => (c.id === clip.id ? { ...c, ...patch } : c)),
    }));

  return (
    <div className="section">
      <h3>
        Image {index + 1}
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" disabled={index === 0} onClick={() => p.onMoveClip(clip.id, -1)} title="Déplacer vers la gauche">
          ←
        </button>
        <button className="btn small ghost" disabled={isLast} onClick={() => p.onMoveClip(clip.id, 1)} title="Déplacer vers la droite">
          →
        </button>
        {project.clips.length > 1 ? (
          <ConfirmButton label="Retirer" confirmLabel="Retirer ?" className="small danger ghost" onConfirm={() => p.onRemoveClip(clip.id)} />
        ) : null}
      </h3>

      <label className="field">
        <span>Prompt — la scène de cette image</span>
        <textarea
          rows={3}
          value={clip.prompt}
          onChange={(e) => setClip({ prompt: e.target.value })}
          placeholder="a wooden kitchen table at dawn, steam rising from a single cup…"
        />
      </label>

      <div className="row">
        <label className="field">
          <span>Modèle (via Fal)</span>
          <select value={clip.model} onChange={(e) => setClip({ model: e.target.value })}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {modelNote ? <p className="hint" style={{ marginTop: -6 }}>{modelNote}</p> : null}

      <button className="btn primary" onClick={() => p.onGenerate(clip.id)} disabled={busy || !clip.prompt.trim()}>
        {busy ? "Génération en cours…" : clip.generations.length ? "Régénérer" : "Générer l'image"}
      </button>
      {!clip.prompt.trim() ? <p className="hint" style={{ marginTop: 6 }}>Écris un prompt (ou demande des propositions dans l'onglet Bobine).</p> : null}

      {clip.generations.length > 0 ? (
        <>
          <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
            Générations — clique pour choisir celle qui joue :
          </p>
          <div className="gallery">
            {clip.generations.map((g) => {
              const active = g.id === (clip.activeGenerationId ?? clip.generations[clip.generations.length - 1].id);
              return (
                <button
                  key={g.id}
                  className={active ? "active" : ""}
                  onClick={() => p.onSetActive(clip.id, g.id)}
                  title={`${g.prompt}\n(${g.model})`}
                >
                  <img src={`${base}/images/${g.file}`} alt="" />
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <hr className="divider" />

      <div className="row">
        <label className="field">
          <span>Durée (s)</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={isLast ? "" : clip.seconds}
            placeholder={isLast ? "jusqu'à la fin" : undefined}
            disabled={isLast}
            onChange={(e) => setClip({ seconds: Math.max(0.5, Number(e.target.value) || 0.5) })}
          />
        </label>
        <label className="field">
          <span>Transition (entrée)</span>
          <select value={clip.transition} onChange={(e) => setClip({ transition: e.target.value as Transition })} disabled={index === 0}>
            {TRANSITIONS.map((t) => (
              <option key={t} value={t}>
                {TRANSITION_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Durée de transition (s)</span>
          <input
            type="number"
            min={0.1}
            max={3}
            step={0.1}
            value={clip.transitionSeconds}
            disabled={index === 0 || clip.transition === "cut"}
            onChange={(e) => setClip({ transitionSeconds: Math.min(3, Math.max(0.1, Number(e.target.value) || 0.7)) })}
          />
        </label>
        <label className="field">
          <span>Mouvement (Ken Burns)</span>
          <select value={clip.motion} onChange={(e) => setClip({ motion: e.target.value as Motion })}>
            {MOTIONS.map((m) => (
              <option key={m} value={m}>
                {MOTION_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isLast ? <p className="hint">La dernière image s'étire jusqu'à la fin de l'audio.</p> : null}
    </div>
  );
};

const CuePanel: React.FC<Props & { index: number }> = (p) => {
  const cue = p.project.cues[p.index];
  const stanza = p.project.stanzas[cue.stanzaIndex] ?? [];
  const dur = p.project.audio.duration;
  const setCue = (start: number, end: number) =>
    p.onUpdate((prj) => ({
      ...prj,
      cues: prj.cues.map((c, i) => (i === p.index ? { ...c, start, end } : c)),
    }));
  return (
    <div className="section">
      <h3>Strophe {cue.stanzaIndex + 1}</h3>
      <div
        style={{
          fontFamily: "Georgia, serif",
          fontSize: 15,
          lineHeight: 1.6,
          color: "var(--dim)",
          whiteSpace: "pre-line",
          borderLeft: "2px solid var(--line)",
          paddingLeft: 14,
          margin: "0 0 16px",
        }}
      >
        {stanza.join("\n")}
      </div>
      <div className="row">
        <label className="field">
          <span>Apparaît à (s)</span>
          <input
            type="number"
            min={0}
            max={dur}
            step={0.1}
            value={cue.start}
            onChange={(e) => setCue(Math.max(0, Math.min(cue.end - 0.5, Number(e.target.value) || 0)), cue.end)}
          />
        </label>
        <label className="field">
          <span>Disparaît à (s)</span>
          <input
            type="number"
            min={0}
            max={dur}
            step={0.1}
            value={cue.end}
            onChange={(e) => setCue(cue.start, Math.min(dur, Math.max(cue.start + 0.5, Number(e.target.value) || 0)))}
          />
        </label>
      </div>
      <p className="hint">
        {p.project.audio.aligned
          ? "Calé automatiquement sur ta narration — glisse le bloc sur la timeline pour ajuster."
          : "Synchro estimée (pas d'alignement) — ajuste à l'oreille sur la timeline."}
      </p>
    </div>
  );
};

const ProjectPanel: React.FC<Props> = (p) => {
  const { project } = p;
  const c = project.controls;
  const setControls = (patch: Partial<typeof c>) => p.onUpdate((prj) => ({ ...prj, controls: { ...prj.controls, ...patch } }));
  return (
    <div className="section">
      <h3>La bobine</h3>
      <label className="field">
        <span>Titre</span>
        <input type="text" value={project.title} onChange={(e) => p.onUpdate((prj) => ({ ...prj, title: e.target.value }))} />
      </label>

      <div className="row">
        <label className="field">
          <span>Bande de texte</span>
          <select value={c.bandPosition} onChange={(e) => setControls({ bandPosition: e.target.value as "bottom" | "top" })}>
            <option value="bottom">En bas</option>
            <option value="top">En haut</option>
          </select>
        </label>
        <label className="field">
          <span>Hauteur de bande — {Math.round(c.bandRatio * 100)}%</span>
          <input
            type="range"
            min={20}
            max={45}
            value={Math.round(c.bandRatio * 100)}
            onChange={(e) => setControls({ bandRatio: Number(e.target.value) / 100 })}
          />
        </label>
      </div>

      <div className="row">
        <label className="field">
          <span>Police du poème</span>
          <select value={c.font} onChange={(e) => setControls({ font: e.target.value })}>
            {FONT_NAMES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Taille — {c.fontSize}px</span>
          <input type="range" min={28} max={64} value={c.fontSize} onChange={(e) => setControls({ fontSize: Number(e.target.value) })} />
        </label>
      </div>

      <div className="row">
        <label className="field">
          <span>Couleur du texte</span>
          <input type="color" value={c.textColor} onChange={(e) => setControls({ textColor: e.target.value })} />
        </label>
        <label className="field">
          <span>Alignement</span>
          <select value={c.textAlign} onChange={(e) => setControls({ textAlign: e.target.value as "center" | "left" })}>
            <option value="center">Centré</option>
            <option value="left">À gauche</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>Crédit (petit, au bas de la bande)</span>
        <input type="text" value={c.credit} onChange={(e) => setControls({ credit: e.target.value })} />
      </label>

      <hr className="divider" />

      <label className="field">
        <span>Style partagé — ajouté à chaque prompt d'image</span>
        <textarea
          rows={2}
          value={project.style}
          onChange={(e) => p.onUpdate((prj) => ({ ...prj, style: e.target.value }))}
          placeholder="woodcut engraving, morning fog, muted amber palette, no people, no text"
        />
      </label>

      <button className="btn" onClick={p.onDraftPrompts} disabled={p.drafting || !p.health?.keys.anthropic}>
        {p.drafting ? "Claude lit le poème…" : "✳ Proposer des prompts (ébauches)"}
      </button>
      <p className="hint" style={{ marginTop: 6 }}>
        Remplit seulement les prompts vides — des propositions, à modifier à ton goût.
        {!p.health?.keys.anthropic ? " (Clé Anthropic absente du .env.)" : ""}
      </p>

      <hr className="divider" />

      <label className="field">
        <span>Le poème (ligne vide = strophe)</span>
        <textarea rows={8} value={project.poemText} onChange={(e) => p.onUpdate((prj) => ({ ...prj, poemText: e.target.value }))} />
      </label>
      <ConfirmButton
        label={p.realigning ? "Réalignement…" : "Réaligner le texte sur l'audio"}
        confirmLabel="Confirmer ? Remplace les repères actuels"
        onConfirm={p.onRealign}
      />
      <p className="hint" style={{ marginTop: 6 }}>
        Refait l'écoute ({fmtTime(project.audio.duration)} d'audio) et remplace tous les repères de strophes.
      </p>

      <hr className="divider" />
      <ConfirmButton label="Supprimer cette bobine" confirmLabel="Vraiment supprimer ? (définitif)" className="danger" onConfirm={p.onDeleteProject} />
    </div>
  );
};

export const Inspector: React.FC<Props> = (props) => {
  const { selection, project } = props;
  if (selection.kind === "clip") {
    const index = project.clips.findIndex((c) => c.id === selection.id);
    if (index >= 0) return <ClipPanel {...props} clip={project.clips[index]} index={index} />;
  }
  if (selection.kind === "cue" && project.cues[selection.index]) {
    return <CuePanel {...props} index={selection.index} />;
  }
  return <ProjectPanel {...props} />;
};
