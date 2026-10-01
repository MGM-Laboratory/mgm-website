/**
 * The card box's hinge solver. It turns what the act asks for (lid open,
 * tuck flap open, tease amount) into fold angles where no board passes
 * through the front wall, the tease card or the stack, the way a real
 * tuck box behaves:
 *
 * - While the lid is low, the tuck flap cannot swing out: its tip leans on
 *   the inside of the front wall and slides up it as the lid lifts.
 * - Once the tip clears the rim, the flap springs to the angle asked for
 *   (eased over a few millimetres, so it never pops).
 * - The tease card pushes the lid: the lid is never lower than the card
 *   needs, so it rests on the card's top edge when the card leads.
 * - The dust flaps stay under the lid.
 *
 * Everything is solved in the box's side view (the x-y plane of the box
 * frame: +x the front's outward normal, +y up), where the lid and the flap
 * span the whole width. Pure math on plain numbers: no three.js, no
 * allocation per call, a few microseconds when nothing pushes, well under
 * a millisecond when the card does.
 */

export type BoxPoseShape = Readonly<{
  /** Wall height and depth (front to back), board thickness. */
  H: number;
  D: number;
  t: number;
  /** Closed fold radii: lid hinge, tuck flap, dust flaps. */
  rh: number;
  rf: number;
  rd: number;
  lidLen: number;
  flapLen: number;
  dustLen: number;
  dustChamfer: number;
  dustHalf: number;
  /** The tease card: the x of its two faces and its top edge at rest. */
  cardX0: number;
  cardX1: number;
  cardTop: number;
  /** The stack behind it: x span and top. */
  stackX0: number;
  stackX1: number;
  stackTop: number;
  /** How far the tease card rises at peek 1. */
  rise: number;
  /** Lid angle at `lid = 1` (radians). */
  lidOpen: number;
}>;

export type BoxPose = {
  /** Lid opening (radians, 0 closed). */
  lid: number;
  /** Bend of each fold (radians): lid hinge, tuck flap, dust flaps. */
  phiLid: number;
  phiFlap: number;
  phiDust: number;
  /** The tease card's rise (metres). */
  rise: number;
};

export type BoxPoseSolver = {
  solve(lid: number, flap: number, peek: number, out?: BoxPose): BoxPose;
  /** Largest overlap (metres) of the solved pose with the wall, the card and the stack, and of the dust flaps with the lid. */
  overlap(pose: BoxPose): number;
};

const HALF_PI = Math.PI / 2;
const DEG = Math.PI / 180;

/** How far the dust flaps spring up once the lid is out of their way. */
const DUST_SPRING = 34 * DEG;
/** Clearances (metres): flap to the wall, boards to the card's faces and top edge, the stack, dust flaps to the lid. */
const WALL_GAP = 0.00005;
const CARD_SIDE_GAP = 0.0001;
const CARD_TOP_GAP = 0.0004;
const STACK_GAP = 0.0003;
const DUST_GAP = 0.00002;
/** Once the flap tip clears the rim, it eases from the rim to its asked angle over this clearance. */
const FLAP_RELEASE = 0.0025;

/** The tease's own choreography, as shares of `peek`: the lid leads, the flap flicks out, then the card rises. */
const TEASE = {
  lid: 50 * DEG,
  lidEnd: 0.4,
  flapStart: 0.14,
  flapEnd: 0.46,
  flapOpen: 0.9,
  riseStart: 0.24,
} as const;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

/** A 2D frame: origin and two unit axes. */
type Frame = { ox: number; oy: number; xx: number; xy: number; yx: number; yy: number };

const newFrame = (): Frame => ({ ox: 0, oy: 0, xx: 1, xy: 0, yx: 0, yy: 1 });

/**
 * A paper fold (an arc of constant length) bent by `phi`, sampled at arc
 * length `s`, in the frame `f`: writes the point, the tangent and the
 * printed side's normal into `out` as a frame (origin, x = tangent,
 * y = printed normal). Same maths as the box's mesh rebuild.
 */
