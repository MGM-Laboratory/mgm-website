import gsap from "gsap";
import {
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector4,
  type Group,
  type WebGLRenderer,
} from "three";

import { CARD_FRAGMENT, CARD_VERTEX } from "@/components/articles/world/cards/card-shaders";
import {
  coverUv,
  drawTextStrip,
  loadCover,
  measureTextStrip,
  type TextStripLayout,
} from "@/components/articles/world/cards/card-textures";
import { WORLD_PALETTE } from "@/components/articles/world/palette";
import type { CardsLayerApi, WorldCard } from "@/components/articles/world/world-api";
import type { WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The list's cards, drawn by the world on top of their DOM frames.
 *
 * Every card the list registers keeps its DOM `<a>` (links, focus, screen
 * readers, find-in-page); the world draws the picture and the text strip
 * where the DOM frames rest, then bends them (card-shaders.ts). Only cards
 * near the viewport own GPU resources: a card gets its meshes and starts
 * decoding its cover once it comes within `WAKE` viewports of the screen,
 * and gives everything back once it is `SLEEP` viewports away, so a list of
 * two hundred articles costs about as much as the dozen near the screen.
 *
 * DOM offsets are cached (document space) and re-measured on resize, font
 * load and list changes, never per frame; each frame only subtracts the
 * live scroll position.
 */

/** Viewports above/below the screen where a card is woken (meshes, textures). */
const WAKE_ABOVE = 1.2;
const WAKE_BELOW = 2.4;
/** Beyond these it is put to sleep again (hysteresis against thrashing). */
const SLEEP_ABOVE = 2.2;
const SLEEP_BELOW = 3.6;

const HOVER_ZOOM = 1.1;
const RIPPLE = 24;
const SEGMENTS = 16;

type Rect = { left: number; top: number; width: number; height: number };

type CardState = {
  inner: number;
  hover: number;
  lift: number;
  opacity: number;
  reveal: number;
  tiltX: number;
  tiltY: number;
};

type Entry = {
  card: WorldCard;
  cover: Rect;
  meta: Rect;
  layout: TextStripLayout | null;
  awake: boolean;
  image?: Mesh;
  text?: Mesh;
  imageMaterial?: ShaderMaterial;
  textMaterial?: ShaderMaterial;
  coverTexture?: Texture;
  textTexture?: CanvasTexture;
  textCanvas?: HTMLCanvasElement;
  loadToken: number;
  state: CardState;
  hoverTween?: gsap.core.Tween;
  titleRoll: number;
  titleRollDrawn: number;
};

type FoldZones = { push: [number, number]; pull: [number, number] };

/** Fold zones (CSS px above the viewport centre) by layout, after unseen's bend points. */
function foldZones(width: number, height: number): FoldZones {
  if (width >= 1024) {
    return { push: [0.182 * height, 1.273 * height], pull: [0.2 * height, 0.891 * height] };
  }
  if (width >= 768) return { push: [200, 1000], pull: [220, 700] };
  return { push: [200, 1200], pull: [220, 840] };
}

function docRect(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

export type CardsLayerOptions = {
  group: Group;
  renderer: WebGLRenderer;
  world: WorldUniforms;
  pixelRatio: () => number;
  viewport: () => { width: number; height: number };
};

export class CardsLayer implements CardsLayerApi {
  private readonly entries = new Map<string, Entry>();
  private readonly geometry = new PlaneGeometry(1, 1, SEGMENTS, SEGMENTS);
  private readonly paperLight = new Color(WORLD_PALETTE.light.paper);
  private readonly paperDark = new Color(WORLD_PALETTE.dark.paper);
  private readonly inkLight = new Color(WORLD_PALETTE.light.ink);
  private readonly inkDark = new Color(WORLD_PALETTE.dark.ink);
  private readonly softLight = new Color(WORLD_PALETTE.light.inkSoft);
  private readonly softDark = new Color(WORLD_PALETTE.dark.inkSoft);
  private visible = true;
  private holds = 0;
  private heldScroll = 0;
  /** Cards whose DOM went while a hold was active: drawn until the hold ends. */
  private readonly orphans = new Set<Entry>();
  private lastScroll = 0;
  private hovered: string | null = null;
  private measureQueued = false;
  private readonly resizeObserver: ResizeObserver;
  private disposed = false;

  constructor(private readonly options: CardsLayerOptions) {
    this.resizeObserver = new ResizeObserver(() => this.queueMeasure());
    this.resizeObserver.observe(document.body);
    window.addEventListener("resize", this.queueMeasure);
    void document.fonts?.ready.then(() => this.queueMeasure());
  }

  register(card: WorldCard) {
    const existing = this.entries.get(card.slug);
    if (existing) this.sleep(existing);
    const entry: Entry = {
      card,
      cover: docRect(card.cover),
      meta: docRect(card.meta),
      layout: null,
      awake: false,
      loadToken: 0,
      state: { inner: 1, hover: 0, lift: 0, opacity: 1, reveal: 0, tiltX: 0, tiltY: 0 },
      titleRoll: 0,
      titleRollDrawn: 0,
    };
    this.entries.set(card.slug, entry);
    return () => {
      if (this.entries.get(card.slug) !== entry) return;
      this.entries.delete(card.slug);
      if (this.holds > 0) this.orphans.add(entry);
      else this.sleep(entry);
    };
  }

  hold() {
    if (this.holds === 0) this.heldScroll = this.lastScroll;
    this.holds += 1;
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      this.holds -= 1;
      if (this.holds > 0) return;
      for (const entry of this.orphans) this.sleep(entry);
      this.orphans.clear();
    };
  }

  rectOf(slug: string) {
    const entry =
      this.entries.get(slug) ?? [...this.orphans].find((item) => item.card.slug === slug);
    if (!entry) return null;
    const scroll = this.holds > 0 ? this.heldScroll : this.lastScroll;
    return new DOMRect(
      entry.cover.left,
      entry.cover.top - scroll,
      entry.cover.width,
      entry.cover.height,
    );
  }

  setHovered(slug: string | null) {
    if (this.hovered === slug) return;
    const previous = this.hovered ? this.entries.get(this.hovered) : undefined;
    this.hovered = slug;
    if (previous) this.animateHover(previous, false);
    const next = slug ? this.entries.get(slug) : undefined;
    if (next) this.animateHover(next, true);
  }

  measure() {
    // Held cards keep the rects they had: their DOM may be gone or moving.
    if (this.holds > 0) return;
    for (const entry of this.entries.values()) {
      entry.cover = docRect(entry.card.cover);
      entry.meta = docRect(entry.card.meta);
      if (entry.awake) this.redrawText(entry);
    }
  }

  async playFilterOut() {
    // Filled in by the list's filter choreography (cards sink back and fade).
    const awake = [...this.entries.values()].filter((entry) => entry.awake);
    await Promise.all(
      awake.map(
        (entry, index) =>
          new Promise<void>((resolve) => {
            gsap.to(entry.state, {
              lift: -200,
              opacity: 0,
              duration: 0.5,
              delay: index * 0.035,
              ease: "power2.out",
              onComplete: resolve,
            });
          }),
      ),
    );
  }

  playFilterIn() {
    const awake = [...this.entries.values()]
      .filter((entry) => entry.awake)
      .sort((a, b) => a.card.index - b.card.index);
    awake.forEach((entry, index) => {
      gsap.fromTo(
        entry.state,
        { lift: 200, opacity: 0 },
        { lift: 0, opacity: 1, duration: 0.5, delay: index * 0.035, ease: "power2.out" },
      );
    });
  }

  playIntro() {
    this.playFilterIn();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    for (const entry of this.entries.values()) {
      if (entry.image) entry.image.visible = visible;
      if (entry.text) entry.text.visible = visible;
    }
  }

  /** Per frame, after the scroll step: wake, sleep and place every card. */
  update(liveScrollY: number) {
    if (this.disposed) return;
    this.lastScroll = liveScrollY;
    // While held (a transition carries the list away), the cards stay where
    // they were, whatever the page underneath does with its scroll.
    const scrollY = this.holds > 0 ? this.heldScroll : liveScrollY;
    if (this.measureQueued && this.holds === 0) {
      this.measureQueued = false;
      this.measure();
    }
    const { width, height } = this.options.viewport();
    const zones = foldZones(width, height);
    for (const entry of this.orphans) this.place(entry, scrollY, zones);
    for (const entry of this.entries.values()) {
      const top = entry.cover.top - scrollY;
      const bottom = entry.meta.top + entry.meta.height - scrollY;
      if (!entry.awake) {
        if (bottom > -WAKE_ABOVE * height && top < (1 + WAKE_BELOW) * height) this.wake(entry);
        else continue;
      } else if (bottom < -SLEEP_ABOVE * height || top > (1 + SLEEP_BELOW) * height) {
        this.sleep(entry);
        continue;
      }
      this.place(entry, scrollY, zones);
    }
  }

  dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.queueMeasure);
    for (const entry of this.entries.values()) this.sleep(entry);
    for (const entry of this.orphans) this.sleep(entry);
    this.entries.clear();
    this.orphans.clear();
    this.geometry.dispose();
  }

  // ---------------------------------------------------------------- internals

  private readonly queueMeasure = () => {
    this.measureQueued = true;
  };

  private material(isText: boolean) {
    const { world } = this.options;
    return new ShaderMaterial({
      uniforms: {
        ...world,
        uMap: { value: null as Texture | null },
        uHasMap: { value: 0 },
        uIsText: { value: isText ? 1 : 0 },
        uMapUv: { value: new Vector4(0, 0, 1, 1) },
        uInner: { value: 1 },
        uOpacity: { value: 1 },
        uReveal: { value: 0 },
        uRect: { value: new Vector4() },
        uFold: { value: new Vector4() },
        uPull: { value: 0 },
        uRipple: { value: RIPPLE },
        uLift: { value: 0 },
        uTilt: { value: new Vector2() },
        uPivot: { value: new Vector2() },
        uHover: { value: 0 },
        uPaperLight: { value: this.paperLight },
        uPaperDark: { value: this.paperDark },
        uInkLight: { value: this.inkLight },
        uInkDark: { value: this.inkDark },
        uInkSoftLight: { value: this.softLight },
        uInkSoftDark: { value: this.softDark },
      },
      vertexShader: CARD_VERTEX,
      fragmentShader: CARD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      forceSinglePass: true,
    });
  }

  private wake(entry: Entry) {
    entry.awake = true;
    const imageMaterial = this.material(false);
    const textMaterial = this.material(true);
    const image = new Mesh(this.geometry, imageMaterial);
    const text = new Mesh(this.geometry, textMaterial);
    image.frustumCulled = false;
    text.frustumCulled = false;
    image.renderOrder = 10 + entry.card.index * 2;
    text.renderOrder = 11 + entry.card.index * 2;
    image.visible = this.visible;
    text.visible = this.visible;
    this.options.group.add(image, text);
    Object.assign(entry, { image, text, imageMaterial, textMaterial });
    this.redrawText(entry);
    void this.loadCover(entry);
  }

  private sleep(entry: Entry) {
    if (!entry.awake) return;
    entry.awake = false;
    entry.loadToken += 1;
    entry.hoverTween?.kill();
    if (entry.image) this.options.group.remove(entry.image);
    if (entry.text) this.options.group.remove(entry.text);
    entry.imageMaterial?.dispose();
    entry.textMaterial?.dispose();
    entry.coverTexture?.dispose();
    entry.textTexture?.dispose();
    entry.image = entry.text = undefined;
    entry.imageMaterial = entry.textMaterial = undefined;
    entry.coverTexture = entry.textTexture = undefined;
    entry.textCanvas = undefined;
    entry.state.reveal = 0;
  }

  private async loadCover(entry: Entry) {
    const url = entry.card.coverUrl;
    const material = entry.imageMaterial;
    if (!url || !material) return;
    const token = entry.loadToken;
    const { renderer } = this.options;
    const loaded = await loadCover(
      url,
      entry.cover.width,
      entry.cover.height,
      this.options.pixelRatio(),
      renderer.capabilities.maxTextureSize,
    );
    if (!loaded || token !== entry.loadToken || !entry.awake || this.disposed) {
      loaded?.bitmap.close();
      return;
    }
    const texture = new Texture(loaded.bitmap);
    texture.flipY = false;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    entry.coverTexture = texture;
    material.uniforms.uMap.value = texture;
    material.uniforms.uHasMap.value = 1;
    const [ox, oy, sx, sy] = coverUv(
      loaded.width,
      loaded.height,
      entry.cover.width,
      entry.cover.height,
    );
    (material.uniforms.uMapUv.value as Vector4).set(ox, oy, sx, sy);
    gsap.to(entry.state, { reveal: 1, duration: 0.6, ease: "power2.out" });
  }

  private redrawText(entry: Entry) {
    const material = entry.textMaterial;
    if (!material) return;
    const { card } = entry;
    entry.layout = measureTextStrip(
      card.meta,
      card.titleElement,
      card.subtitleElement,
      card.arrowElement,
    );
    entry.textCanvas ??= document.createElement("canvas");
    drawTextStrip(
      entry.textCanvas,
      entry.layout,
      { title: card.titleElement, subtitle: card.subtitleElement },
      { title: card.title, subtitle: card.subtitle },
      Math.min(this.options.pixelRatio() * 1.25, 2.5),
      entry.titleRoll,
    );
    entry.titleRollDrawn = entry.titleRoll;
    if (!entry.textTexture) {
      const texture = new CanvasTexture(entry.textCanvas);
      texture.flipY = false;
      texture.generateMipmaps = false;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.premultiplyAlpha = false;
      entry.textTexture = texture;
      material.uniforms.uMap.value = texture;
      material.uniforms.uHasMap.value = 1;
    }
    entry.textTexture.needsUpdate = true;
  }

  private animateHover(entry: Entry, on: boolean) {
    entry.hoverTween?.kill();
    entry.hoverTween = gsap.to(entry.state, {
      inner: on ? HOVER_ZOOM : 1,
      hover: on ? 1 : 0,
      duration: on ? 0.3 : 0.45,
      ease: "power2.out",
    });
    gsap.to(entry, {
      titleRoll: on ? 1 : 0,
      duration: on ? 0.55 : 0.4,
      ease: "power3.inOut",
    });
  }

  private place(entry: Entry, scrollY: number, zones: FoldZones) {
    const { image, text, imageMaterial, textMaterial } = entry;
    if (!image || !text || !imageMaterial || !textMaterial) return;
    const { width, height } = this.options.viewport();
    const s = entry.state;
    if (Math.abs(entry.titleRoll - entry.titleRollDrawn) > 0.002) this.redrawText(entry);

    const cover = entry.cover;
    const meta = entry.meta;
    const pivotX = cover.left + cover.width / 2 - width / 2;
    const pivotY = height / 2 - (cover.top - scrollY + (meta.top + meta.height - cover.top) / 2);
    for (const [material, rect] of [
      [imageMaterial, cover],
      [textMaterial, meta],
    ] as const) {
      const u = material.uniforms;
      (u.uRect.value as Vector4).set(rect.left, rect.top - scrollY, rect.width, rect.height);
      (u.uFold.value as Vector4).set(zones.push[0], zones.push[1], zones.pull[0], zones.pull[1]);
      u.uPull.value = cover.height;
      u.uLift.value = s.lift;
      u.uOpacity.value = s.opacity;
      (u.uTilt.value as Vector2).set(s.tiltX, s.tiltY);
      (u.uPivot.value as Vector2).set(pivotX, pivotY);
      u.uHover.value = s.hover;
    }
    imageMaterial.uniforms.uInner.value = s.inner;
    imageMaterial.uniforms.uReveal.value = s.reveal;
  }
}
