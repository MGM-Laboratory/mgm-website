import gsap from "gsap";

import { finePointer, onPointer } from "@/lib/motion/pointer";
import { motionAllowed } from "@/lib/reduced-motion";

export type MagneticOptions = {
  /** How far outside the element's box the pull starts, px. */
  radius?: number;
  /** Share of the pointer's offset from the centre the element follows (0..1). */
  strength?: number;
  /** Largest offset in px, whatever the pointer's distance. */
  max?: number;
  /** Seconds the follow takes to settle. */
  duration?: number;
  /** Called with the pull, 0 (out of reach) to 1 (pointer on the centre). */
  onPull?: (pull: number) => void;
};

/**
 * Pulls `el` toward the pointer while the pointer is near it, and lets it
 * spring back when the pointer leaves. GSAP owns `x`/`y` on `el` for the
 * whole life of the effect, so `el` must carry no transform from a class
 * (docs/animation-system.md gotcha #1). Wrap an element that animates its
 * own transform in a plain wrapper and pass the wrapper.
 *
 * Does nothing without a hovering pointer or under reduced motion. Returns
 * the cleanup.
 */
export function attachMagnetic(el: HTMLElement, options: MagneticOptions = {}) {
  if (!finePointer() || !motionAllowed()) return () => {};
  const { radius = 90, strength = 0.35, max = 28, duration = 0.6, onPull } = options;

  const toX = gsap.quickTo(el, "x", { duration, ease: "elastic.out(1, 0.55)" });
  const toY = gsap.quickTo(el, "y", { duration, ease: "elastic.out(1, 0.55)" });
  let engaged = false;
  // The element's own box without the pull's offset, so the pull doesn't
  // chase itself. Re-measured on scroll and resize (cheap: one rect).
  let box: DOMRect | null = null;
  const measure = () => {
    const rect = el.getBoundingClientRect();
    const dx = Number(gsap.getProperty(el, "x")) || 0;
    const dy = Number(gsap.getProperty(el, "y")) || 0;
    box = new DOMRect(rect.x - dx, rect.y - dy, rect.width, rect.height);
  };
  const invalidate = () => {
    box = null;
  };

  const off = onPointer((state) => {
    if (!state.inside || state.type === "touch") {
      if (engaged) release();
      return;
    }
    if (!box) measure();
    const b = box!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dx = state.x - cx;
    const dy = state.y - cy;
    // Distance from the box's edge, not its centre, so a wide pill pulls as
    // readily from its ends as a small circle does from its middle.
    const ex = Math.max(0, Math.abs(dx) - b.width / 2);
    const ey = Math.max(0, Math.abs(dy) - b.height / 2);
    const edgeDistance = Math.hypot(ex, ey);
    if (edgeDistance > radius) {
      if (engaged) release();
      return;
    }
    engaged = true;
    const reach = Math.max(b.width, b.height) / 2 + radius;
    const pull = 1 - Math.min(1, Math.hypot(dx, dy) / reach);
    toX(gsap.utils.clamp(-max, max, dx * strength));
    toY(gsap.utils.clamp(-max, max, dy * strength));
    onPull?.(pull);
  });

  function release() {
    engaged = false;
    toX(0);
    toY(0);
    onPull?.(0);
  }

  window.addEventListener("scroll", invalidate, { passive: true });
  window.addEventListener("resize", invalidate);
  return () => {
    off();
    window.removeEventListener("scroll", invalidate);
    window.removeEventListener("resize", invalidate);
    toX.tween.kill();
    toY.tween.kill();
    gsap.set(el, { x: 0, y: 0 });
  };
}