function foldFrame(
  f: Frame,
  p0x: number,
  p0y: number,
  t0x: number,
  t0y: number,
  n0x: number,
  n0y: number,
  length: number,
  phi: number,
  s: number,
  out: Frame,
) {
  const k = phi / length;
  const alpha = k * s;
  const along = Math.abs(k) < 1e-9 ? s : Math.sin(alpha) / k;
  const across = Math.abs(k) < 1e-9 ? 0 : (1 - Math.cos(alpha)) / k;
  const c = Math.cos(alpha);
  const sn = Math.sin(alpha);
  // Local (in f): point, tangent, printed normal.
  const lx = p0x + t0x * along + n0x * across;
  const ly = p0y + t0y * along + n0y * across;
  const tx = t0x * c + n0x * sn;
  const ty = t0y * c + n0y * sn;
  const nx = t0x * sn - n0x * c;
  const ny = t0y * sn - n0y * c;
  out.ox = f.ox + f.xx * lx + f.yx * ly;
  out.oy = f.oy + f.xy * lx + f.yy * ly;
  out.xx = f.xx * tx + f.yx * ty;
  out.xy = f.xy * tx + f.yy * ty;
  out.yx = f.xx * nx + f.yx * ny;
  out.yy = f.xy * nx + f.yy * ny;
}

/**
 * A board's side-view outline as segments (outer polyline, inner polyline,
 * the cut edges), written into a flat buffer: x0, y0, x1, y1 per segment.
 */
type Segments = { data: Float64Array; count: number };

const newSegments = (capacity: number): Segments => ({
  data: new Float64Array(capacity * 4),
  count: 0,
});

function pushSegment(seg: Segments, x0: number, y0: number, x1: number, y1: number) {
  const o = seg.count * 4;
  seg.data[o] = x0;
  seg.data[o + 1] = y0;
  seg.data[o + 2] = x1;
  seg.data[o + 3] = y1;
  seg.count += 1;
}

/**
 * Deepest overlap of a segment with a region given as the intersection of
 * half-planes `a_i + b_i * u >= 0` along the segment (u in 0..1). The depth
 * is the smallest `a_i + b_i u`, a concave function of u, so its maximum is
 * at an end or where two of the lines cross.
 */
function segmentDepth(a: Float64Array, b: Float64Array, n: number): number {
  const at = (u: number) => {
    let m = Infinity;
    for (let i = 0; i < n; i++) m = Math.min(m, (a[i] ?? 0) + (b[i] ?? 0) * u);
    return m;
  };
  let best = Math.max(at(0), at(1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const db = (b[i] ?? 0) - (b[j] ?? 0);
      if (Math.abs(db) < 1e-12) continue;
      const u = ((a[j] ?? 0) - (a[i] ?? 0)) / db;
      if (u > 0 && u < 1) best = Math.max(best, at(u));
    }
  }
  return best;
}

