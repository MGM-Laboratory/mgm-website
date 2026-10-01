import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from "three";

import type { StoryCard } from "@/data/story";
import {
  IDLE_GAP,
  LOGOS,
  WAKE_SECONDS,
  identityTransform,
  pieceTransform,
  type LogoArt,
  type LogoState,
  type PieceTransform,
} from "@/components/story/acts/cards/logos";

/**
 * One drawn card's face, painted into a canvas that is the card's texture
 * (so the logo, the title and the line stay printed on the card as it
 * turns, bends and catches the light). A white card in both schemes (it is
 * a physical object): a thin ink border, corner indices like a real
 * playing card (the division's initial over its logo, and the same turned
 * half way round), a faint rim at the card's edge, the logo as the major
 * visual over a soft tint of the division's colour in the top half, the
 * title in Hanken Grotesk, one line in Geist, and a small Geist Mono footer.
 *
 * It wakes when the card lands face up: the logo plays its entrance (see
 * `logos.ts`), the title types in letter by letter with a small
 * overshoot, the line rises in. Asleep, the face shows the printed plate
 * (border, indices, the tinted disc and the logo at 40 percent), so a face
 * is never empty. Awake, it keeps living: an idle flourish every few
 * seconds, the hover personality, the pointer followed by the logo, a
 * ripple through the title on hover.
 *
 * Drawing happens only while something moves (a dirty test per frame), in
 * a 1000 unit wide space scaled to the canvas.
 */

const UNIT_W = 1000;
const UNIT_H = Math.round((1000 * 1078) / 641);
const PAPER = "#fefefd";
const INK = "#0e1116";
const INK_2 = "#3b4150";
const INK_3 = "#6b7280";

const ACCENTS: ReadonlyMap<StoryCard["accent"], string> = new Map([
  ["blue", "#3a6dc5"],
  ["red", "#f94141"],
  ["green", "#0f8657"],
  ["yellow", "#f7bf33"],
]);

const INDEX: ReadonlyMap<StoryCard["id"], string> = new Map([
  ["website", "W"],
  ["mobile", "M"],
  ["game", "G"],
  ["ux", "UX"],
]);

export type FrontFonts = { display: string; sans: string; mono: string };

/** The page's own font families (next/font names them), from the CSS variables on <html>. */
export function pageFonts(): FrontFonts {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim();
    return value ? `${value}, ${fallback}` : fallback;
  };
  return {
    display: read("--font-hanken", "system-ui, sans-serif"),
    sans: read("--font-geist-sans", "system-ui, sans-serif"),
    mono: read("--font-geist-mono", "ui-monospace, monospace"),
  };
}

type Piece = { id: string; path: Path2D; fill: string };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const phase = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const outCubic = (t: number) => 1 - (1 - t) ** 3;
const outBack = (t: number, s = 1.7) => {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};

export type FrontInput = {
  /** The card shows its face (it is turning up or up): the wake runs forward. */
  awake: boolean;
  /** 0..1 hover spring. */
  hover: number;
  /** The pointer on the face in canvas units (0..1000, 0..UNIT_H from the top left), or null. */
  pointer: { x: number; y: number } | null;
  /** The card is on screen at all (face visible): when false nothing is drawn. */
  shown: boolean;
};

export class CardFront {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  private readonly g: CanvasRenderingContext2D | null;
  private readonly accent: string;
  private readonly art: LogoArt | null;
  private readonly pieces: Piece[];
  private fonts: FrontFonts;
  private dirty = true;
  /** Seconds of wake (0 asleep, up to WAKE_SECONDS); runs backward faster when the card turns away. */
  private wake = 0;
  private hoverStart = -1;
  private wasHovered = false;
  private idleStart = -10;
  private nextIdle = 0;
  private rippleStart = -10;
  private lastHover = 0;
  private lastPointer = "";
  private readonly state: LogoState = {
    wake: 0,
    time: 0,
    hover: 0,
    hoverAge: -1,
    pointer: null,
    idleAge: -1,
  };
  private readonly transform: PieceTransform = identityTransform({
    tx: 0,
    ty: 0,
    rotate: 0,
    sx: 1,
    sy: 1,
    alpha: 1,
    outline: 0,
    pivotX: 0,
    pivotY: 0,
  });
  private readonly logoPointer = { x: 0, y: 0 };
  private titleAdvance: number[] = [];
  private lines: string[] = [];
  private measured = "";

