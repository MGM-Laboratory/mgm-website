import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";

import type { StoryScheme } from "@/components/story/engine/act";
import { pageFonts, type FrontFonts } from "@/components/story/acts/cards/card-front";

/**
 * The link under a card in its closer look ("See our website work"), drawn
 * in the stage so it moves and scales with the card it belongs to; a real
 * link (an overlay hotspot) sits over it for the pointer, the keyboard and
 * screen readers. A pill in the page's ink (white on the dark page) with an
 * arrow; on hover or focus it fills with the card's colour and the arrow
 * steps forward. Its colours are written as they are (no tone mapping), so
 * they match the page's own.
 */

const W = 640;
const H = 136;
/** The pill's height on screen, CSS px. */
export const PILL_HEIGHT_PX = 48;
export const PILL_ASPECT = W / H;

export class CardPill {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private readonly g: CanvasRenderingContext2D | null;
  private fonts: FrontFonts;
  private key = "";

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext("2d");
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    const material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    material.name = "cards-pill";
    this.mesh = new Mesh(new PlaneGeometry(PILL_ASPECT, 1), material);
    this.mesh.name = "cards-pill";
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    this.fonts = pageFonts();
  }

  refreshFonts() {
    this.fonts = pageFonts();
    this.key = "";
  }

  /**
   * Draws the pill (only when something changed). `hover` 0..1 fills it with
   * `accent` and steps the arrow forward; `ink` is the page's ink, `paper`
   * the page.
   */
  draw(text: string, accent: string, hover: number, scheme: StoryScheme) {
    const h = Math.round(hover * 40) / 40;
    const key = `${text}|${accent}|${h}|${scheme}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.g;
    if (!g) return;
    const dark = scheme === "dark";
    const base = dark ? "#f7f7f5" : "#0e1116";
    const label = dark ? "#0e1116" : "#ffffff";
    g.clearRect(0, 0, W, H);
    const pad = 6;
    const r = (H - pad * 2) / 2;
    g.beginPath();
    g.roundRect(pad, pad, W - pad * 2, H - pad * 2, r);
    g.fillStyle = base;
    g.fill();
    // The accent fills in from the left as a hover grows.
    if (h > 0) {
      g.save();
      g.clip();
      g.fillStyle = accent;
      g.fillRect(pad, pad, (W - pad * 2) * h, H - pad * 2);
      g.restore();
    }
    const yellow = accent.toLowerCase() === "#f7bf33";
    g.fillStyle = h > 0.5 && yellow ? "#0e1116" : label;
    g.font = `500 44px ${this.fonts.sans}`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    const textW = g.measureText(text).width;
    const arrowW = 44;
    const gap = 22;
    const x0 = (W - (textW + gap + arrowW)) / 2;
    g.fillText(text, x0, H / 2 + 2);
    // The arrow, drawn as strokes so it never depends on a glyph.
    const ax = x0 + textW + gap + h * 10;
    g.strokeStyle = g.fillStyle;
    g.lineWidth = 5;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(ax, H / 2);
    g.lineTo(ax + arrowW, H / 2);
    g.moveTo(ax + arrowW - 15, H / 2 - 15);
    g.lineTo(ax + arrowW, H / 2);
    g.lineTo(ax + arrowW - 15, H / 2 + 15);
    g.stroke();
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
