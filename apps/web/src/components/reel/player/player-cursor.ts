import { alignTo, glyphPoints, outlinePath, POINTS, type Glyph } from "./cursor-shapes";
import { LabelRoller } from "./label-roller";
import { approach, clamp, damp, ease, fit, saturate, smoothstep, Spring } from "./springs";

export type CursorElements = {
  /** Positioned at the eased pointer every frame. */
  root: HTMLElement;
  /** Scale, speed growth and press squash. */
  scale: SVGGElement;
  /** The body's own turn. */
  body: SVGGElement;
  fill: SVGPathElement;
  outline: SVGPathElement;
  /** The liquid surface the body's fill is clipped to (the sound state). */
  liquid: SVGPathElement;
  /** The ink X of the close state. */
  x: SVGGElement;
  /** A soft ink disc behind the glyphs, so they read over any picture. */
  plate: SVGCircleElement;
  label: HTMLElement;
  tip: HTMLElement;
  tipText: HTMLElement;
};

export type Tone = "yellow" | "blue" | "red" | "green";

/** What the cursor should look like this frame. */
export type CursorLook = {
  glyph: Glyph;
  tone: Tone;
  label: string;
  /** Show the ink X (the close state). */
  cross: boolean;
  /** How full the body is (the sound state's liquid), 0 to 1. */
  level: number;
  /** Draw the body's outline (an emptied sound glyph still reads). */
  outlined: boolean;
  /** The timecode above the seek plus, or null. */
  tip: string | null;
  /** The plus rolls along the timeline like a wheel. */
  rolls: boolean;
  /** Extra turn in degrees (the end star's spin). */
  spin: number;
  /** How much pointer speed grows the cursor (1 for the close disc). */
  speedGrowth: number;
  /** Size multiplier (smaller while docked over a button). */
  size: number;
  /** Radius of the ink plate behind the glyph, in unit px (0 for none). */
  plate: number;
};

export type CursorInput = {
  /** Where the cursor should go (the pointer, or pinned onto the timeline). */
  x: number;
  y: number;
  /** The real pointer, for snapping on first appearance. */
  pointerX: number;
  pointerY: number;
  down: boolean;
  /** Whether the cursor should be showing (a mouse over the stage, not idle). */
  shown: boolean;
  /** 0 to 1 while the player opens; the cursor pops in over its second half. */
  openness: number;
  /** 0 to 1: shrinks the cursor away (the end of a close). */
  vanish: number;
  reduced: boolean;
  width: number;
  height: number;
};

const TONE_FALLBACK: Record<Tone, string> = {
  yellow: "#f7bf33",
  blue: "#3a6dc5",
  red: "#f94141",
  green: "#0f8657",
};

function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** The brand accents, read from the site tokens (the player stage is always dark). */
function readTones() {
  const style = getComputedStyle(document.documentElement);
  const tones = {} as Record<Tone, [number, number, number]>;
  for (const tone of Object.keys(TONE_FALLBACK) as Tone[]) {
    tones[tone] =
      parseHex(style.getPropertyValue(`--brand-${tone}`)) ?? parseHex(TONE_FALLBACK[tone])!;
  }
  return tones;
}

const MORPH_OMEGA = 2 * Math.PI * 3.1;
const MORPH_ZETA = 0.72;

/**
 * The reel player's cursor: one shape that follows the pointer through
 * lusion.co's second-order spring (f 1.35, z 0.5, r 1.25), grows with
 * speed (up to 2.5 times), tilts with vertical velocity through a second
 * spring (f 1, z 0.8, r 1.2), squashes on press and pops on release, and
 * melts between the shapes that say what a click will do.
 *
 * Every point of the outline is its own small spring toward the next
 * shape, so a morph is interruptible at any moment and lands with a hint
 * of jelly instead of a linear tween.
 */
