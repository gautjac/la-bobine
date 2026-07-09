// The three-lane timeline: images (drag the right edge to retime), stanza cues
// (drag to move, edges to trim), and the audio waveform (click to scrub).
// All frame math comes from src/lib/timeline so the lanes match the render.

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../src/lib/types";
import { activeGeneration } from "../src/lib/types";
import { clipStartSeconds, dropTargetIndex } from "../src/lib/timeline";
import { fmtTime } from "../src/lib/format";
import { projectAssetBase } from "./api";

export type Selection = { kind: "project" } | { kind: "clip"; id: string } | { kind: "cue"; index: number };

const PAD = 16; // left padding before t=0, px

interface Props {
  project: Project;
  peaks: number[] | null; // interleaved min/max buckets
  playhead: number;
  zoom: number; // px per second
  selection: Selection;
  onSeek: (t: number) => void;
  onSelect: (sel: Selection) => void;
  onCueChange: (index: number, start: number, end: number) => void;
  onClipSeconds: (clipId: string, seconds: number) => void;
  onReorderClip: (from: number, to: number) => void;
}

/** Generic horizontal drag: calls cb with the delta in seconds since drag start. */
function useDragSeconds(zoom: number) {
  return (e: React.PointerEvent, cb: (deltaSeconds: number) => void) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const move = (ev: PointerEvent) => cb((ev.clientX - startX) / zoom);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}

const Waveform: React.FC<{ peaks: number[] | null; width: number; height: number }> = ({ peaks, width, height }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    if (!peaks || peaks.length < 4) {
      ctx.fillStyle = "rgba(163,150,138,0.25)";
      ctx.fillRect(0, height / 2 - 0.5, width, 1);
      return;
    }
    const buckets = peaks.length / 2;
    const mid = height / 2;
    ctx.fillStyle = "rgba(242,163,60,0.55)";
    for (let x = 0; x < width; x++) {
      const b = Math.min(buckets - 1, Math.floor((x / width) * buckets));
      const min = peaks[b * 2];
      const max = peaks[b * 2 + 1];
      const y1 = mid + min * mid * 0.92;
      const y2 = mid + max * mid * 0.92;
      ctx.fillRect(x, Math.min(y1, y2), 1, Math.max(1, Math.abs(y2 - y1)));
    }
  }, [peaks, width, height]);
  return <canvas ref={ref} className="tl-wave" style={{ width, height }} />;
};

