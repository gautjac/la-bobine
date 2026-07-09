import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { FONTS, DEFAULT_FONT, type FontSpec } from "./fonts";
import type { BobineProps, ClipProps, CueProps } from "./lib/timeline";
import { WIDTH, HEIGHT, HEAD_FADE_F, TAIL_FADE_F, CUE_FADE_F, CARD_FADE_F } from "./lib/timeline";
import { motionTransform, motionToCss } from "./lib/motion";

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// A slot with no generation yet: a quiet plate, legible in the preview without
// baking any UI chrome into a render.
const EmptyPlate: React.FC = () => (
  <AbsoluteFill
    style={{
      background: "radial-gradient(ellipse at 50% 42%, #1c1917 0%, #0c0a09 70%)",
    }}
  />
);

// --- Opening title card: black, the title, dissolving into the reel ---
const TitleCard: React.FC<{ title: string; spec: FontSpec; color: string; holdF: number }> = ({ title, spec, color, holdF }) => {
  const f = useCurrentFrame();
  const cardOpacity = interpolate(f, [holdF, holdF + CARD_FADE_F], [1, 0], clampOpts);
  const textOpacity = interpolate(f, [0, CARD_FADE_F], [0, 1], clampOpts);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity: cardOpacity, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: spec.family,
          fontWeight: spec.weight,
          fontSize: 68,
          color,
          opacity: textOpacity,
          textAlign: "center",
          lineHeight: 1.25,
          letterSpacing: "0.015em",
          padding: "0 90px",
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};

// --- Closing card: the whole poem + credit, over the music outro ---
const ClosingCard: React.FC<{ poem: string[][]; credit: string; spec: FontSpec; color: string; opacity: number }> = ({
  poem,
  credit,
  spec,
  color,
  opacity,
}) => {
  const lineCount = poem.reduce((n, st) => n + st.length, 0) + poem.length - 1;
  const fontSize = lineCount > 22 ? 24 : lineCount > 14 ? 28 : 33;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 900, padding: "0 70px", textAlign: "center" }}>
          {poem.map((stanza, si) => (
            <div key={si} style={{ marginBottom: si < poem.length - 1 ? Math.round(fontSize * 0.8) : 0 }}>
              {stanza.map((line, li) => (
                <div
                  key={li}
                  style={{
                    fontFamily: spec.family,
                    fontWeight: spec.weight,
                    fontSize,
                    lineHeight: 1.45,
                    letterSpacing: "0.012em",
                    color,
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      {credit ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 64,
            textAlign: "center",
            fontFamily: spec.family,
            fontWeight: spec.weight,
            fontSize: 17,
            letterSpacing: "0.08em",
            color,
            opacity: 0.5,
          }}
        >
          {credit}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const Clip: React.FC<{
  clip: ClipProps;
  next: ClipProps | null;
  isFirst: boolean;
  seqFrom: number;
}> = ({ clip, next, isFirst, seqFrom }) => {
  const abs = seqFrom + useCurrentFrame();
  const T = clip.transitionF;

  let fadeIn = 1;
  if (!isFirst) {
    if (clip.transition === "cut") fadeIn = abs >= clip.from ? 1 : 0;
    else if (clip.transition === "fadeblack")
      fadeIn = interpolate(abs, [clip.from, clip.from + T], [0, 1], clampOpts);
    else
      fadeIn = interpolate(
        abs,
        [clip.from - T / 2, clip.from + T / 2],
        [0, 1],
        clampOpts,
      );
  }
  const fadeOut =
    next && next.transition === "fadeblack"
      ? interpolate(abs, [clip.to - next.transitionF, clip.to], [1, 0], clampOpts)
      : 1;
  const opacity = Math.min(fadeIn, fadeOut);
  if (opacity <= 0.001) return null;

  const progress = interpolate(abs, [clip.from, clip.to], [0, 1], clampOpts);
  const transform = motionToCss(motionTransform(clip.motion, progress));

  return (
    <AbsoluteFill style={{ opacity }}>
      {clip.src ? (
        <Img
          pauseWhenLoading
          src={clip.src}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform, willChange: "transform" }}
        />
      ) : (
        <EmptyPlate />
      )}
    </AbsoluteFill>
  );
};

const ImageArea: React.FC<{ top: number; height: number; clips: ClipProps[] }> = ({ top, height, clips }) => {
  return (
    <div style={{ position: "absolute", top, left: 0, width: WIDTH, height, overflow: "hidden", backgroundColor: "#000" }}>
      {clips.map((clip, i) => {
        const isFirst = i === 0;
        const isLast = i === clips.length - 1;
        const next = isLast ? null : clips[i + 1];
        // The sequence must span the clip's own entering overlap and the next
        // clip's incoming crossfade half-window.
        const seqFrom = isFirst
          ? 0
          : clip.transition === "crossfade"
            ? Math.max(0, Math.floor(clip.from - clip.transitionF / 2))
            : clip.from;
        const seqEnd = next && next.transition === "crossfade" ? Math.ceil(clip.to + next.transitionF / 2) : clip.to;
        return (
          <Sequence key={i} from={seqFrom} durationInFrames={Math.max(1, seqEnd - seqFrom)} name={`Image ${i + 1}`} layout="none">
            <Clip clip={clip} next={next} isFirst={isFirst} seqFrom={seqFrom} />
          </Sequence>
        );
      })}
    </div>
  );
};

const Band: React.FC<{
  top: number;
  height: number;
  cues: CueProps[];
  spec: FontSpec;
  fontSize: number;
  textColor: string;
  textAlign: "center" | "left";
  credit: string;
}> = ({ top, height, cues, spec, fontSize, textColor, textAlign, credit }) => {
  const frame = useCurrentFrame();
  const pad = 84;
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        width: WIDTH,
        height,
        backgroundColor: "#000",
        overflow: "hidden",
      }}
    >
      {cues.map((cue, i) => {
        const opacity = Math.min(
          interpolate(frame, [cue.from, cue.from + CUE_FADE_F], [0, 1], clampOpts),
          interpolate(frame, [cue.to - CUE_FADE_F, cue.to], [1, 0], clampOpts),
        );
        if (opacity <= 0.001) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: textAlign === "center" ? "center" : "flex-start",
              padding: `0 ${pad}px`,
              opacity,
            }}
          >
            <div
              style={{
                fontFamily: spec.family,
                fontWeight: spec.weight,
                fontSize,
                lineHeight: 1.5,
                letterSpacing: "0.012em",
                color: textColor,
                textAlign,
                whiteSpace: "pre-line",
              }}
            >
              {cue.text}
            </div>
          </div>
        );
      })}
      {credit ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 26,
            textAlign: "center",
            fontFamily: spec.family,
            fontWeight: spec.weight,
            fontSize: 16,
            letterSpacing: "0.08em",
            color: textColor,
            opacity: 0.38,
          }}
        >
          {credit}
        </div>
      ) : null}
    </div>
  );
};

