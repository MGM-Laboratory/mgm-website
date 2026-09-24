import type { StartDetailStage } from "./contract";

/**
 * Starts the detail page's WebGL media stage (detail-engine.ts), or
 * resolves null when it can't run: no hardware-accelerated WebGL2, a failed
 * renderer or shader compile, or a container that left the page while the
 * stage was loading. Nothing is left behind and no item is claimed then, so
 * the page simply keeps its DOM media.
 *
 * This module never imports three.js itself: the engine (and three with
 * it) arrives through the dynamic import below, so importing this module
 * statically costs the page nothing.
 */

let webgl2Supported: boolean | null = null;

/**
 * three@0.186 is WebGL2-only. A software rasteriser would run a full-screen
 * canvas at a crawl, so a context that would be a major performance
 * caveat counts as no support.
 */
function supportsWebGL2() {
  if (webgl2Supported !== null) return webgl2Supported;
  try {
    const context = document
      .createElement("canvas")
      .getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    webgl2Supported = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2Supported = false;
  }
  return webgl2Supported;
}

export const startDetailStage: StartDetailStage = async (options) => {
  if (typeof window === "undefined" || !supportsWebGL2()) return null;
  try {
    const { DetailEngine } = await import("./detail-engine");
    if (!options.container.isConnected) return null;
    const engine = new DetailEngine(options);
    const ready = await engine.prepare();
    if (!ready || !options.container.isConnected) {
      engine.dispose();
      return null;
    }
    engine.start();
    return engine.handle;
  } catch {
    return null;
  }
};