export class PlayerCursor {
  private readonly followX = new Spring(0, 1.35, 0.5, 1.25, true);
  private readonly followY = new Spring(0, 1.35, 0.5, 1.25, true);
  private readonly tilt = new Spring(0, 1, 0.8, 1.2);
  private readonly press = new Spring(0, 4.2, 0.34, 0);
  private readonly turn = new Spring(0, 2.3, 0.62, 0);
  private readonly level = new Spring(1, 2.1, 0.5, 0);
  private readonly slope = new Spring(0, 1.5, 0.22, 0);
  private readonly size = new Spring(1, 2.4, 0.55, 0);
  private readonly plate = new Spring(0, 2.6, 0.6, 0);
  private readonly roller: LabelRoller;
  private tones = readTones();
  private color: [number, number, number];
  private points: Float32Array;
  private velocity = new Float32Array(POINTS * 2);
  private target: Float32Array;
  private glyph: Glyph = "disc";
  private morphing = true;
  private unit = 1;
  private cache = new Map<Glyph, Float32Array>();
  private placed = false;
  private visible = 0;
  private pop = 0;
  private spinIn = 0;
  private roll = 0;
  private outlineWidth = 0;
  private labelSide = 1;
  private labelShown = 0;
  private tipShown = 0;
  private tipTextValue = "";
  private time = 0;
  private lastFill = "";
  private lastOutline = -1;

  constructor(private readonly el: CursorElements) {
    this.roller = new LabelRoller(el.label);
    this.color = [...this.tones.yellow];
    this.points = new Float32Array(this.shape("disc"));
    this.target = this.points;
    el.fill.setAttribute("d", outlinePath(this.points));
    el.outline.setAttribute("d", outlinePath(this.points));
  }

  private shape(glyph: Glyph) {
    let points = this.cache.get(glyph);
    if (!points) {
      points = glyphPoints(glyph, this.unit);
      this.cache.set(glyph, points);
    }
    return points;
  }

  /** The cursor's size unit: its shapes are drawn for a 1440 px wide stage. */
  setUnit(unit: number) {
    if (Math.abs(unit - this.unit) < 0.01) return;
    this.unit = unit;
    this.cache.clear();
    this.target = alignTo(this.points, this.shape(this.glyph));
    this.morphing = true;
  }

  refreshTones() {
    this.tones = readTones();
  }

  /** Where the cursor is drawn now (the eased pointer). */
  get position() {
    return { x: this.followX.value, y: this.followY.value };
  }

  /** The current radius of the close disc on screen, for landing the close on it. */
  get radius() {
    return 44 * this.unit * this.lastScale;
  }

  private lastScale = 1;

  /** Starts the next appearance exactly at the pointer instead of flying in. */
  place(x: number, y: number) {
    this.followX.reset(x);
    this.followY.reset(y);
    this.placed = true;
  }

