/**
 * Board geometry for the process magnets, in the board's own layout pixels
 * (offsetLeft/offsetTop against the section). Layout boxes ignore every
 * transform, so neither a magnet's tilt nor ScrollSmoother's moving
 * content ever skews a collision or a clamp.
 */

export type Box = { x: number; y: number; w: number; h: number };
export type Bounds = { left: number; top: number; right: number; bottom: number };
export type Offset = { x: number; y: number };
export type Range = { minX: number; maxX: number; minY: number; maxY: number };

/** The offsets that keep a magnet whose home is `home` inside `bounds`. */
export function offsetRange(home: Box, bounds: Bounds): Range {
  const minX = bounds.left - home.x;
  const minY = bounds.top - home.y;
  return {
    minX,
    maxX: Math.max(minX, bounds.right - home.w - home.x),
    minY,
    maxY: Math.max(minY, bounds.bottom - home.h - home.y),
  };
}

export function clampOffset(home: Box, bounds: Bounds, offset: Offset): Offset {
  const r = offsetRange(home, bounds);
  return {
    x: Math.min(r.maxX, Math.max(r.minX, offset.x)),
    y: Math.min(r.maxY, Math.max(r.minY, offset.y)),
  };
}

/**
 * Past an edge the magnet follows the pointer less and less, the way a
 * scroll view overscrolls: `d` is how far it can ever get past the edge.
 */
export function rubberBand(value: number, min: number, max: number, d = 90) {
  const band = (over: number) => (1 - 1 / ((over * 0.55) / d + 1)) * d;
  if (value < min) return min - band(min - value);
  if (value > max) return max + band(value - max);
  return value;
}

type Placed = { home: Box; offset: Offset; locked: boolean };

function boxAt(item: Placed, inset: number): Box {
  return {
    x: item.home.x + item.offset.x + inset,
    y: item.home.y + item.offset.y + inset,
    w: item.home.w - inset * 2,
    h: item.home.h - inset * 2,
  };
}

function overlap(a: Box, b: Box) {
  return {
    x: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    y: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  };
}

/**
 * Soft collisions: after `moved` lands, every magnet it overlaps is pushed
 * aside along the shorter way out (plus `gap`), and whatever that one then
 * overlaps is pushed in turn. The moved magnet stays where it was put.
 * Returns the new offsets of the magnets that had to move (by index).
 */
export function resolveOverlaps(
  items: Placed[],
  moved: number,
  bounds: Bounds,
  gap = 14,
): Map<number, Offset> {
  const offsets = items.map((item) => ({ ...item.offset }));
  const placed = items.map((item, i) => ({ ...item, offset: offsets[i] }));
  const changed = new Map<number, Offset>();
  const queue = [moved];
  let guard = 0;
  while (queue.length && guard++ < 60) {
    const ai = queue.shift()!;
    const a = boxAt(placed[ai], 2);
    for (let bi = 0; bi < placed.length; bi++) {
      if (bi === ai || bi === moved || placed[bi].locked) continue;
      const b = boxAt(placed[bi], 2);
      const o = overlap(a, b);
      if (o.x <= 0 || o.y <= 0) continue;
      const dirX = b.x + b.w / 2 >= a.x + a.w / 2 ? 1 : -1;
      const dirY = b.y + b.h / 2 >= a.y + a.h / 2 ? 1 : -1;
      // Four ways out, shortest first; the first that bounds allow wins.
      const exits: Offset[] = [
        { x: dirX * (o.x + gap), y: 0 },
        { x: 0, y: dirY * (o.y + gap) },
        { x: -dirX * (b.w + a.w - o.x + gap), y: 0 },
        { x: 0, y: -dirY * (b.h + a.h - o.y + gap) },
      ].sort((p, q) => Math.abs(p.x) + Math.abs(p.y) - (Math.abs(q.x) + Math.abs(q.y)));
      const current = placed[bi].offset;
      let best: Offset | null = null;
      for (const exit of exits) {
        const next = clampOffset(placed[bi].home, bounds, {
          x: current.x + exit.x,
          y: current.y + exit.y,
        });
        const left = overlap(a, boxAt({ ...placed[bi], offset: next }, 2));
        if (left.x <= 0 || left.y <= 0) {
          best = next;
          break;
        }
      }
      if (!best) continue; // Walled in: leave it rather than shove it offscreen.
      placed[bi].offset = best;
      offsets[bi] = best;
      changed.set(bi, best);
      queue.push(bi);
    }
  }
  return changed;
}
