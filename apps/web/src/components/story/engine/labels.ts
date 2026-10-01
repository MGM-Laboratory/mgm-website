import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial } from "three";

import type { StoryLabel, StoryLabelFactory } from "@/components/story/engine/act";

/**
 * Camera-facing text sprites drawn with the page's own display font
 * (`--font-hanken`). The placeholder acts name their beats with them; real
 * acts may use them for dev overlays. Registered as the `labels` prop.
 */

const PX = 96;

function displayFont() {
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-hanken")
    .trim();
  return `600 ${PX}px ${family || "system-ui"}, system-ui, sans-serif`;
}

class Label implements StoryLabel {
  readonly object: Sprite;
  private readonly canvas = document.createElement("canvas");
  private readonly texture: CanvasTexture;
  private readonly material: SpriteMaterial;
  private text = "";

  constructor(
    private readonly height: number,
    private readonly color: string,
    private readonly background: string | null,
  ) {
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.material = new SpriteMaterial({ map: this.texture, transparent: true, toneMapped: false });
    this.object = new Sprite(this.material);
    this.setText(" ");
  }

  setText(text: string) {
    if (text === this.text) return;
    this.text = text;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const font = displayFont();
    context.font = font;
    const pad = PX * 0.45;
    const width = Math.ceil(context.measureText(text).width + pad * 2);
    const height = Math.ceil(PX * 1.5);
    const w = Math.max(2, width);
    if (w !== this.canvas.width || height !== this.canvas.height) {
      // The GPU copy has a fixed size: a new size needs a new allocation.
      this.canvas.width = w;
      this.canvas.height = height;
      this.texture.dispose();
    }
    context.font = font;
    context.clearRect(0, 0, w, height);
    if (this.background) {
      context.fillStyle = this.background;
      const r = height / 2;
      context.beginPath();
      context.roundRect(0, 0, w, height, r);
      context.fill();
    }
    context.fillStyle = this.color;
    context.textBaseline = "middle";
    context.fillText(text, pad, height / 2 + PX * 0.04);
    this.texture.needsUpdate = true;
    this.object.scale.set((this.height * w) / height, this.height, 1);
  }

  dispose() {
    this.texture.dispose();
    this.material.dispose();
  }
}

export const storyLabels: StoryLabelFactory = {
  create(options = {}) {
    return new Label(
      options.height ?? 0.02,
      options.color ?? "#0e1116",
      options.background ?? null,
    );
  },
};