  constructor(
    private readonly card: StoryCard,
    private readonly number: number,
    width: number,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = Math.round((width * UNIT_H) / UNIT_W);
    this.g = this.canvas.getContext("2d");
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = true;
    this.accent = ACCENTS.get(card.accent) ?? "#3a6dc5";
    this.art = LOGOS.get(card.id) ?? null;
    this.pieces = (this.art?.pieces ?? []).map((piece) => {
      const path = new Path2D();
      if (piece.circle) {
        const [cx, cy, r] = piece.circle;
        path.arc(cx, cy, r, 0, Math.PI * 2);
      } else if (piece.d) {
        path.addPath(new Path2D(piece.d));
      }
      return { id: piece.id, path, fill: piece.fill };
    });
    this.fonts = pageFonts();
  }

  /** The fonts arrived (or changed): measure and draw again. */
  refreshFonts() {
    this.fonts = pageFonts();
    this.measured = "";
    this.dirty = true;
  }

  /** Forces a redraw (a new canvas size, a context restore). */
  invalidate() {
    this.dirty = true;
  }

  /** How far the face has woken, 0..1. */
  get woken() {
    return clamp01(this.wake / WAKE_SECONDS);
  }

  /**
   * Advances the face's own clock and redraws when anything moved. Returns
   * true when the texture changed this frame.
   */
  update(input: FrontInput, time: number, dt: number) {
    const before = this.wake;
    if (input.awake) this.wake = Math.min(WAKE_SECONDS + 0.01, this.wake + dt);
    else this.wake = Math.max(0, this.wake - dt * 2.5);
    const waking = this.wake !== before;

    const hovered = input.hover > 0.5;
    if (hovered && !this.wasHovered) {
      this.hoverStart = time;
      this.rippleStart = time;
    }
    this.wasHovered = hovered;
    const hoverAge = this.hoverStart >= 0 ? time - this.hoverStart : -1;

    // Idle flourishes once awake and left alone (the first one a while after waking).
    const gap = IDLE_GAP.get(this.card.id) ?? 5;
    const awakeFully = this.wake >= WAKE_SECONDS;
    if (awakeFully && before < WAKE_SECONDS)
      this.nextIdle = time + gap * (0.45 + 0.2 * this.number);
    if (awakeFully && input.hover < 0.05) {
      if (time > this.nextIdle) {
        this.idleStart = time;
        this.nextIdle = time + gap * (0.85 + 0.3 * ((this.number * 0.37) % 1));
      }
    }
    const idleAge = time - this.idleStart;
    const idling = idleAge >= 0 && idleAge < 1.3;
    const rippling = time - this.rippleStart < 0.9;

    const pointerKey = input.pointer
      ? `${Math.round(input.pointer.x / 6)},${Math.round(input.pointer.y / 6)}`
      : "";
    const pointerMoved = pointerKey !== this.lastPointer;
    this.lastPointer = pointerKey;
    const hoverMoving = Math.abs(input.hover - this.lastHover) > 0.002 || input.hover > 0.02;
    this.lastHover = input.hover;

    const needs =
      this.dirty || waking || idling || rippling || hoverMoving || (pointerMoved && this.wake > 0);
    if (!needs || !input.shown) return false;
    this.dirty = false;
    this.state.wake = this.wake;
    this.state.time = time;
    this.state.hover = input.hover;
    this.state.hoverAge = hoverAge;
    this.state.idleAge = idling ? idleAge : -1;
    this.state.pointer = input.pointer ? this.toLogo(input.pointer) : null;
    this.draw(time);
    this.texture.needsUpdate = true;
    return true;
  }

  private toLogo(p: { x: number; y: number }) {
    const art = this.art;
    if (!art) return null;
    const { scale, cx, cy } = logoFrame(art, LOGO_BOX);
    this.logoPointer.x = (p.x - LOGO_CENTRE_X) / scale + cx;
    this.logoPointer.y = (p.y - LOGO_CENTRE_Y) / scale + cy;
    return this.logoPointer;
  }

  private measure(g: CanvasRenderingContext2D) {
    const key = `${this.fonts.display}|${this.fonts.sans}`;
    if (key === this.measured) return;
    this.measured = key;
    g.font = `600 ${TITLE_SIZE}px ${this.fonts.display}`;
    const title = this.card.title;
    this.titleAdvance = [];
    for (let i = 0; i <= title.length; i += 1) {
      this.titleAdvance.push(g.measureText(title.slice(0, i)).width);
    }
    g.font = `400 ${LINE_SIZE}px ${this.fonts.sans}`;
    this.lines = wrap(g, this.card.line, CONTENT_W);
  }

