"use client";

import type { FormDesign } from "@repo/shared";

import type { ProjectColorScheme } from "@/lib/project-themes";

import type { SceneBus } from "./bus";
import { SceneDom } from "./scene-dom";
import type { Piece } from "./vocabulary";

export type SceneHostProps = {
  slug: string;
  design: FormDesign;
  scheme: ProjectColorScheme;
  pieces: { poster: Piece[]; extras: Piece[] };
  progress: number;
  complete: boolean;
  stage: "welcome" | "form" | "ending" | "status";
  bus?: SceneBus;
  forceStatic?: boolean;
};

/**
 * Picks the renderer for the scene. The DOM composition renders on the
 * server and stays whenever WebGL can't or shouldn't run.
 */
export function SceneHost({ pieces, progress, complete, stage, design }: SceneHostProps) {
  return (
    <div className="fx-layer fx-layer-scene" aria-hidden>
      <SceneDom
        poster={pieces.poster}
        extras={pieces.extras}
        progress={progress}
        complete={complete}
        interactive={design.motion.interactive}
        showFrame={stage === "form"}
      />
      <div className="fx-poster-probe" data-fx-poster />
    </div>
  );
}
