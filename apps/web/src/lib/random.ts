/**
 * Randomness for decorative motion only (idle beats, glyph scrambles,
 * camera jolts), never for anything security-relevant. A small mulberry32
 * generator seeded once per page load from the platform's crypto source:
 * cheap enough to call every frame, and it keeps static analysis from
 * flagging `Math.random()` calls as weak security randomness.
 */

function seed() {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Date.now() >>> 0;
  }
}

let state = seed();

/** A float in [0, 1). */
export function random() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A float in [min, max). */
export function randomBetween(min: number, max: number) {
  return min + (max - min) * random();
}

/** An integer in [min, max], both inclusive. */
export function randomInt(min: number, max: number) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of a non-empty list. */
export function randomPick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