  private draw(time: number) {
    const g = this.g;
    if (!g) return;
    const k = this.canvas.width / UNIT_W;
    g.setTransform(k, 0, 0, k, 0, 0);
    this.measure(g);
    const wake = this.wake;

    // Paper (the card's grain and sheen come from its material), with a faint rim at its very edge
    // (the card's own rounded corner) so the white card keeps its silhouette on the light page.
    g.fillStyle = PAPER;
    g.fillRect(0, 0, UNIT_W, UNIT_H);
    g.lineWidth = 8;
    g.strokeStyle = "rgba(14,17,22,0.13)";
    roundRect(g, 4, 4, UNIT_W - 8, UNIT_H - 8, CORNER_UNITS - 4);
    g.stroke();

    // The border: a thin ink line, and a hairline in the accent that draws itself as it wakes.
    g.lineWidth = 3;
    g.strokeStyle = "rgba(14,17,22,0.1)";
    roundRect(g, 40, 40, UNIT_W - 80, UNIT_H - 80, 46);
    g.stroke();
    const frame = outCubic(phase(wake, 0.1, 1.2));
    if (frame > 0) {
      g.save();
      g.globalAlpha = 0.55 * frame;
      g.strokeStyle = this.accent;
      g.lineWidth = 2;
      roundRect(g, 56, 56, UNIT_W - 112, UNIT_H - 112, 34);
      const perimeter = 2 * (UNIT_W - 112 + UNIT_H - 112);
      g.setLineDash([perimeter * frame, perimeter]);
      g.stroke();
      g.restore();
    }

    // The tinted disc behind the logo (printed on the plate, it swells as the face wakes), and a
    // dotted ring that turns slowly.
    const disc = outBack(phase(wake, 0, 0.55), 1.4);
    g.save();
    g.fillStyle = this.accent;
    g.globalAlpha = 0.075 + 0.025 * clamp01(disc);
    g.beginPath();
    g.arc(LOGO_CENTRE_X, LOGO_CENTRE_Y, 300 * (0.86 + 0.14 * disc), 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.22 * clamp01(disc);
    g.strokeStyle = this.accent;
    g.lineWidth = 3;
    g.setLineDash([2, 16]);
    g.lineDashOffset = -time * 12;
    g.beginPath();
    g.arc(LOGO_CENTRE_X, LOGO_CENTRE_Y, 330, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    this.drawLogo(g, wake);
    this.drawIndices(g);
    this.drawTitle(g, wake, time);

    // The line, rising in line by line.
    g.font = `400 ${LINE_SIZE}px ${this.fonts.sans}`;
    g.textBaseline = "alphabetic";
    g.fillStyle = INK_2;
    this.lines.forEach((line, n) => {
      const p = outCubic(phase(wake, 0.95 + n * 0.14, 1.55 + n * 0.14));
      if (p <= 0) return;
      g.globalAlpha = p;
      g.fillText(line, CONTENT_X, LINE_Y + n * LINE_HEIGHT + (1 - p) * 26);
    });
    g.globalAlpha = 1;

    // The footer.
    const foot = phase(wake, 1.5, 2.1);
    if (foot > 0) {
      g.globalAlpha = foot;
      g.font = `500 ${FOOT_SIZE}px ${this.fonts.mono}`;
      g.fillStyle = INK_3;
      g.letterSpacing = "4px";
      g.fillText("MGM LABORATORY", CONTENT_X, FOOT_Y);
      g.textAlign = "right";
      g.fillText(`${String(this.number + 1).padStart(2, "0")} / 04`, UNIT_W - 190, FOOT_Y);
      g.textAlign = "left";
      g.letterSpacing = "0px";
      g.globalAlpha = 1;
    }
  }

  private drawLogo(g: CanvasRenderingContext2D, wake: number) {
    const art = this.art;
    if (!art) return;
    const { scale, cx, cy } = logoFrame(art, LOGO_BOX);
    g.save();
    g.translate(LOGO_CENTRE_X, LOGO_CENTRE_Y);
    g.scale(scale, scale);
    g.translate(-cx, -cy);
    // Asleep: the printed plate, the logo in its own colours at 40 percent (a face is never
    // empty, even before it wakes); the waking pieces gather on it as it fades.
    const ghost = 1 - outCubic(clamp01(wake / 0.8));
    if (ghost > 0) {
      g.globalAlpha = 0.4 * ghost;
      for (const piece of this.pieces) {
        g.fillStyle = piece.fill;
        g.fill(piece.path);
      }
      g.globalAlpha = 1;
    }
    if (wake > 0) {
      for (const piece of this.pieces) {
        const t = pieceTransform(this.card.id, piece.id, this.state, this.transform);
        if (t.alpha <= 0.001) continue;
        g.save();
        g.translate(t.pivotX + t.tx, t.pivotY + t.ty);
        g.rotate(t.rotate);
        g.scale(t.sx, t.sy);
        g.translate(-t.pivotX, -t.pivotY);
        g.globalAlpha = t.alpha * (1 - t.outline * 0.92);
        g.fillStyle = piece.fill;
        g.fill(piece.path);
        if (t.outline > 0.01) {
          g.globalAlpha = t.alpha * t.outline;
          g.lineWidth = 14;
          g.strokeStyle = piece.fill;
          g.stroke(piece.path);
        }
        g.restore();
      }
    }
    g.restore();
  }

  private drawIndices(g: CanvasRenderingContext2D) {
    const label = INDEX.get(this.card.id) ?? this.card.title.slice(0, 1);
    const art = this.art;
    const corner = (rotated: boolean) => {
      g.save();
      if (rotated) {
        g.translate(UNIT_W, UNIT_H);
        g.rotate(Math.PI);
      }
      g.fillStyle = INK;
      g.font = `600 70px ${this.fonts.display}`;
      g.textAlign = "center";
      g.textBaseline = "alphabetic";
      g.fillText(label, 112, 152);
      g.textAlign = "left";
      if (art) {
        const { scale, cx, cy } = logoFrame(art, 64);
        g.translate(112, 212);
        g.scale(scale, scale);
        g.translate(-cx, -cy);
        for (const piece of this.pieces) {
          g.fillStyle = piece.fill;
          g.fill(piece.path);
        }
      }
      g.restore();
    };
    corner(false);
    corner(true);
  }

  private drawTitle(g: CanvasRenderingContext2D, wake: number, time: number) {
    const title = this.card.title;
    // The accent bar, drawn in before the letters.
    const bar = outCubic(phase(wake, 0.3, 0.75));
    if (bar > 0) {
      g.fillStyle = this.accent;
      roundRect(g, CONTENT_X, BAR_Y, 120 * bar, 9, 4.5);
      g.fill();
    }
    g.font = `600 ${TITLE_SIZE}px ${this.fonts.display}`;
    g.fillStyle = INK;
    g.textBaseline = "alphabetic";
    const ripple = time - this.rippleStart;
    for (let i = 0; i < title.length; i += 1) {
      const p = phase(wake, 0.42 + i * 0.05, 0.72 + i * 0.05);
      if (p <= 0) continue;
      const rise = outBack(p, 2.4);
      const x = CONTENT_X + (this.titleAdvance.at(i) ?? 0);
      const wave =
        ripple >= 0 && ripple < 0.9 ? Math.sin(clamp01(ripple * 2.2 - i * 0.12) * Math.PI) * 10 : 0;
      g.save();
      g.globalAlpha = clamp01(p * 2.5);
      g.translate(x, TITLE_Y + (1 - rise) * 46 - wave);
      g.fillText(title.charAt(i), 0, 0);
      g.restore();
    }
  }

  dispose() {
    this.texture.dispose();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}

// ------------------------------------------------------------------ layout of the face (canvas units)

/** The card's corner radius in canvas units (card-mesh.ts: 50 of the back's 641 wide). */
const CORNER_UNITS = Math.round((1000 * 50) / 641);
const LOGO_CENTRE_X = 500;
const LOGO_CENTRE_Y = 448;
/** The logo's box: about 58 percent of the card's width. */
const LOGO_BOX = 560;
const CONTENT_X = 104;
const CONTENT_W = UNIT_W - 2 * CONTENT_X;
const BAR_Y = 900;
const TITLE_SIZE = 118;
const TITLE_Y = 1050;
const LINE_SIZE = 44;
const LINE_HEIGHT = 62;
const LINE_Y = 1146;
const FOOT_SIZE = 30;
const FOOT_Y = UNIT_H - 118;

/** The canvas units per face unit (the card's real width is 1000 units). */
export const FRONT_UNITS = { width: UNIT_W, height: UNIT_H } as const;

function logoFrame(art: LogoArt, box: number) {
  const [x, y, w, h] = art.ink;
  const scale = Math.min(box / w, (box * 0.92) / h);
  return { scale, cx: x + w / 2, cy: y + h / 2 };
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), h, Math.min(r, w / 2, h / 2));
}

/**
 * Wraps `text` into as few lines as fit `width`, then balances them: the
 * narrowest width that keeps that many lines, so no word is left alone on
 * the last line.
 */
function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const lines = greedyWrap(g, text, width);
  if (lines.length < 2) return lines;
  let lo = width * 0.5;
  let hi = width;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    if (greedyWrap(g, text, mid).length > lines.length) lo = mid;
    else hi = mid;
  }
  return greedyWrap(g, text, hi);
}

function greedyWrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
