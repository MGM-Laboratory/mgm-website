import gsap from "gsap";

import type { ReelController } from "@/components/reel/reel-controller";
import type { ReelGlLayer } from "@/components/reel/gl/reel-gl";
import type { StandaloneGlHost } from "@/components/reel/gl/standalone-gl-host";
import { hardwareWebGL2 } from "@/components/reel/gl/webgl-probe";
import { onGlHost, setGlHost, type GlHost } from "@/lib/gl-host";
import { finePointer } from "@/lib/motion/pointer";
import { onReducedMotion } from "@/lib/reduced-motion";

/** Visible time to wait for the site's cursor-flow stage before bringing our own. */
const HOST_WAIT_S = 1.5;

/**
 * Runs the reel's WebGL layer when it can: a fine pointer, motion allowed
 * and hardware WebGL2 (or a cursor-flow stage already up, which did its
 * own checks). Called once the section is getting close, so three.js
 * loads only then, never with the page.
 *
 * Where it draws: into the cursor-flow stage (lib/gl-host.ts) when that
 * is up, so the cursor smears the video and the ribbon too; otherwise,
 * after 1.5 s of visible time without one, into a StandaloneGlHost of its
 * own. A stage that appears later takes the layer over (the standalone
 * one is dropped); one that goes away hands it back to a standalone host.
 * A lost context, a failed start or reduced motion returns the section to
 * its DOM version for the rest of the visit.
 *
 * `?noreelgl` keeps the DOM version (for checks).
 */
export function startReelGl(controller: ReelController) {
  if (
    !controller.motion ||
    !finePointer() ||
    new URLSearchParams(window.location.search).has("noreelgl")
  ) {
    return () => {};
  }

  let stopped = false;
  let failed = false;
  let layer: ReelGlLayer | null = null;
  let standalone: StandaloneGlHost | null = null;
  let flowHost: GlHost | null = null;
  let waited = 0;
  let loading: Promise<void> | null = null;
  let modules: {
    ReelGlLayer: typeof import("@/components/reel/gl/reel-gl").ReelGlLayer;
    StandaloneGlHost: typeof import("@/components/reel/gl/standalone-gl-host").StandaloneGlHost;
  } | null = null;

  const toDom = () => {
    failed = true;
    controller.setGlMode(false);
    layer?.dispose();
    layer = null;
    standalone?.dispose();
    standalone = null;
    gsap.ticker.remove(wait);
  };

  const load = () => {
    loading ??= Promise.all([
      import("@/components/reel/gl/reel-gl"),
      import("@/components/reel/gl/standalone-gl-host"),
    ]).then(([gl, host]) => {
      modules = { ReelGlLayer: gl.ReelGlLayer, StandaloneGlHost: host.StandaloneGlHost };
      if (process.env.NODE_ENV !== "production") {
        // Development only: stand in for the cursor-flow stage, to check the
        // hand-over both ways (window.__reelGl.fakeFlowHost(), then .clear()).
        Object.assign(window, {
          __reelGl: {
            fakeFlowHost: () => setGlHost(new host.StandaloneGlHost({ onContextLost: () => {} })),
            clear: () => setGlHost(null),
            layer: () => layer,
            state: () => ({
              failed,
              layer: Boolean(layer),
              standalone: Boolean(standalone),
              flowHost: Boolean(flowHost),
            }),
          },
        });
      }
    });
    return loading;
  };

  const ensureLayer = () => {
    if (layer || !modules) return layer;
    layer = new modules.ReelGlLayer(controller, () => {
      if (!stopped && !failed) controller.setGlMode(true);
    });
    return layer;
  };

  const attachTo = (host: GlHost) => {
    const target = ensureLayer();
    if (!target || target.attachedTo === host) return;
    target.attach(host);
    // Moving between hosts: the picture was already up, so the DOM can hide
    // again once the new host has drawn a frame.
    if (target.isReady) {
      requestAnimationFrame(() => {
        if (!stopped && !failed && layer === target) controller.setGlMode(true);
      });
    }
  };

  /** Puts the layer where it should draw now. */
  const place = () => {
    if (stopped || failed || !modules) return;
    try {
      if (flowHost) {
        attachTo(flowHost);
        standalone?.dispose();
        standalone = null;
        return;
      }
      if (waited < HOST_WAIT_S) return;
      if (!hardwareWebGL2()) {
        toDom();
        return;
      }
      standalone ??= new modules.StandaloneGlHost({ onContextLost: toDom });
      attachTo(standalone);
    } catch {
      // A context that couldn't be created, a shader that didn't compile.
      toDom();
    }
  };

  // Visible time only (the ticker stops in a hidden tab).
  function wait(_time: number, deltaMs: number) {
    waited += Math.min(deltaMs, 100) / 1000;
    if (waited >= HOST_WAIT_S) {
      gsap.ticker.remove(wait);
      void load().then(place, toDom);
    }
  }

  const offHost = onGlHost((host) => {
    const previous = flowHost;
    flowHost = host;
    if (host) {
      void load().then(place, toDom);
      return;
    }
    // The stage went away: if we were drawing into it, carry on alone.
    if (previous && layer?.attachedTo === previous) {
      layer.detach();
      controller.setGlMode(false);
      waited = HOST_WAIT_S;
      void load().then(place, toDom);
    }
  });
  if (!flowHost) {
    gsap.ticker.add(wait);
    // Start fetching three.js now, in parallel with the wait.
    void load().catch(() => {});
  }

  const offReduced = onReducedMotion(toDom);

  return () => {
    stopped = true;
    offHost();
    offReduced();
    gsap.ticker.remove(wait);
    controller.setGlMode(false);
    layer?.dispose();
    layer = null;
    standalone?.dispose();
    standalone = null;
  };
}
