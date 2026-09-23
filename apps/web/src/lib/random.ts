/**
 * Randomness for decorative motion only (idle beats, glyph scrambles,
 * camera jolts), never for anything security-relevant. A small mulberry32
 * generator, cheap enough to call every frame, seeded once per page load
 * from the clock. Deliberately not seeded from `crypto`: nothing here needs
 * unpredictability, and static analysis reports arithmetic on a secure
 * random value as biased. It also keeps `Math.random()` calls, which the
 * same tools flag as weak security randomness, out of the code.
 */

function seed() {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  return (Date.now() ^ Math.floor(now * 1000)) >>> 0;
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
