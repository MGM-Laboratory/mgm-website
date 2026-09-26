import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { randomBetween } from "@/lib/random";
import { motionAllowed } from "@/lib/reduced-motion";

import type { MagnetBoard, MagnetState } from "./magnet-board";

/** Seconds between two throws. */
const STAGGER = 0.1;
/** Seconds a throw takes to reach its spot (it overshoots on the way). */
const FLIGHT = 0.52;
/** When in the flight the magnet slams onto the board. */
const SLAM = FLIGHT * 0.8;
/** Where the board's top has to be, as a share of the window, to start. */
const START = "top 72%";

/**
 * The board's entrance: once it scrolls into view, the magnets are thrown
 * on one after another in reading order, from beyond the section's left
 * edge, its right edge and below it in turn, each spinning and a little
 * larger (closer to the visitor). Each one overshoots, then slams down with
 * a squash, a ring from its tile and a rattle through the magnets already
 * there. Ten throws finish within about 1.7 s.
 *
 * Under reduced motion the magnets are simply there.
 */
export type MagnetEntrance = {
  /** Lands every magnet at once (keyboard focus arriving before the throw). */
  finish: () => void;
  dispose: () => void;
};

export function startMagnetEntrance(board: MagnetBoard, trigger: HTMLElement): MagnetEntrance {
  const { magnets, section } = board;

  const settle = (m: MagnetState) => {
    m.flying = false;
    m.ready = true;
    m.liftSpring.reset(0);
    m.el.style.zIndex = "";
    gsap.set(m.el, { opacity: 1, x: m.x, y: m.y });
    gsap.set(m.pose, { rotation: m.angle, y: 0 });
    gsap.set(m.squash, { scaleX: 1, scaleY: 1 });
  };

  // Reduced motion, or a keyboard visitor already on a magnet: no throw.
  // (The section reveals the magnets itself when focus arrives before the
  // board has loaded; those must not be thrown in again.)
  const shown = magnets.some((m) => m.el.style.opacity === "1");
  if (!motionAllowed() || shown || section.contains(document.activeElement)) {
    magnets.forEach(settle);
    board.ensureTicking();
    return { finish: () => {}, dispose: () => {} };
  }

  const landed = (m: MagnetState) => {
    m.flying = false;
    m.ready = true;
    board.squash(m, 1.15);
    board.ring(m, 1);
    board.jiggle(m, 0.85, (other) => other.ready);
    board.tileMove(m);
    board.ensureTicking();
    gsap.delayedCall(0.4, () => {
      if (!m.dragging && !m.flipped) m.el.style.zIndex = "";
    });
  };

  const tl = gsap.timeline({
    scrollTrigger: { trigger, start: START, once: false, onKill: () => resolve() },
  });

  magnets.forEach((m, i) => {
    const t = i * STAGGER;
    const side = i % 3;
    const spin = (side === 1 ? -1 : 1) * randomBetween(170, 290);
    // Start points are read when the throw begins, so a resize before the
    // board is reached still throws from beyond the real edges.
    const startX = () => {
      if (side === 0) return -(m.home.x + m.home.w) - randomBetween(40, 120);
      if (side === 1) return section.clientWidth - m.home.x + randomBetween(40, 120);
      return m.x + randomBetween(-140, 140);
    };
    const startY = () => {
      if (side === 2) return section.clientHeight - m.home.y + randomBetween(20, 90);
      return m.y + randomBetween(-90, 50);
    };
    tl.set(m.el, { x: startX, y: startY, opacity: 1, zIndex: 30 }, t)
      .call(
        () => {
          m.flying = true;
          m.liftSpring.reset(1);
          board.ensureTicking();
        },
        [],
        t,
      )
      .to(m.el, { x: () => m.x, y: () => m.y, duration: FLIGHT, ease: "back.out(1.25)" }, t)
      .fromTo(
        m.pose,
        { rotation: () => m.angle + spin, y: 0 },
        { rotation: () => m.angle, duration: FLIGHT, ease: "power3.out", immediateRender: false },
        t,
      )
      .fromTo(
        m.squash,
        { scaleX: 1.32, scaleY: 1.32 },
        { scaleX: 1, scaleY: 1, duration: SLAM, ease: "power2.in", immediateRender: false },
        t,
      )
      .call(() => landed(m), [], t + SLAM);
  });

  tl.eventCallback("onComplete", () => {
    // `once: false` plus a kill here instead of `once: true` (gotchas #4
    // and #10 in docs/animation-system.md).
    tl.scrollTrigger?.kill();
  });

  // Reloaded or returned to part way down the page: a trigger never fires
  // for a start it was created past (gotcha #11), so catch the entrance up
  // the way lib/scroll-reveal.ts does, through converging routes. A board
  // still on screen plays its entrance; one already scrolled past just
  // appears.
  let handled = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  function resolve() {
    if (handled) return;
    handled = true;
    timers.forEach(clearTimeout);
    ScrollTrigger.removeEventListener("refresh", onRefresh);
  }
  function catchUp(onScreen: boolean) {
    resolve();
    if (onScreen) {
      tl.play();
      return;
    }
    tl.scrollTrigger?.kill();
    tl.progress(1, true);
    magnets.forEach(settle);
  }
  function visible() {
    const rect = trigger.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }
  function check() {
    if (handled) return;
    const st = tl.scrollTrigger;
    if (!st || tl.progress() > 0 || tl.isActive()) {
      resolve();
      return;
    }
    if (!(st.progress > 0)) return;
    catchUp(visible());
  }
  function onRefresh() {
    check();
  }
  timers = [250, 750].map((ms) => setTimeout(check, ms));
  timers.push(
    setTimeout(() => {
      if (handled) return;
      if (tl.progress() > 0 || !trigger.isConnected) {
        resolve();
        return;
      }
      if (trigger.getBoundingClientRect().top < window.innerHeight * 0.72) catchUp(visible());
      else resolve();
    }, 1500),
  );
  ScrollTrigger.addEventListener("refresh", onRefresh);
  check();

  return {
    finish: () => {
      if (magnets.every((m) => m.ready)) return;
      resolve();
      tl.scrollTrigger?.kill();
      tl.progress(1, true);
      magnets.forEach(settle);
    },
    dispose: () => {
      resolve();
      tl.scrollTrigger?.kill();
      tl.kill();
    },
  };
}
