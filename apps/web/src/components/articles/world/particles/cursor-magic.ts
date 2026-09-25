import { Vector3, type PerspectiveCamera } from "three";

import { frontRadiusAlong, type ThemeFront } from "@/components/articles/world/fx/theme-front";
import { createPaperFlock, type PaperFlock } from "@/components/articles/world/particles/paper";
import { createSparks, type Sparks } from "@/components/articles/world/particles/sparks";
import type { QualityTier, WorldFrame } from "@/components/articles/world/world-api";
import type { WorldUniforms } from "@/components/articles/world/world-glsl";
import { isScrollLocked } from "@/lib/scroll-lock";

/**
 * What the visitor's hand does to the library:
 *
 * - Moving the pointer leaves a trail of glowing motes (more the faster it
 *   goes), and now and then a paper flyer is born under it and flies off to
 *   join the flock in the depth.
 * - Resting it (about 400 ms, anywhere on the page) releases a swarm of
 *   paper from under it; it must move again before the next one.
 * - On touch: a drag leaves a short trail, a tap a small burst, a long
 *   press a swarm.
 *
 * It also throws the motes the rest of the world asks for: a pulse's burst
 * and the sparks racing along a theme switch's front. Nothing here runs
 * under reduced motion (the world itself doesn't).
 */

/** World depth of the trail: just in front of the cards, so it glints over them. */
const TRAIL_Z = 60;
/**
 * World depth the paper is born at: just in front of the cards. It bursts
 * over the card under the hand and dives through the card plane within a
 * fraction of a second (the cards then cover it), off into the depth.
 */
const PAPER_Z = 90;
const REST_SECONDS = 0.4;
const SWARM_COOLDOWN = 1.6;
const REARM_PX = 30;
const LONG_PRESS_MS = 520;

const TIER: Record<
  QualityTier,
  { sparks: number; pool: number; flyers: number; swarm: [number, number] }
> = {
  high: { sparks: 2400, pool: 110, flyers: 28, swarm: [18, 28] },
  medium: { sparks: 1500, pool: 80, flyers: 18, swarm: [16, 22] },
  low: { sparks: 800, pool: 48, flyers: 10, swarm: [12, 16] },
};

export type CursorMagic = {
  sparks: Sparks;
  paper: PaperFlock;
  update(frame: WorldFrame, naveHalf: number): void;
  /** A burst of motes at a viewport point. */
  burst(x: number, y: number, count: number, speed?: number): void;
  /** A swarm of paper from a viewport point. */
  swarm(x: number, y: number): void;
  /** Sparks along a theme switch's front, on its ragged edge (viewport px). */
  front(wave: ThemeFront, amount: number, width: number, height: number): void;
  setTier(tier: QualityTier): void;
  /** On an article: a gentler hand (fewer motes and flyers, smaller swarms). */
  setQuiet(quiet: number): void;
  /** Whether the swarm and the trail may play (off during transitions). */
  setEnabled(enabled: boolean): void;
  dispose(): void;
};

function typing() {
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}