export function createBoxPoseSolver(shape: BoxPoseShape): BoxPoseSolver {
  const { H, D, t, rh, rf, rd, lidLen, flapLen, dustLen, dustChamfer, dustHalf } = shape;
  const a = D / 2;
  const top = H / 2;
  const lidFoldLen = (rh * Math.PI) / 2;
  const flapFoldLen = (rf * Math.PI) / 2;
  const dustFoldLen = (rd * Math.PI) / 2;
  const SAMPLES = 6;

  // The front wall and everything in front of it below the rim: the flap may never enter it.
  const wallX = a - t - WALL_GAP;

  const box: Frame = newFrame();
  const lidEnd = newFrame();
  const flapEnd = newFrame();
  const tmp = newFrame();
  const tmp2 = newFrame();
  const lidSegs = newSegments(64);
  const flapSegs = newSegments(64);
  const coefA = new Float64Array(4);
  const coefB = new Float64Array(4);

  /** Writes the outline of a fold plus its flat board, both surfaces, in the frame `f`. */
  const traceBoard = (
    seg: Segments,
    f: Frame,
    p0x: number,
    p0y: number,
    t0x: number,
    t0y: number,
    n0x: number,
    n0y: number,
    foldLen: number,
    phi: number,
    boardLen: number,
    end: Frame,
  ) => {
    seg.count = 0;
    let px = 0;
    let py = 0;
    let qx = 0;
    let qy = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      foldFrame(f, p0x, p0y, t0x, t0y, n0x, n0y, foldLen, phi, (foldLen * i) / SAMPLES, tmp);
      const ix = tmp.ox - tmp.yx * t;
      const iy = tmp.oy - tmp.yy * t;
      if (i > 0) {
        pushSegment(seg, px, py, tmp.ox, tmp.oy);
        pushSegment(seg, qx, qy, ix, iy);
      } else {
        pushSegment(seg, tmp.ox, tmp.oy, ix, iy);
      }
      px = tmp.ox;
      py = tmp.oy;
      qx = ix;
      qy = iy;
    }
    end.ox = tmp.ox;
    end.oy = tmp.oy;
    end.xx = tmp.xx;
    end.xy = tmp.xy;
    end.yx = tmp.yx;
    end.yy = tmp.yy;
    // The flat board: outer at y = 0, inner at y = -t (board frame), and its free edge.
    const ex = end.ox + end.xx * boardLen;
    const ey = end.oy + end.xy * boardLen;
    pushSegment(seg, end.ox, end.oy, ex, ey);
    pushSegment(seg, qx, qy, ex - end.yx * t, ey - end.yy * t);
    pushSegment(seg, ex, ey, ex - end.yx * t, ey - end.yy * t);
  };

  const traceLid = (lid: number) => {
    traceBoard(lidSegs, box, -a, top, 0, 1, 1, 0, lidFoldLen, HALF_PI - lid, lidLen, lidEnd);
  };
  const traceFlap = (phi: number) => {
    traceBoard(flapSegs, lidEnd, lidLen, 0, 1, 0, 0, -1, flapFoldLen, phi, flapLen, flapEnd);
  };

  /** Depth of a segment set inside the wall region {x >= wallX, y <= top}. */
  const wallDepth = (seg: Segments) => {
    let best = -Infinity;
    for (let s = 0; s < seg.count; s++) {
      const o = s * 4;
      const x0 = seg.data[o] ?? 0;
      const y0 = seg.data[o + 1] ?? 0;
      const x1 = seg.data[o + 2] ?? 0;
      const y1 = seg.data[o + 3] ?? 0;
      coefA[0] = x0 - wallX;
      coefB[0] = x1 - x0;
      coefA[1] = top - y0;
      coefB[1] = y0 - y1;
      best = Math.max(best, segmentDepth(coefA, coefB, 2));
    }
    return best;
  };

  /** Depth of a segment set inside a block standing in the box: x0..x1, below `y`. */
  const blockDepth = (seg: Segments, x0: number, x1: number, y: number) => {
    let best = -Infinity;
    for (let s = 0; s < seg.count; s++) {
      const o = s * 4;
      const sx0 = seg.data[o] ?? 0;
      const sy0 = seg.data[o + 1] ?? 0;
      const sx1 = seg.data[o + 2] ?? 0;
      const sy1 = seg.data[o + 3] ?? 0;
      coefA[0] = sx0 - x0;
      coefB[0] = sx1 - sx0;
      coefA[1] = x1 - sx0;
      coefB[1] = sx0 - sx1;
      coefA[2] = y - sy0;
      coefB[2] = sy0 - sy1;
      best = Math.max(best, segmentDepth(coefA, coefB, 3));
    }
    return best;
  };

  /** The flap at bend `phi` on the current lid: its depth in the wall region. */
  const flapWallDepth = (phi: number) => {
    traceFlap(phi);
    return wallDepth(flapSegs);
  };

  /**
   * The tuck rule for the current lid: the flap's bend given the bend asked
   * for. Below the release the tip rides the inside of the wall; above it the
   * flap eases from the rim to the asked bend.
   */
  const solveFlap = (wanted: number) => {
    // The bend that aims the flap at the rim corner, and the closest approach around it.
    const frameAngle = Math.atan2(lidEnd.xy, lidEnd.xx);
    const rootX = lidEnd.ox + lidEnd.xx * lidLen;
    const rootY = lidEnd.oy + lidEnd.xy * lidLen;
    const aim = frameAngle - Math.atan2(top - rootY, wallX - rootX);
    let lo = aim - 0.8;
    let hi = aim + 0.8;
    // Golden section for the bend of deepest reach into the wall region.
    const g = 0.381966;
    let m1 = lo + (hi - lo) * g;
    let m2 = hi - (hi - lo) * g;
    let f1 = flapWallDepth(m1);
    let f2 = flapWallDepth(m2);
    for (let i = 0; i < 22; i++) {
      if (f1 > f2) {
        hi = m2;
        m2 = m1;
        f2 = f1;
        m1 = lo + (hi - lo) * g;
        f1 = flapWallDepth(m1);
      } else {
        lo = m1;
        m1 = m2;
        f1 = f2;
        m2 = hi - (hi - lo) * g;
        f2 = flapWallDepth(m2);
      }
    }
    const deepest = (lo + hi) / 2;
    const reach = flapWallDepth(deepest);
    if (reach > 0) {
      // The tip can reach the wall: the flap stays inside, bent at least enough to clear it.
      if (wanted > deepest && flapWallDepth(wanted) <= 0) return wanted;
      let inLo = deepest;
      let inHi = deepest + 1.2;
      while (flapWallDepth(inHi) > 0 && inHi < deepest + Math.PI) inHi += 0.4;
      for (let i = 0; i < 20; i++) {
        const mid = (inLo + inHi) / 2;
        if (flapWallDepth(mid) > 0) inLo = mid;
        else inHi = mid;
      }
      return Math.max(wanted, inHi);
    }
    // Clear of the rim: ease from resting at the rim toward the asked bend.
    const release = smoothstep(0, FLAP_RELEASE, -reach);
    const held = Math.max(wanted, deepest);
    return held + (wanted - held) * release;
  };

  /** Dust flap outline at bend `phiDust`: its back edge in the side view, for the lid test. */
  const dustPoint = (phi: number, s: number, outer: boolean, out: Frame) => {
    // The dust fold rises from the side wall's top (y = top) and bends inward; only its height
    // and how far along it the point is matter in the side view.
    if (s <= dustFoldLen) {
      foldFrame(box, 0, top, 0, 1, 1, 0, dustFoldLen, phi, s, out);
    } else {
      foldFrame(box, 0, top, 0, 1, 1, 0, dustFoldLen, phi, dustFoldLen, tmp2);
      const along = s - dustFoldLen;
      out.ox = tmp2.ox + tmp2.xx * along;
      out.oy = tmp2.oy + tmp2.xy * along;
      out.yx = tmp2.yx;
      out.yy = tmp2.yy;
    }
    // The fold works in (inward, up); in the side view x is the board's width, so keep only y.
    out.oy -= outer ? 0 : out.yy * t;
  };

  /**
   * How far the dust flaps' back edge rises past the lid's inner surface
   * (positive: into or through the lid). The back edge runs from the hinge
   * end of the flap's root to its chamfered tip. The lid's outline lists its
   * inner surface as every other segment from the second (fold) plus the
   * board's inner line, all running from the hinge toward the free edge, so
   * their left normal points to the printed side.
   */
  const dustLidDepth = (phi: number) => {
    let best = -Infinity;
    const total = dustFoldLen + dustLen;
    for (let k = 0; k <= 8; k++) {
      const s = (total * k) / 8;
      dustPoint(phi, s, true, tmp);
      const along = Math.max(0, s - dustFoldLen) / dustLen;
      const px = -(dustHalf - dustChamfer * along);
      const py = tmp.oy;
      for (let i = 2; i <= SAMPLES * 2 + 2; i += 2) {
        const o = i * 4;
        const x0 = lidSegs.data[o] ?? 0;
        const y0 = lidSegs.data[o + 1] ?? 0;
        const x1 = lidSegs.data[o + 2] ?? 0;
        const y1 = lidSegs.data[o + 3] ?? 0;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-14) continue;
        const u = ((px - x0) * dx + (py - y0) * dy) / len2;
        if (u < 0 || u > 1) continue;
        best = Math.max(best, ((px - x0) * -dy + (py - y0) * dx) / Math.sqrt(len2));
      }
    }
    return best;
  };

  const solveDust = (open: number) => {
    const wanted = HALF_PI - smoothstep(0.04, 0.42, open) * DUST_SPRING;
    if (dustLidDepth(wanted) <= -DUST_GAP) return wanted;
    let lo = wanted;
    let hi = HALF_PI + 0.2;
    if (dustLidDepth(hi) > -DUST_GAP) return hi;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (dustLidDepth(mid) > -DUST_GAP) lo = mid;
      else hi = mid;
    }
    return hi;
  };

  /** Lays out lid and flap at `lid` (radians) and returns how deep they reach into the card and the stack. */
  const pose = (lid: number, wanted: number, cardTop: number) => {
    traceLid(lid);
    const phi = solveFlap(wanted);
    traceFlap(phi);
    const cx0 = shape.cardX0 - CARD_SIDE_GAP;
    const cx1 = shape.cardX1 + CARD_SIDE_GAP;
    const card = Math.max(
      blockDepth(lidSegs, cx0, cx1, cardTop + CARD_TOP_GAP),
      blockDepth(flapSegs, cx0, cx1, cardTop + CARD_TOP_GAP),
    );
    const stack = Math.max(
      blockDepth(lidSegs, shape.stackX0, shape.stackX1 + STACK_GAP, shape.stackTop + STACK_GAP),
      blockDepth(flapSegs, shape.stackX0, shape.stackX1 + STACK_GAP, shape.stackTop + STACK_GAP),
    );
    return { phi, depth: Math.max(card, stack) };
  };

  const maxLid = shape.lidOpen * 1.25;

  const solve = (
    lidIn: number,
    flapIn: number,
    peekIn: number,
    out: BoxPose = { lid: 0, phiLid: HALF_PI, phiFlap: HALF_PI, phiDust: HALF_PI, rise: 0 },
  ) => {
    const peek = clamp01(peekIn);
    const rise = shape.rise * smoothstep(TEASE.riseStart, 1, peek);
    const flapAsk = Math.max(
      flapIn,
      smoothstep(TEASE.flapStart, TEASE.flapEnd, peek) * TEASE.flapOpen,
    );
    const wanted = HALF_PI * (1 - flapAsk);
    const asked = Math.max(lidIn * shape.lidOpen, smoothstep(0, TEASE.lidEnd, peek) * TEASE.lid);
    const cardTop = shape.cardTop + rise;

    let lid = asked;
    let solved = pose(lid, wanted, cardTop);
    if (solved.depth > 0 && lid < maxLid) {
      // The card pushes the lid: find the lowest lid that clears it (scan up, then bisect).
      const step = 2 * DEG;
      let below = lid;
      let above = lid;
      while (above < maxLid) {
        above = Math.min(maxLid, above + step);
        if (pose(above, wanted, cardTop).depth <= 0) break;
        below = above;
      }
      for (let i = 0; i < 13; i++) {
        const mid = (below + above) / 2;
        if (pose(mid, wanted, cardTop).depth > 0) below = mid;
        else above = mid;
      }
      lid = above;
      solved = pose(lid, wanted, cardTop);
    }
    out.lid = lid;
    out.phiLid = HALF_PI - lid;
    out.phiFlap = solved.phi;
    out.phiDust = solveDust(lid / shape.lidOpen);
    out.rise = rise;
    return out;
  };

  const overlap = (p: BoxPose) => {
    traceLid(p.lid);
    traceFlap(p.phiFlap);
    const cardTop = shape.cardTop + p.rise;
    return Math.max(
      wallDepth(flapSegs),
      wallDepth(lidSegs),
      blockDepth(lidSegs, shape.cardX0, shape.cardX1, cardTop),
      blockDepth(flapSegs, shape.cardX0, shape.cardX1, cardTop),
      blockDepth(lidSegs, shape.stackX0, shape.stackX1, shape.stackTop),
      blockDepth(flapSegs, shape.stackX0, shape.stackX1, shape.stackTop),
      dustLidDepth(p.phiDust),
    );
  };

  return { solve, overlap };
}
