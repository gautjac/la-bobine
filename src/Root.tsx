import React from "react";
import { Composition } from "remotion";
import { Bobine } from "./Bobine";
import { bobineSchema, DEFAULT_PROPS } from "./schema";
import { FPS, WIDTH, HEIGHT } from "./lib/timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Bobine"
      component={Bobine}
      schema={bobineSchema}
      defaultProps={DEFAULT_PROPS}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
    />
  );
};
