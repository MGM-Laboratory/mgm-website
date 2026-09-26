import { seededRandom } from "@/components/reel/reel-math";

/**
 * The stand-in for the company profile video while none is uploaded: a
 * Bauhaus test card. Brand shapes sit on a grid, turning slowly while
 * their rows slide past each other, over a band of brand colour bars and
 * a thin ring with a crosshair, the way a broadcast test card holds the
 * screen until the programme starts.
 *
 * It draws into a 2D canvas: shown as is in the DOM version, and used as
 * the texture of the WebGL video plane. Everything but the motion is
 * seeded, so a still frame (reduced motion) is the same on every load.
 */

type ShapeKind = "circle" | "half" | "quarter" | "triangle" | "square" | "plus" | "x" | "ring";

type Cell = { kind: ShapeKind; color: number; turn: number; spin: number };

const KINDS: ShapeKind[] = ["circle", "half", "quarter", "triangle", "square", "plus", "x", "ring"];
const COLS = 8;
const ROWS = 3;
/** Cells per second each row slides; alternate rows run the other way. */
const SLIDE = 0.055;
const FPS = 30;

type Palette = {
  paper: string;
  line: string;
  ink: string;
  brand: [string, string, string, string];
};

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.classList.contains("dark");
  return {
    paper: dark ? read("--surface-inverse", "#0e1116") : read("--surface", "#ffffff"),
    line: dark ? read("--line", "#262a33") : read("--line-strong", "#d8d8d2"),
    ink: dark ? read("--foreground", "#ededed") : read("--ink", "#0e1116"),
    brand: [
      read("--brand-blue", "#3a6dc5"),
      read("--brand-yellow", "#f7bf33"),
      read("--brand-red", "#f94141"),
      read("--brand-green", "#0f8657"),
    ],
  };
}

function buildCells() {
  const rand = seededRandom(0x7e57ca);
  const rows: Cell[][] = [];
  for (let r = 0; r < ROWS; r += 1) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c += 1) {
      const kind = KINDS[Math.floor(rand() * KINDS.length)];
      row.push({
        kind,
        color: Math.floor(rand() * 4),
        turn: Math.floor(rand() * 4) * (Math.PI / 2),
        // Some shapes turn, some rest: a quiet card, not a busy one.
        spin: rand() < 0.55 ? (rand() < 0.5 ? -1 : 1) * (0.12 + rand() * 0.22) : 0,
      });
    }
    rows.push(row);
  }
  return rows;
}

export class ReelTestCard {
  readonly canvas: HTMLCanvasElement;
  /** Bumped on every drawn frame, so a texture knows when to re-upload. */
  version = 0;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly cells = buildCells();
  private palette: Palette | null = null;
  private running = false;
  private lastDraw = -1;
  private clock = 0;
  private width = 0;
  private height = 0;
  private readonly observer: MutationObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.observer = new MutationObserver(() => {
      this.palette = null;
      this.draw();
    });
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  /** Sizes the backing store to the displayed box (capped), then redraws. */
  resize(cssWidth: number, cssHeight: number) {
    const scale = Math.min(1.5, window.devicePixelRatio || 1);
    let width = Math.max(64, Math.round(cssWidth * scale));
    let height = Math.max(32, Math.round(cssHeight * scale));
    const cap = 1600 / Math.max(width, height);
    if (cap < 1) {
      width = Math.round(width * cap);
      height = Math.round(height * cap);
    }
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.draw();
  }

  /** Animates from the caller's frame loop; `dt` in seconds. */
  tick(dt: number) {
    if (!this.running) return;
    this.clock += dt;
    if (this.clock - this.lastDraw < 1 / FPS) return;
    this.lastDraw = this.clock;
    this.draw();
  }

