import gsap from "gsap";
import {
  Color,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector4,
} from "three";

import type {
  ArticlesWorldApi,
  WorldFrame,
  WorldLayer,
} from "@/components/articles/world/world-api";
import { hexToUnit } from "@/components/articles/world/palette";

import { COVER_FRAGMENT, COVER_VERTEX, RIPPLE_SLOTS } from "./cover-shaders";
import { coverFit, loadCoverBitmap } from "./cover-texture";

/**
 * The article cover, drawn by the library world on its DOM frame: the
 * picture emerges from the sea (a wave front washes it into being) and
 * stays a sheet of water afterwards, swelling gently, rippling where the
 * pointer passes and splashing where it clicks (cover-shaders.ts).
 *
 * The DOM keeps the frame and its <img> (hidden once the world draws the
 * picture), so layout, the accessible name and the adaptive header's
 * sampling all still come from the DOM. The frame's live rect is read every
 * frame (after the smooth scroller has moved the page), so the sheet stays
 * glued to it even while a transition slides the article's content.
 *
 * Loaded with a dynamic import from the article page, only when the world
 * runs and the page scrolls through the smooth scroller (touch keeps the DOM
 * cover: against native scrolling a canvas trails the page by a frame).
 */

const SEGMENTS_X = 128;
const SEGMENTS_Y = 52;
const EMERGE_SECONDS = 2.5;
/** Pointer ripples: at most one per this many seconds, after this much travel (px). */
const RIPPLE_EVERY = 0.07;
const RIPPLE_TRAVEL = 22;
const HOVER_LIFT = 14;
const TILT = 0.02;

export type CoverLayerOptions = {
  frame: HTMLElement;
  url: string;
  /** The article theme's highlight, tinting the just-surfaced picture. */
  tint: { light: string; dark: string };
  /** The element whose opacity a transition fades (the article content). */
  content: HTMLElement | null;
};

export class ArticleCoverLayer implements WorldLayer {
  /** Resolves true once the picture is on the GPU, false if it can't be. */
  readonly ready: Promise<boolean>;

  private readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly geometry = new PlaneGeometry(1, 1, SEGMENTS_X, SEGMENTS_Y);
  private texture: Texture | null = null;
  private readonly ripples: Vector4[] = Array.from({ length: RIPPLE_SLOTS }, () => new Vector4());
  private nextRipple = 0;
  private clock = 0;
  private readonly state = { emerge: 0, lift: 0, opacity: 1 };
  private tilt = { x: 0, y: 0 };
  private pointer: { x: number; y: number; t: number; lastX: number; lastY: number } | null = null;
  private lastRippleAt = -1;
  private emergeTween: gsap.core.Tween | null = null;
  private liftTween: gsap.core.Tween | null = null;
  private readonly cleanups: (() => void)[] = [];
  private readonly tintLight = new Color();
  private readonly tintDark = new Color();
  private disposed = false;
  private radiusFor = -1;
  private removeLayer: (() => void) | null = null;