  update(dt: number, input: CursorInput, look: CursorLook) {
    const { el } = this;
    this.time += dt;
    const reduced = input.reduced;

    if (!this.placed || (this.visible < 0.02 && input.shown)) {
      this.place(input.pointerX, input.pointerY);
    }
    const x = reduced ? input.x : this.followX.update(dt, input.x);
    const y = reduced ? input.y : this.followY.update(dt, input.y);
    if (reduced) {
      this.followX.reset(x);
      this.followY.reset(y);
    }
    // lusion measures the follow's speed in normalised device units per
    // second (the viewport spans 2), which is what its 2.5 cap is tuned for.
    const vx = this.followX.velocity / Math.max(1, input.width / 2);
    const vy = this.followY.velocity / Math.max(1, input.height / 2);
    const speed = Math.hypot(vx, vy);
    const speedK = reduced ? 1 : 1 + (Math.min(2.5, speed / 5 + 1) - 1) * look.speedGrowth;
    const tilt = reduced ? 0 : this.tilt.update(dt, clamp(vy, -1, 1));

    // Appearance: pops in over the second half of the open, fades when idle.
    this.visible = approach(this.visible, input.shown ? 1 : 0, input.shown ? 5 : 3.2, dt);
    const opening = fit(input.openness, 0.5, 1, 0, 1, ease.hold);
    if (input.openness > 0.5) this.pop = approach(this.pop, 1, 1.5, dt);
    if (this.pop > 0.35) this.spinIn = approach(this.spinIn, 1, 3, dt);
    const popScale = reduced ? 1 : ease.backOut(this.pop) * opening;
    const vanish = 1 - ease.backInOut(saturate(input.vanish));
    const pressed = reduced ? 0 : this.press.update(dt, input.down ? 1 : 0);
    const shown = ease.quadInOut(this.visible);
    const size = reduced ? look.size : this.size.update(dt, look.size);
    const scale = Math.max(0, speedK * popScale * vanish * size * (0.55 + 0.45 * shown));
    this.lastScale = scale;
    const sx = scale * (1 + 0.2 * pressed);
    const sy = scale * (1 - 0.24 * pressed);

    // The body's own turn: a little tilt for the glyphs, a roll for the plus.
    if (look.rolls) {
      const rolling = Math.abs(this.followX.velocity) > 40;
      this.roll += ((this.followX.velocity * dt) / (17 * this.unit)) * (180 / Math.PI);
      if (!rolling) this.roll = Math.round(this.roll / 90) * 90;
    } else {
      this.roll = Math.round(this.roll / 90) * 90;
    }
    const turnTarget =
      (look.rolls ? this.roll : 0) +
      look.spin +
      tilt * (look.glyph === "star" ? 60 : look.glyph === "disc" ? 0 : 12);
    const turn = reduced ? turnTarget : this.turn.update(dt, turnTarget);

    // The shape.
    if (look.glyph !== this.glyph) {
      this.glyph = look.glyph;
      this.target = alignTo(this.points, this.shape(look.glyph));
      this.morphing = true;
    }
    if (this.morphing) this.morph(dt, reduced);

    // Colour, eased in a quarter second (instant under reduced motion).
    const tone = this.tones[look.tone];
    for (let i = 0; i < 3; i++) {
      this.color[i] = reduced ? tone[i] : damp(this.color[i], tone[i], 1e-7, dt);
    }
    const fill = `rgb(${this.color.map((c) => Math.round(c)).join(",")})`;

    // The liquid: fills or drains the body, sloshing with sideways motion.
    const level = reduced ? look.level : this.level.update(dt, look.level);
    const slope = reduced
      ? 0
      : this.slope.update(dt, clamp(this.followX.velocity / 1400, -0.45, 0.45));
    const { top, bottom, half } = this.extent();
    const margin = 3 * this.unit + Math.abs(slope) * half;
    const surface = bottom + margin + (top - margin - (bottom + margin)) * saturate(level);
    const wave = 1.1 * this.unit * 4 * level * (1 - level);
    let liquid = "";
    for (let i = 0; i <= 8; i++) {
      const lx = -half - 8 + ((half * 2 + 16) * i) / 8;
      const ly = surface + slope * lx + wave * Math.sin(this.time * 7 + lx * 0.22);
      liquid += `${i ? "L" : "M"}${lx.toFixed(2)} ${ly.toFixed(2)}`;
    }
    liquid += `L${(half + 8).toFixed(2)} ${(bottom + 80).toFixed(2)}L${(-half - 8).toFixed(2)} ${(bottom + 80).toFixed(2)}Z`;
    this.outlineWidth = reduced
      ? look.outlined
        ? 2.5
        : 0
      : approach(this.outlineWidth, look.outlined ? 2.5 : 0, 14, dt);

    // The X: spins in on every open, then swings with vertical velocity.
    const crossScale = look.cross ? 1 : 0;
    const cross = reduced ? crossScale : ease.quadInOut(this.crossRatio(dt, crossScale));
    const crossTurn = ease.backInOut(reduced ? 1 : this.spinIn) * 90 + tilt * 75;

    const plate = Math.max(0, reduced ? look.plate : this.plate.update(dt, look.plate)) * this.unit;

    // Write the frame.
    el.root.style.opacity = shown.toFixed(3);
    el.root.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    el.scale.setAttribute("transform", `scale(${sx.toFixed(4)} ${sy.toFixed(4)})`);
    el.body.setAttribute("transform", `rotate(${turn.toFixed(2)})`);
    if (fill !== this.lastFill) {
      el.fill.setAttribute("fill", fill);
      el.outline.setAttribute("stroke", fill);
      this.lastFill = fill;
    }
    if (Math.abs(this.outlineWidth - this.lastOutline) > 0.01) {
      el.outline.setAttribute("stroke-width", this.outlineWidth.toFixed(2));
      el.outline.style.opacity = this.outlineWidth > 0.05 ? "1" : "0";
      this.lastOutline = this.outlineWidth;
    }
    el.liquid.setAttribute("d", liquid);
    el.plate.setAttribute("r", plate.toFixed(2));
    el.x.setAttribute(
      "transform",
      `rotate(${crossTurn.toFixed(2)}) scale(${Math.max(0.0001, cross * this.unit).toFixed(4)})`,
    );

    this.updateLabel(dt, input, look, x, scale, speedK, reduced);
  }