  start() {
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  dispose() {
    this.running = false;
    this.observer.disconnect();
  }

  /** Draws the card at the current clock. */
  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.width) return;
    this.palette ??= readPalette();
    const { paper, line, ink, brand } = this.palette;
    const w = this.width;
    const h = this.height;
    const time = this.clock;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);

    const barsHeight = Math.round(h * 0.13);
    const fieldHeight = h - barsHeight;
    const cell = fieldHeight / ROWS;
    const cols = Math.ceil(w / cell) + 2;

    // The grid.
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1, h / 480);
    ctx.beginPath();
    for (let r = 1; r < ROWS; r += 1) {
      ctx.moveTo(0, r * cell);
      ctx.lineTo(w, r * cell);
    }
    ctx.stroke();

    // Rows of shapes, sliding.
    for (let r = 0; r < ROWS; r += 1) {
      const direction = r % 2 === 0 ? 1 : -1;
      const offset = (((time * SLIDE * direction) % COLS) + COLS) % COLS;
      const shift = offset - Math.floor(offset);
      const first = Math.floor(offset);
      ctx.beginPath();
      for (let k = -1; k < cols; k += 1) {
        const x = (k + shift) * cell;
        ctx.moveTo(x, r * cell);
        ctx.lineTo(x, (r + 1) * cell);
      }
      ctx.stroke();
      for (let k = -1; k < cols; k += 1) {
        const index = (((k - first) % COLS) + COLS) % COLS;
        const item = this.cells[r][index];
        const cx = (k + shift + 0.5) * cell;
        const cy = (r + 0.5) * cell;
        this.shape(ctx, item, cx, cy, cell * 0.34, item.turn + time * item.spin, brand, ink);
      }
    }

    // The colour bars.
    const bars = [brand[0], brand[1], brand[2], brand[3], ink, paper];
    const barWidth = w / bars.length;
    for (let i = 0; i < bars.length; i += 1) {
      ctx.fillStyle = bars[i];
      ctx.fillRect(Math.floor(i * barWidth), fieldHeight, Math.ceil(barWidth) + 1, barsHeight);
    }
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(0, fieldHeight);
    ctx.lineTo(w, fieldHeight);
    ctx.stroke();

    // The ring and crosshair, slowly breathing.
    const radius = fieldHeight * (0.42 + Math.sin(time * 0.6) * 0.01);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(1.5, h / 320);
    ctx.beginPath();
    ctx.arc(w / 2, fieldHeight / 2, radius, 0, Math.PI * 2);
    ctx.moveTo(w / 2 - radius * 1.15, fieldHeight / 2);
    ctx.lineTo(w / 2 + radius * 1.15, fieldHeight / 2);
    ctx.moveTo(w / 2, fieldHeight / 2 - radius * 1.15);
    ctx.lineTo(w / 2, fieldHeight / 2 + radius * 1.15);
    ctx.stroke();
    ctx.globalAlpha = 1;

    this.version += 1;
  }

  private shape(
    ctx: CanvasRenderingContext2D,
    item: Cell,
    x: number,
    y: number,
    size: number,
    angle: number,
    brand: Palette["brand"],
    ink: string,
  ) {
    const color = brand[item.color];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.beginPath();
    switch (item.kind) {
      case "circle":
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "half":
        ctx.arc(0, size * 0.35, size, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        break;
      case "quarter":
        ctx.moveTo(-size * 0.7, size * 0.7);
        ctx.arc(-size * 0.7, size * 0.7, size * 1.4, -Math.PI / 2, 0);
        ctx.closePath();
        ctx.fill();
        break;
      case "triangle":
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.95, size * 0.75);
        ctx.lineTo(-size * 0.95, size * 0.75);
        ctx.closePath();
        ctx.fill();
        break;
      case "square":
        ctx.rect(-size * 0.78, -size * 0.78, size * 1.56, size * 1.56);
        ctx.fill();
        break;
      case "plus":
      case "x": {
        if (item.kind === "x") ctx.rotate(Math.PI / 4);
        const bar = size * 0.36;
        ctx.rect(-size, -bar / 2, size * 2, bar);
        ctx.rect(-bar / 2, -size, bar, size * 2);
        ctx.fillStyle = item.color === 1 ? ink : color;
        ctx.fill();
        break;
      }
      case "ring":
        ctx.lineWidth = size * 0.3;
        ctx.arc(0, 0, size * 0.82, 0, Math.PI * 2);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }
}
