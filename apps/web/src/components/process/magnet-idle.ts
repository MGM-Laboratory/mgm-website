import gsap from "gsap";

import { onIdle } from "@/lib/motion/idle";
import { random, randomBetween, randomPick } from "@/lib/random";
import { motionAllowed } from "@/lib/reduced-motion";

import type { MagnetBoard, MagnetState } from "./magnet-board";

/** A visitor quiet for this long lets gravity have a go, ms. */
const LONG_IDLE_MS = 14000;

/**
 * The board's life while nobody touches it, only while it is on screen:
 * every few seconds one magnet wiggles as if it is slipping, then holds at
 * its new angle; and after a long quiet spell one slowly slides down a few
 * pixels, as if gravity were winning, and snaps back up. Any input snaps a
 * sliding magnet back at once. Nothing runs under reduced motion.
 */
export function startMagnetIdle(board: MagnetBoard) {
  if (!motionAllowed()) return () => {};
  let inView = false;
  let beat: gsap.core.Tween | null = null;
  let nextSlide: gsap.core.Tween | null = null;
  let quiet = false;

  const eligible = () =>
    board.magnets.filter(
      (m) =>
        m.ready &&
        !m.hovered &&
        !m.focused &&
        !m.dragging &&
        !m.gliding &&
        !m.flying &&
        !m.flipped &&
        !m.sliding &&
        !m.poseTween?.isActive(),
    );

  const settled = () =>
    inView &&
    motionAllowed() &&
    !document.hidden &&
    !board.busy() &&
    performance.now() - board.lastInput() > 1500;

  function slip(m: MagnetState) {
    let dir = random() < 0.5 ? -1 : 1;
    if (Math.abs(m.angle + dir * 1.5) > 4) dir = -dir;
    const next = Math.max(-4, Math.min(4, m.angle + dir * randomBetween(0.7, 1.5)));
    m.poseTween?.kill();
    m.poseTween = gsap
      .timeline()
      .to(m.pose, { rotation: m.angle + dir * 2.6, y: 1.5, duration: 0.09, ease: "power2.out" })
      .to(m.pose, { rotation: m.angle - dir * 1.4, duration: 0.12, ease: "sine.inOut" })
      .to(m.pose, { rotation: m.angle + dir * 0.9, y: 0.8, duration: 0.12, ease: "sine.inOut" })
      .to(m.pose, { rotation: next, y: 0, duration: 0.7, ease: "elastic.out(1, 0.4)" });
    m.angle = next;
  }

  function schedule() {
    beat?.kill();
    beat = gsap.delayedCall(randomBetween(3.2, 6.4), () => {
      if (settled()) {
        const pool = eligible();
        if (pool.length) slip(randomPick(pool));
      }
      schedule();
    });
  }

  function snapBack(m: MagnetState, startled: boolean) {
    m.sliding = false;
    m.poseTween?.kill();
    m.poseTween = gsap.to(m.pose, {
      rotation: m.angle,
      y: 0,
      duration: 0.7,
      ease: "elastic.out(1, 0.35)",
    });
    board.squash(m, startled ? 0.6 : 0.4);
    if (startled) board.ring(m, 0.35);
  }

  function slide() {
    nextSlide?.kill();
    nextSlide = null;
    if (!quiet || !settled()) return;
    const pool = eligible();
    if (!pool.length) return;
    const m = randomPick(pool);
    const lean = (random() < 0.5 ? -1 : 1) * 1.2;
    m.sliding = true;
    m.poseTween?.kill();
    m.poseTween = gsap.to(m.pose, {
      y: 8,
      rotation: m.angle + lean,
      duration: 2.8,
      ease: "power1.in",
      onComplete: () => {
        snapBack(m, false);
        if (quiet) nextSlide = gsap.delayedCall(randomBetween(8, 12), slide);
      },
    });
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      if (inView) schedule();
      else {
        beat?.kill();
        beat = null;
      }
    },
    { threshold: 0.15 },
  );
  observer.observe(board.section);

  const offIdle = onIdle(LONG_IDLE_MS, (idle) => {
    quiet = idle;
    if (idle) {
      slide();
      return;
    }
    nextSlide?.kill();
    nextSlide = null;
    for (const m of board.magnets) if (m.sliding) snapBack(m, true);
  });

  return () => {
    observer.disconnect();
    offIdle();
    beat?.kill();
    nextSlide?.kill();
  };
}