  private crossValue = 1;

  private crossRatio(dt: number, target: number) {
    this.crossValue = approach(this.crossValue, target, 4, dt);
    return this.crossValue;
  }

  private extent() {
    let top = 0;
    let bottom = 0;
    let half = 0;
    const p = this.points;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i + 1] < top) top = p[i + 1];
      if (p[i + 1] > bottom) bottom = p[i + 1];
      if (Math.abs(p[i]) > half) half = Math.abs(p[i]);
    }
    return { top, bottom, half };
  }

  private morph(dt: number, reduced: boolean) {
    const p = this.points;
    const v = this.velocity;
    const t = this.target;
    if (reduced) {
      p.set(t);
      v.fill(0);
      this.morphing = false;
    } else {
      const steps = dt > 1 / 50 ? 2 : 1;
      const h = dt / steps;
      const k = MORPH_OMEGA * MORPH_OMEGA;
      const c = 2 * MORPH_ZETA * MORPH_OMEGA;
      let moving = false;
      for (let s = 0; s < steps; s++) {
        for (let i = 0; i < p.length; i++) {
          v[i] += (k * (t[i] - p[i]) - c * v[i]) * h;
          p[i] += v[i] * h;
        }
      }
      for (let i = 0; i < p.length; i++) {
        if (Math.abs(v[i]) > 0.4 || Math.abs(t[i] - p[i]) > 0.05) {
          moving = true;
          break;
        }
      }
      if (!moving) {
        p.set(t);
        v.fill(0);
        this.morphing = false;
      }
    }
    const d = outlinePath(p);
    this.el.fill.setAttribute("d", d);
    this.el.outline.setAttribute("d", d);
  }

  private updateLabel(
    dt: number,
    input: CursorInput,
    look: CursorLook,
    x: number,
    scale: number,
    speedK: number,
    reduced: boolean,
  ) {
    const { el } = this;
    this.roller.set(look.label, !reduced && this.visible > 0.5);
    const { half, top } = this.extent();
    const width = el.label.offsetWidth || 60;
    const gap = half * scale + 14;
    // Flip to the left side near the right edge, with some hysteresis.
    if (this.labelSide > 0 && x + gap + width > input.width - 16) this.labelSide = -1;
    else if (this.labelSide < 0 && x + gap + width < input.width - 48) this.labelSide = 1;
    const offset = this.labelSide > 0 ? gap : -gap - width;
    // Fast flicks hide the word; it comes back as the cursor slows down.
    const calm = 1 - smoothstep(1.35, 2.1, speedK);
    const labelTarget = look.label && input.shown && input.vanish === 0 ? calm : 0;
    this.labelShown = reduced ? labelTarget : approach(this.labelShown, labelTarget, 6, dt);
    const shownLabel = this.labelShown * saturate((this.pop - 0.4) / 0.6);
    el.label.style.opacity = shownLabel.toFixed(3);
    el.label.style.transform = `translate3d(${offset.toFixed(1)}px, -50%, 0) scale(${(0.85 + 0.15 * shownLabel).toFixed(3)})`;

    // The timecode above the seek plus.
    if (look.tip !== null && look.tip !== this.tipTextValue) {
      el.tipText.textContent = look.tip;
      this.tipTextValue = look.tip;
    }
    const tipTarget = look.tip !== null && input.shown ? 1 : 0;
    this.tipShown = reduced ? tipTarget : approach(this.tipShown, tipTarget, 7, dt);
    const lift = top * scale + 16 + 8 * this.tipShown;
    el.tip.style.opacity = this.tipShown.toFixed(3);
    el.tip.style.transform = `translate3d(-50%, ${(-lift - 24).toFixed(1)}px, 0) scale(${(0.8 + 0.2 * this.tipShown).toFixed(3)})`;
  }

  destroy() {
    this.roller.destroy();
  }
}
