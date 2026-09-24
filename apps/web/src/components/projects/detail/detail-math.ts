/** Small, allocation-free helpers for the detail page's per-frame maths. */

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const mix = (from: number, to: number, t: number) => from + (to - from) * t;

export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;

export const expoOut: Ease = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export const expoInOut: Ease = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
};

export const quintInOut: Ease = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);

/**
 * Remaps `value` from [inMin, inMax] to [outMin, outMax], clamped to the
 * input range first and then eased (lusion's `math.fit`).
 */
export function fit(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  ease: Ease = linear,
) {
  const t = clamp((value - inMin) / (inMax - inMin));
  return mix(outMin, outMax, ease(t));
}

/** `#rrggbb` to [r, g, b] (0..255). */
function channels(hex: string): [number, number, number] {
  let value = hex.replace("#", "");
  if (value.length === 3) value = [...value].map((char) => char + char).join("");
  const number = Number.parseInt(value, 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

/** An sRGB blend of two hex colours as `rgb()` (t = 0 gives `from`). */
export function mixColor(from: string, to: string, t: number) {
  const a = channels(from);
  const b = channels(to);
  const k = clamp(t);
  return `rgb(${Math.round(mix(a[0], b[0], k))} ${Math.round(mix(a[1], b[1], k))} ${Math.round(mix(a[2], b[2], k))})`;
}
