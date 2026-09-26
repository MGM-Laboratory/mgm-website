/**
 * The hero's connector arrow, in real pixels of its own box: a top arm
 * running left from near the clover to a rounded corner, down the shared
 * left margin, and a bottom arm running right toward the closing line.
 * hero.tsx measures it; the play (interactions/arrow.ts) plucks it and
 * always settles back on exactly this path.
 */

export type ArrowGeometry = {
  topEndX: number;
  bottomEndX: number;
  height: number;
  radius: number;
};

/**
 * The path, optionally with one straight run bowed out by `bend` px at
 * `at` (a share of its length, 0 to 1), as a plucked string would be.
 */
export function arrowPathD(
  { topEndX, bottomEndX, height, radius: r }: ArrowGeometry,
  pluck?: { segment: "top" | "side" | "bottom"; at: number; bend: number },
) {
  // A quadratic's apex sits at its middle and reaches half the control
  // point's offset, so the control point goes twice as far out, placed so
  // the apex lands at the plucked spot.
  const control = (from: number, to: number, at: number) => {
    const apex = from + (to - from) * at;
    return Math.min(Math.max(2 * apex - (from + to) / 2, Math.min(from, to)), Math.max(from, to));
  };
  const top =
    pluck?.segment === "top"
      ? `Q${control(topEndX, r, pluck.at)} ${2 * pluck.bend} ${r} 0`
      : `H${r}`;
  const side =
    pluck?.segment === "side"
      ? `Q${2 * pluck.bend} ${control(r, height - r, pluck.at)} 0 ${height - r}`
      : `V${height - r}`;
  const bottom =
    pluck?.segment === "bottom"
      ? `Q${control(r, bottomEndX, pluck.at)} ${height + 2 * pluck.bend} ${bottomEndX} ${height}`
      : `H${bottomEndX}`;
  return `M${topEndX} 0${top}A${r} ${r} 0 0 0 0 ${r}${side}A${r} ${r} 0 0 0 ${r} ${height}${bottom}`;
}