// The body: audio + images + band, handing off to the closing card. Runs
// inside a Sequence starting at titleF, so its frames are body-relative —
// exactly the clock the cues and clips are laid on.
const Body: React.FC<{ p: BobineProps; bodyF: number; spec: FontSpec }> = ({ p, bodyF, spec }) => {
  const f = useCurrentFrame();
  const bandH = Math.round(HEIGHT * p.bandRatio);
  const bandTop = p.bandPosition === "top" ? 0 : HEIGHT - bandH;
  const imageTop = p.bandPosition === "top" ? bandH : 0;
  const imageH = HEIGHT - bandH;

  const closingOn = p.showClosingCard && p.closingStartF < bodyF;
  const reelOpacity = closingOn
    ? interpolate(f, [p.closingStartF, p.closingStartF + CARD_FADE_F], [1, 0], clampOpts)
    : 1;
  const closingOpacity = closingOn ? 1 - reelOpacity : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {p.audioUrl ? <Audio src={p.audioUrl} /> : null}
      {reelOpacity > 0.001 ? (
        <AbsoluteFill style={{ opacity: reelOpacity }}>
          <ImageArea top={imageTop} height={imageH} clips={p.clips} />
          {p.showText ? (
            <Band
              top={bandTop}
              height={bandH}
              cues={p.cues}
              spec={spec}
              fontSize={p.fontSize}
              textColor={p.textColor}
              textAlign={p.textAlign}
              credit={p.credit}
            />
          ) : (
            <div style={{ position: "absolute", top: bandTop, left: 0, width: WIDTH, height: bandH, backgroundColor: "#000" }} />
          )}
        </AbsoluteFill>
      ) : null}
      {closingOpacity > 0.001 ? (
        <ClosingCard poem={p.poem} credit={p.credit} spec={spec} color={p.textColor} opacity={closingOpacity} />
      ) : null}
    </AbsoluteFill>
  );
};

export const Bobine: React.FC<BobineProps> = (p) => {
  const frame = useCurrentFrame();
  const spec = FONTS[p.font] ?? FONTS[DEFAULT_FONT];
  const bodyF = p.durationInFrames - p.titleF;

  // The title card fades itself in from black; the plain head fade is only
  // for reels without one.
  const headFade = p.titleF > 0 ? 0 : interpolate(frame, [0, HEAD_FADE_F], [1, 0], clampOpts);
  const tailFade = interpolate(
    frame,
    [p.durationInFrames - TAIL_FADE_F, p.durationInFrames],
    [0, 1],
    clampOpts,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence from={p.titleF} durationInFrames={Math.max(1, bodyF)} name="Bobine" layout="none">
        <Body p={p} bodyF={bodyF} spec={spec} />
      </Sequence>
      {p.titleF > 0 ? (
        <Sequence from={0} durationInFrames={p.titleF + CARD_FADE_F} name="Carte-titre" layout="none">
          <TitleCard title={p.title} spec={spec} color={p.textColor} holdF={p.titleF} />
        </Sequence>
      ) : null}
      {headFade > 0.001 ? <AbsoluteFill style={{ backgroundColor: "#000", opacity: headFade }} /> : null}
      {tailFade > 0.001 ? <AbsoluteFill style={{ backgroundColor: "#000", opacity: tailFade }} /> : null}
    </AbsoluteFill>
  );
};
