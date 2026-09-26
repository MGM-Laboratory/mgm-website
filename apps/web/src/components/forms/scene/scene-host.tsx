"use client";

import { useEffect, useRef, useState } from "react";
import type { FormDesign } from "@repo/shared";

import { sceneColors } from "@/lib/forms/public-theme";
import type { ProjectColorScheme } from "@/lib/project-themes";
import { motionAllowed, onReducedMotion } from "@/lib/reduced-motion";

import type { SceneBus } from "./bus";
import type { FormSceneEngine } from "./gl/engine";
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

/** Renderers that are really a CPU (as the articles world rejects them): those get the DOM scene. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

let probed: boolean | null = null;

function hardwareWebGL2() {
  if (probed !== null) return probed;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) {
      probed = false;
      return probed;
    }
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    probed = !SOFTWARE_RENDERER.test(renderer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    probed = false;
  }
  return probed;
}

/**
 * Picks the scene's renderer. The DOM composition renders on the server and
 * stays whenever WebGL can't or shouldn't run: reduced motion, no hardware
 * WebGL2 (a software rasteriser counts as none), `?noscene`, a failed start
 * or a lost context. With WebGL the engine (three.js, a dynamic import, so
 * no other route ever loads it) draws the same pieces and the DOM ones hide
 * once its first frame is up.
 */
export function SceneHost({
  design,
  scheme,
  pieces,
  progress,
  complete,
  stage,
  bus,
  forceStatic,
}: SceneHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FormSceneEngine | null>(null);
  const [mode, setMode] = useState<"dom" | "gl">("dom");
  const scene = design.background.scene;
  const { intensity } = design.background;
  const interactive = design.motion.interactive;
  const theme = design.theme;

  // The latest values, for the engine's first frame.
  const live = useRef({ progress, complete, stage, scheme, theme });
  useEffect(() => {
    live.current = { progress, complete, stage, scheme, theme };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || scene === "none" || forceStatic) return;
    if (!motionAllowed() || /[?&]noscene\b/.test(window.location.search)) return;
    if (!hardwareWebGL2()) return;
    let cancelled = false;
    let engine: FormSceneEngine | null = null;
    const fail = () => {
      engine?.dispose();
      engine = null;
      engineRef.current = null;
      if (!cancelled) setMode("dom");
    };
    import("./gl/engine")
      .then(({ createFormScene }) => {
        if (cancelled) return;
        const current = live.current;
        try {
          engine = createFormScene(host, {
            scene,
            intensity,
            interactive,
            poster: pieces.poster,
            extras: pieces.extras,
            colors: sceneColors(current.theme, current.scheme),
            onReady: () => {
              if (!cancelled) setMode("gl");
            },
            onFail: fail,
          });
          engine.setState(current.progress, current.complete, current.stage);
          engineRef.current = engine;
        } catch {
          fail();
        }
      })
      .catch(fail);
    const offReduced = onReducedMotion(fail);
    const offBus = bus?.on((signal) => engineRef.current?.signal(signal));
    return () => {
      cancelled = true;
      offReduced();
      offBus?.();
      engine?.dispose();
      engineRef.current = null;
      setMode("dom");
    };
  }, [bus, forceStatic, interactive, intensity, pieces, scene]);

  useEffect(() => {
    engineRef.current?.setState(progress, complete, stage);
  }, [progress, complete, stage, mode]);

  useEffect(() => {
    engineRef.current?.setColors(sceneColors(theme, scheme));
  }, [theme, scheme, mode]);

  return (
    <div
      ref={hostRef}
      className="fx-layer fx-layer-scene"
      data-scene-mode={mode}
      data-scene={scene}
      aria-hidden
    >
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