  constructor(
    private readonly world: ArticlesWorldApi,
    private readonly o: CoverLayerOptions,
  ) {
    this.tintLight.setRGB(...hexToUnit(o.tint.light));
    this.tintDark.setRGB(...hexToUnit(o.tint.dark));
    this.material = new ShaderMaterial({
      uniforms: {
        ...world.gl.uniforms,
        uRect: { value: new Vector4(0, 0, 1, 1) },
        uEmerge: { value: 0 },
        uClock: { value: 0 },
        uRipples: { value: this.ripples },
        uSwell: { value: 1 },
        uTilt: { value: new Vector2() },
        uLift: { value: 0 },
        uMap: { value: null as Texture | null },
        uHasMap: { value: 0 },
        uMapUv: { value: new Vector4(0, 0, 1, 1) },
        uRadius: { value: 20 },
        uOpacity: { value: 1 },
        uThemeTint: { value: new Color() },
        uSplit: { value: 0 },
      },
      vertexShader: COVER_VERTEX,
      fragmentShader: COVER_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 40;
    this.mesh.visible = false;
    world.gl.scene.add(this.mesh);

    const frame = o.frame;
    const onMove = (event: PointerEvent) => this.onPointerMove(event);
    const onLeave = () => this.onPointerLeave();
    const onDown = (event: PointerEvent) => this.onPointerDown(event);
    frame.addEventListener("pointermove", onMove);
    frame.addEventListener("pointerleave", onLeave);
    frame.addEventListener("pointerdown", onDown);
    this.cleanups.push(() => {
      frame.removeEventListener("pointermove", onMove);
      frame.removeEventListener("pointerleave", onLeave);
      frame.removeEventListener("pointerdown", onDown);
    });

    this.ready = this.load();
  }

  /** Adds the layer to the world (the page calls this once). */
  attach() {
    this.removeLayer = this.world.addLayer(this, 20);
  }

  /** Plays the emergence (from the sea, left to right); `instant` shows it settled. */
  emerge(instant = false) {
    this.emergeTween?.kill();
    if (instant) {
      this.state.emerge = 1;
      return;
    }
    this.state.emerge = 0;
    this.emergeTween = gsap.to(this.state, {
      emerge: 1,
      duration: EMERGE_SECONDS,
      ease: "power2.inOut",
    });
  }

  update(frame: WorldFrame) {
    if (this.disposed || !this.texture) return;
    this.clock += frame.dt;
    const rect = this.o.frame.getBoundingClientRect();
    const onScreen = rect.bottom > -120 && rect.top < frame.height + 120 && rect.width > 0;
    this.mesh.visible = onScreen;
    if (!onScreen) return;

    const u = this.material.uniforms;
    (u.uRect.value as Vector4).set(rect.left, rect.top, rect.width, rect.height);
    u.uClock.value = this.clock;
    u.uEmerge.value = this.state.emerge;
    u.uLift.value = this.state.lift;
    if (rect.width !== this.radiusFor) {
      // The corner radius follows the viewport (a clamp in detail.css).
      this.radiusFor = rect.width;
      u.uRadius.value = Number.parseFloat(getComputedStyle(this.o.frame).borderTopLeftRadius) || 0;
    }
    const dark = this.world.gl.uniforms.uDark.value;
    (u.uThemeTint.value as Color).copy(this.tintLight).lerp(this.tintDark, dark);

    // A transition fading the article fades the sheet with it.
    const content = this.o.content;
    const fade = content?.style.opacity ? Number.parseFloat(getComputedStyle(content).opacity) : 1;
    u.uOpacity.value = this.state.opacity * (Number.isFinite(fade) ? fade : 1);

    // Lean toward the pointer while it rests over the cover.
    const k = 1 - (1 - 0.08) ** (60 * frame.dt);
    let tx = 0;
    let ty = 0;
    if (this.pointer) {
      const nx = ((this.pointer.x - rect.left) / rect.width) * 2 - 1;
      const ny = ((this.pointer.y - rect.top) / rect.height) * 2 - 1;
      tx = ny * TILT;
      ty = nx * TILT;
    }
    this.tilt.x += (tx - this.tilt.x) * k;
    this.tilt.y += (ty - this.tilt.y) * k;
    (u.uTilt.value as Vector2).set(this.tilt.x, this.tilt.y);
    u.uSplit.value = Math.min(1, frame.pointerSpeed / 2400);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.emergeTween?.kill();
    this.liftTween?.kill();
    this.world.gl.scene.remove(this.mesh);
    this.material.dispose();
    this.geometry.dispose();
    this.texture?.dispose();
    this.texture = null;
    const remove = this.removeLayer;
    this.removeLayer = null;
    // The world's remover calls dispose() again (a no-op by now).
    remove?.();
  }

  // ---------------------------------------------------------------- internals

  private async load() {
    const rect = this.o.frame.getBoundingClientRect();
    const loaded = await loadCoverBitmap(
      this.o.url,
      rect.width || window.innerWidth,
      rect.height || window.innerWidth * 0.4,
      Math.min(window.devicePixelRatio || 1, 2),
      this.world.gl.renderer.capabilities.maxTextureSize,
    );
    if (!loaded || this.disposed) {
      loaded?.bitmap.close();
      return false;
    }
    const texture = new Texture(loaded.bitmap);
    texture.flipY = false;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = Math.min(4, this.world.gl.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    this.texture = texture;
    const u = this.material.uniforms;
    u.uMap.value = texture;
    u.uHasMap.value = 1;
    const [ox, oy, sx, sy] = coverFit(
      loaded.width,
      loaded.height,
      rect.width || 5,
      rect.height || 2,
    );
    (u.uMapUv.value as Vector4).set(ox, oy, sx, sy);
    // Upload now rather than on the first frame it shows (no hitch mid-emergence).
    this.world.gl.renderer.initTexture(texture);
    return true;
  }

  private addRipple(x: number, y: number, strength: number) {
    const rect = this.o.frame.getBoundingClientRect();
    const slot = this.ripples[this.nextRipple];
    this.nextRipple = (this.nextRipple + 1) % RIPPLE_SLOTS;
    slot.set(x - rect.left, y - rect.top, this.clock, strength);
  }

  private onPointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    if (!this.pointer) {
      this.pointer = {
        x: event.clientX,
        y: event.clientY,
        t: this.clock,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      this.hover(true);
      return;
    }
    const pointer = this.pointer;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const travel = Math.hypot(pointer.x - pointer.lastX, pointer.y - pointer.lastY);
    if (travel < RIPPLE_TRAVEL || this.clock - this.lastRippleAt < RIPPLE_EVERY) return;
    const speed = travel / Math.max(1 / 60, this.clock - pointer.t);
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;
    pointer.t = this.clock;
    this.lastRippleAt = this.clock;
    this.addRipple(pointer.x, pointer.y, Math.min(1, 0.28 + speed / 2600));
  }

  private onPointerLeave() {
    this.pointer = null;
    this.hover(false);
  }

  private onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    // A splash: a strong ring, a second one a beat later, and a pulse of light.
    this.addRipple(event.clientX, event.clientY, 2.1);
    const x = event.clientX;
    const y = event.clientY;
    const echo = window.setTimeout(() => {
      if (!this.disposed) this.addRipple(x, y, 0.9);
    }, 140);
    this.cleanups.push(() => window.clearTimeout(echo));
    this.world.fx.pulse(x, y, 0.6);
  }

  private hover(on: boolean) {
    this.liftTween?.kill();
    this.liftTween = gsap.to(this.state, {
      lift: on ? HOVER_LIFT : 0,
      duration: on ? 0.6 : 0.8,
      ease: "power2.out",
    });
  }
}