export function createCursorMagic(options: {
  world: WorldUniforms;
  camera: PerspectiveCamera;
  viewport: () => { width: number; height: number };
  tier: QualityTier;
  random: () => number;
}): CursorMagic {
  const rand = options.random;
  const rb = (a: number, b: number) => a + (b - a) * rand();
  const limits = TIER[options.tier];
  const sparks = createSparks(options.world, options.camera, options.viewport, TIER.high.sparks);
  sparks.setCapacity(limits.sparks);
  const paper = createPaperFlock(options.world, {
    pool: TIER.high.pool,
    flyers: limits.flyers,
    random: rand,
  });

  let tier = options.tier;
  let quiet = 0;
  let enabled = true;
  const point = new Vector3();

  // Mouse (and pen): the trail and the rest.
  const mouse = { x: 0, y: 0, px: 0, py: 0, has: false, fresh: false };
  let travel = 0;
  let stillFor = 0;
  let armed = true;
  let cooldown = 0;
  const anchor = { x: 0, y: 0 };

  // Touch: the drag trail, the tap and the long press.
  const touch = { x: 0, y: 0, px: 0, py: 0, active: false, moved: false, start: 0, sx: 0, sy: 0 };
  let touchTravel = 0;
  let longPress = 0;

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    if (!mouse.has) {
      mouse.px = event.clientX;
      mouse.py = event.clientY;
    }
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.has = true;
    mouse.fresh = true;
  };
  const onMouseOut = (event: MouseEvent) => {
    if (!event.relatedTarget) mouse.has = false;
  };
  const cancelLongPress = () => {
    if (longPress) window.clearTimeout(longPress);
    longPress = 0;
  };
  const onTouchStart = (event: TouchEvent) => {
    const t = event.touches[0];
    if (!t || event.touches.length > 1) {
      cancelLongPress();
      return;
    }
    Object.assign(touch, {
      x: t.clientX,
      y: t.clientY,
      px: t.clientX,
      py: t.clientY,
      sx: t.clientX,
      sy: t.clientY,
      active: true,
      moved: false,
      start: performance.now(),
    });
    cancelLongPress();
    longPress = window.setTimeout(() => {
      longPress = 0;
      if (touch.active && !touch.moved && enabled) api.swarm(touch.x, touch.y);
    }, LONG_PRESS_MS);
  };
  const onTouchMove = (event: TouchEvent) => {
    const t = event.touches[0];
    if (!t) return;
    touch.x = t.clientX;
    touch.y = t.clientY;
    if (Math.hypot(touch.x - touch.sx, touch.y - touch.sy) > 10) {
      touch.moved = true;
      cancelLongPress();
    }
  };
  const onTouchEnd = () => {
    cancelLongPress();
    if (touch.active && !touch.moved && performance.now() - touch.start < 280 && enabled) {
      api.burst(touch.x, touch.y, Math.round(14 * (1 - quiet * 0.4)));
    }
    touch.active = false;
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("mouseout", onMouseOut);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });

  const trailAlong = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    step: number,
    carry: number,
    life: [number, number],
  ) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const distance = Math.hypot(dx, dy);
    let budget = carry + distance / step;
    const n = Math.min(10, Math.floor(budget));
    budget -= n;
    if (n <= 0) return budget;
    const ux = distance > 0 ? dx / distance : 0;
    const uy = distance > 0 ? dy / distance : 0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      sparks.unproject(x0 + dx * t, y0 + dy * t, TRAIL_Z + rb(-30, 30), point);
      // Motes lag behind the hand and scatter a little.
      sparks.emit(
        point.x,
        point.y,
        point.z,
        -ux * rb(10, 40) + rb(-26, 26),
        uy * rb(10, 40) + rb(-18, 30),
        rb(-60, -10),
        rb(life[0], life[1]),
        rb(12, 24),
        "trail",
      );
    }
    return budget;
  };

  const api: CursorMagic = {
    sparks,
    paper,
    update(frame, naveHalf) {
      const dt = frame.dt;
      cooldown = Math.max(0, cooldown - dt);
      const blocked = !enabled || isScrollLocked();

      if (mouse.has && mouse.fresh) {
        const moved = Math.hypot(mouse.x - mouse.px, mouse.y - mouse.py);
        if (!blocked) {
          travel = trailAlong(
            mouse.px,
            mouse.py,
            mouse.x,
            mouse.y,
            14 + quiet * 14,
            travel,
            [0.8, 1.6],
          );
          // Now and then a flyer is born under a moving hand.
          const chance = Math.min(0.05, frame.pointerSpeed / 18000) * (dt * 60) * (1 - quiet * 0.6);
          if (moved > 2 && rand() < chance) {
            sparks.unproject(mouse.x, mouse.y, PAPER_Z, point);
            paper.spawnFlyer(point.x, point.y, point.z);
          }
        }
        if (Math.hypot(mouse.x - anchor.x, mouse.y - anchor.y) > REARM_PX) {
          armed = true;
          anchor.x = mouse.x;
          anchor.y = mouse.y;
        }
        if (moved > 3) stillFor = 0;
        mouse.px = mouse.x;
        mouse.py = mouse.y;
        mouse.fresh = false;
      } else if (mouse.has) {
        stillFor += dt;
      }
      // A resting hand releases a swarm (not while the list scrolls under it).
      if (frame.scrolling) stillFor = 0;
      if (
        mouse.has &&
        armed &&
        !blocked &&
        cooldown <= 0 &&
        stillFor >= REST_SECONDS &&
        mouse.y > 64 &&
        !typing()
      ) {
        armed = false;
        anchor.x = mouse.x;
        anchor.y = mouse.y;
        api.swarm(mouse.x, mouse.y);
      }

      if (touch.active && !blocked) {
        touchTravel = trailAlong(
          touch.px,
          touch.py,
          touch.x,
          touch.y,
          20,
          touchTravel,
          [0.45, 0.9],
        );
        touch.px = touch.x;
        touch.py = touch.y;
      }

      paper.update(frame.time, dt, naveHalf);
      sparks.commit();
    },
    burst(x, y, count, speed = 1) {
      for (let i = 0; i < count; i++) {
        const angle = rb(0, Math.PI * 2);
        const v = rb(70, 230) * speed;
        sparks.unproject(x, y, TRAIL_Z, point);
        sparks.emit(
          point.x,
          point.y,
          point.z,
          Math.cos(angle) * v,
          Math.sin(angle) * v,
          rb(-80, 40),
          rb(0.6, 1.2),
          rb(14, 28),
          "burst",
        );
      }
    },
    swarm(x, y) {
      cooldown = SWARM_COOLDOWN;
      const [min, max] = TIER[tier].swarm;
      const count = Math.round(rb(min, max) * (1 - quiet * 0.45));
      sparks.unproject(x, y, PAPER_Z, point);
      paper.burst(point.x, point.y, point.z, count);
      api.burst(x, y, Math.round(8 * (1 - quiet * 0.5)), 0.6);
    },
    front(wave, amount, width, height) {
      const n = Math.round(amount * (1 - quiet * 0.4));
      let emitted = 0;
      // Only sparks that land on screen count (the front is mostly off it
      // at the start and the end of its sweep).
      for (let tries = 0; tries < n * 3 && emitted < n; tries++) {
        const angle = rb(0, Math.PI * 2);
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const r = frontRadiusAlong(wave.x, wave.y, ux, uy, wave.radius, wave.time) - rb(2, 18);
        const px = wave.x + ux * r;
        const py = wave.y + uy * r;
        if (r <= 0 || px < -10 || py < -10 || px > width + 10 || py > height + 10) continue;
        emitted += 1;
        sparks.unproject(px, py, TRAIL_Z + rb(-20, 40), point);
        // Racing along the edge and a little behind it: beyond the front
        // the page is still the old scheme's snapshot, which would cut them.
        const along = rb(180, 460) * (rand() < 0.5 ? -1 : 1);
        const inward = rb(20, 110);
        const sx = -uy * along - ux * inward;
        const sy = ux * along - uy * inward;
        sparks.emit(
          point.x,
          point.y,
          point.z,
          sx,
          -sy,
          rb(-40, 40),
          rb(0.35, 0.8),
          rb(12, 26),
          "front",
        );
      }
    },
    setTier(next) {
      tier = next;
      sparks.setCapacity(TIER[next].sparks);
      paper.setFlyers(Math.round(TIER[next].flyers * (1 - quiet * 0.55)));
    },
    setQuiet(next) {
      if (Math.abs(next - quiet) < 0.01) return;
      quiet = next;
      paper.setFlyers(Math.round(TIER[tier].flyers * (1 - quiet * 0.55)));
      sparks.setOpacity(1 - quiet * 0.3);
    },
    setEnabled(next) {
      enabled = next;
    },
    dispose() {
      cancelLongPress();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      sparks.dispose();
      paper.dispose();
    },
  };
  return api;
}
