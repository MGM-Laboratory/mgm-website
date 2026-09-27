import gsap from "gsap";

import type { PatternKind } from "./pattern-tile";

/**
 * Each tile's own little move when its magnet is hovered (and when it lands
 * on the board): fans spin, the square turns, arcs rock, the circle pulses,
 * leaves open (and close again when the pointer leaves), the plus spins and
 * the clover turns. The moves act on the motif group inside the tile's SVG,
 * around the tile's centre in its 100x100 space, so the tile's field and
 * outline stay still. Symmetric shapes turn by whole quarter turns and
 * always end on one, so a hover cut short never leaves a crooked tile.
 */

const ORIGIN = "50 50";

function nextQuarter(motif: SVGGElement, turns: number) {
  const current = Number(gsap.getProperty(motif, "rotation")) || 0;
  return (Math.round(current / 90) + turns) * 90;
}

// Petals move out along the line from the tile's centre to their own.
const petalDirections = new WeakMap<SVGGraphicsElement, { x: number; y: number }>();

function petalDirection(petal: SVGGraphicsElement) {
  let dir = petalDirections.get(petal);
  if (!dir) {
    const box = petal.getBBox();
    const dx = box.x + box.width / 2 - 50;
    const dy = box.y + box.height / 2 - 50;
    const length = Math.hypot(dx, dy) || 1;
    dir = { x: dx / length, y: dy / length };
    petalDirections.set(petal, dir);
  }
  return dir;
}

/** Opens (or closes) the leaves motif's petals. */
export function setLeavesOpen(motif: SVGGElement, open: boolean) {
  const petals = Array.from(motif.children) as SVGGraphicsElement[];
  for (const petal of petals) {
    const dir = petalDirection(petal);
    gsap.to(petal, {
      x: open ? dir.x * 9 : 0,
      y: open ? dir.y * 9 : 0,
      duration: open ? 0.55 : 0.7,
      ease: open ? "back.out(2.2)" : "elastic.out(1, 0.45)",
      overwrite: "auto",
    });
  }
}

/**
 * Plays the kind's move once. Leaves open and stay open until
 * `setLeavesOpen(motif, false)`; pass `settle` to have them close again on
 * their own (a landing rather than a hover).
 */
export function playTileMove(motif: SVGGElement, kind: PatternKind, settle = false) {
  switch (kind) {
    case "fans":
      return gsap.to(motif, {
        rotation: nextQuarter(motif, 2),
        svgOrigin: ORIGIN,
        duration: 0.9,
        ease: "back.out(1.5)",
        overwrite: "auto",
      });
    case "square":
      return gsap.to(motif, {
        rotation: nextQuarter(motif, 1),
        svgOrigin: ORIGIN,
        duration: 0.85,
        ease: "elastic.out(1, 0.5)",
        overwrite: "auto",
      });
    case "arcs":
      return gsap
        .timeline({ overwrite: "auto" })
        .to(motif, { rotation: -16, svgOrigin: ORIGIN, duration: 0.14, ease: "power2.out" })
        .to(motif, { rotation: 11, duration: 0.2, ease: "sine.inOut" })
        .to(motif, { rotation: -6, duration: 0.2, ease: "sine.inOut" })
        .to(motif, { rotation: 0, duration: 0.3, ease: "sine.out" });
    case "circle":
      return gsap
        .timeline()
        .to(motif, {
          scale: 0.78,
          svgOrigin: ORIGIN,
          duration: 0.13,
          ease: "power2.in",
          overwrite: "auto",
        })
        .to(motif, { scale: 1, duration: 0.6, ease: "elastic.out(1.2, 0.35)" });
    case "leaves":
      setLeavesOpen(motif, true);
      if (settle) gsap.delayedCall(0.55, () => setLeavesOpen(motif, false));
      return null;
    case "plus":
      return gsap.to(motif, {
        rotation: nextQuarter(motif, 1),
        svgOrigin: ORIGIN,
        duration: 0.6,
        ease: "back.out(2.4)",
        overwrite: "auto",
      });
    case "clover":
      return gsap.to(motif, {
        rotation: nextQuarter(motif, 1),
        svgOrigin: ORIGIN,
        duration: 0.75,
        ease: "back.out(1.8)",
        overwrite: "auto",
      });
    default:
      return gsap.to(motif, {
        rotation: nextQuarter(motif, 1),
        svgOrigin: ORIGIN,
        duration: 0.7,
        ease: "back.out(1.8)",
        overwrite: "auto",
      });
  }
}