export const Timeline: React.FC<Props> = ({
  project,
  peaks,
  playhead,
  zoom,
  selection,
  onSeek,
  onSelect,
  onCueChange,
  onClipSeconds,
  onReorderClip,
}) => {
  const duration = project.audio.duration;
  const width = duration * zoom;
  const drag = useDragSeconds(zoom);
  const x = (t: number) => PAD + t * zoom;

  const starts = useMemo(
    () => clipStartSeconds(project.clips.map((c) => c.seconds), duration),
    [project.clips, duration],
  );

  // --- drag an image block to reorder it ---
  const [clipDrag, setClipDrag] = useState<{ from: number; dx: number; target: number } | null>(null);
  const clipBoundsPx = useMemo(
    () =>
      project.clips.map((_, k) => ({
        start: x(starts[k]),
        end: x(k === project.clips.length - 1 ? duration : starts[k + 1]),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [starts, duration, zoom, project.clips.length],
  );

  const startClipDrag = (e: React.PointerEvent, i: number) => {
    onSelect({ kind: "clip", id: project.clips[i].id });
    e.preventDefault();
    const startX = e.clientX;
    const bounds = clipBoundsPx;
    const center0 = (bounds[i].start + bounds[i].end) / 2;
    let started = false; // 6 px of intent before a click becomes a drag
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!started && Math.abs(dx) > 6) started = true;
      if (started) setClipDrag({ from: i, dx, target: dropTargetIndex(bounds, i, center0 + dx) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setClipDrag(null);
      if (started) {
        const target = dropTargetIndex(bounds, i, center0 + (ev.clientX - startX));
        if (target !== i) onReorderClip(i, target);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const tickStep = zoom >= 90 ? 1 : zoom >= 45 ? 2 : zoom >= 18 ? 5 : 10;
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= duration; t += tickStep) out.push(t);
    return out;
  }, [duration, tickStep]);

  const seekFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - rect.left - PAD) / zoom;
    onSeek(Math.max(0, Math.min(duration, t)));
  };

  const base = projectAssetBase(project.id);

  return (
    <div className="tl-scroll">
      <div className="tl-canvas" style={{ width: width + PAD * 2 }}>
        <div
          className="tl-ruler"
          onPointerDown={(e) => {
            seekFromEvent(e);
            const el = e.currentTarget;
            const move = (ev: PointerEvent) => {
              const rect = el.getBoundingClientRect();
              const t = (ev.clientX - rect.left - PAD) / zoom;
              onSeek(Math.max(0, Math.min(duration, t)));
            };
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        >
          {ticks.map((t) => (
            <div key={t} className="tick" style={{ left: x(t) }}>
              {fmtTime(t)}
            </div>
          ))}
        </div>

        {/* images */}
        <div className="tl-lane">
          <span className="lane-label">Images</span>
          {project.clips.map((clip, i) => {
            const isLast = i === project.clips.length - 1;
            const start = starts[i];
            const end = isLast ? duration : starts[i + 1];
            const gen = activeGeneration(clip);
            const selected = selection.kind === "clip" && selection.id === clip.id;
            const dragging = clipDrag?.from === i;
            return (
              <div
                key={clip.id}
                className={`tl-block clip ${gen ? "" : "empty"} ${selected ? "selected" : ""} ${dragging ? "dragging" : ""}`}
                style={{
                  left: x(start),
                  width: Math.max(10, (end - start) * zoom),
                  transform: dragging ? `translateX(${clipDrag.dx}px)` : undefined,
                }}
                onPointerDown={(e) => startClipDrag(e, i)}
                title={clip.prompt || `Image ${i + 1}`}
              >
                {gen ? (
                  <div className="bg">
                    <img src={`${base}/images/${gen.file}`} alt="" draggable={false} />
                  </div>
                ) : null}
                <div className="label">
                  {i + 1} · {clip.prompt ? clip.prompt : "à générer"}
                </div>
                {!isLast ? (
                  <div
                    className="grip r"
                    onPointerDown={(e) => {
                      onSelect({ kind: "clip", id: clip.id });
                      const orig = clip.seconds;
                      drag(e, (d) => onClipSeconds(clip.id, Math.max(0.5, Number((orig + d).toFixed(2)))));
                    }}
                  />
                ) : null}
              </div>
            );
          })}
          {clipDrag && clipDrag.target !== clipDrag.from ? (
            <div
              className="tl-drop"
              style={{
                left:
                  clipDrag.target > clipDrag.from
                    ? clipBoundsPx[clipDrag.target].end
                    : clipBoundsPx[clipDrag.target].start,
              }}
            />
          ) : null}
        </div>

        {/* stanza cues */}
        <div className="tl-lane">
          <span className="lane-label">Texte — strophes</span>
          {project.cues.map((cue, i) => {
            const selected = selection.kind === "cue" && selection.index === i;
            const stanza = project.stanzas[cue.stanzaIndex] ?? [];
            return (
              <div
                key={i}
                className={`tl-block cue ${selected ? "selected" : ""}`}
                style={{ left: x(cue.start), width: Math.max(10, (cue.end - cue.start) * zoom) }}
                onPointerDown={(e) => {
                  onSelect({ kind: "cue", index: i });
                  const s0 = cue.start;
                  const e0 = cue.end;
                  drag(e, (d) => {
                    const len = e0 - s0;
                    const s = Math.max(0, Math.min(duration - len, s0 + d));
                    onCueChange(i, Number(s.toFixed(2)), Number((s + len).toFixed(2)));
                  });
                }}
                title={stanza.join(" / ")}
              >
                <div className="label">{stanza.join(" · ")}</div>
                <div
                  className="grip l"
                  onPointerDown={(e) => {
                    onSelect({ kind: "cue", index: i });
                    const s0 = cue.start;
                    drag(e, (d) => onCueChange(i, Number(Math.max(0, Math.min(cue.end - 0.5, s0 + d)).toFixed(2)), cue.end));
                  }}
                />
                <div
                  className="grip r"
                  onPointerDown={(e) => {
                    onSelect({ kind: "cue", index: i });
                    const e0 = cue.end;
                    drag(e, (d) =>
                      onCueChange(i, cue.start, Number(Math.min(duration, Math.max(cue.start + 0.5, e0 + d)).toFixed(2)),
                      ),
                    );
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* audio */}
        <div className="tl-lane audio" onPointerDown={seekFromEvent}>
          <span className="lane-label">Audio</span>
          <div style={{ position: "absolute", left: PAD, top: 12, right: PAD }}>
            <Waveform peaks={peaks} width={width} height={32} />
          </div>
        </div>

        <div className="tl-playhead" style={{ left: x(playhead) }} />
      </div>
    </div>
  );
};
