import gsap from "gsap";
import {
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Shape,
  Vector2,
  Vector3,
  type Texture,
} from "three";

import {
  GLOW_FRAGMENT,
  GLOW_VERTEX,
  MOTE_FRAGMENT,
  MOTE_VERTEX,
  PILL_FRAGMENT,
  PILL_VERTEX,
} from "@/components/articles/world/home/home-shaders";
import { WORLD_PALETTE } from "@/components/articles/world/palette";
import type {
  ArticlesWorldApi,
  WorldFrame,
  WorldLayer,
} from "@/components/articles/world/world-api";
import { isArticleTransitionBusy } from "@/lib/article-transition";
import { isRouteCoverActive } from "@/lib/route-reveal";

/**
 * The end of the list's big floating Home button, drawn by the world
 * exactly over the real `<a data-articles-home>` (articles-end.tsx), which
 * keeps the keyboard, the screen reader and the pointer.
 *
 * A thick glossy pill with a house and "Home" on its face, in the world's
 * overlay scene (after the screen pass, so its label stays crisp and the
 * lens never shifts it off its link). It surfaces out of the depth the
 * first time it comes into view, then bobs; it tilts toward the cursor and
 * leans after it when the cursor comes near (magnetic); hovering (or
 * keyboard focus) makes it glow while paper motes orbit it; pressing
 * squashes it; a click bursts it into light and flings the motes away
 * (the portal then carries the visitor home). While a transition covers
 * the page it steps back into the fog, since the overlay is drawn above
 * the transition's wipe.
 */

const MOTES = 18;
/** Pointer distance (CSS px from the pill's centre) within which the pill is drawn to it. */
const MAGNET_RADIUS = 260;
const MAGNET_PULL = 0.16;
const TILT_X = 0.32;
const TILT_Y = 0.42;
const HOUSE = new Path2D(
  "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
);

function ease(k: number, dt: number) {
  return 1 - (1 - k) ** (60 * dt);
}

type Size = { width: number; height: number };

function pillGeometry(size: Size) {
  const bevel = size.height * 0.16;
  const w = Math.max(10, size.width - bevel * 2);
  const h = Math.max(10, size.height - bevel * 2);
  const r = h / 2;
  const shape = new Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.absarc(-w / 2 + r, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  const geometry = new ExtrudeGeometry(shape, {
    depth: size.height * 0.34,
    bevelEnabled: true,
    bevelThickness: size.height * 0.2,
    bevelSize: bevel,
    bevelSegments: 12,
    curveSegments: 40,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

export class HomeLayer implements WorldLayer {
  private readonly group = new Group();
  private readonly pill: Mesh;
  private readonly glow: Mesh;
  private readonly motes: InstancedMesh;
  private readonly pillMaterial: ShaderMaterial;
  private readonly glowMaterial: ShaderMaterial;
  private readonly moteMaterial: ShaderMaterial;
  private label: Texture | null = null;
  private size: Size = { width: 0, height: 0 };
  private rect = { left: 0, top: 0, width: 0, height: 0 };
  private readonly state = {
    appear: 0,
    hover: 0,
    squashX: 1,
    squashY: 1,
    flash: 0,
    burst: 0,
    visible: 1,
  };
  private readonly tilt = new Vector2();
  private readonly magnet = new Vector2();
  private readonly cursor = new Vector3();
  private cursorOn = 0;
  private hovered = false;
  private focused = false;
  private burstAt = -1;
  private time = 0;
  private appeared = false;
  private measureQueued = true;
  private readonly observer: ResizeObserver;
  private readonly visibility: IntersectionObserver;
  private readonly tweens = new Set<gsap.core.Tween>();
  private disposed = false;

  constructor(
    private readonly world: ArticlesWorldApi,
    private readonly anchor: HTMLElement,
  ) {
    const uniforms = world.gl.uniforms;
    const light = WORLD_PALETTE.light;
    const dark = WORLD_PALETTE.dark;
    this.pillMaterial = new ShaderMaterial({
      uniforms: {
        ...uniforms,
        uHomeLabel: { value: null as Texture | null },
        uHomeHasLabel: { value: 0 },
        uHomeSize: { value: new Vector2(1, 1) },
        uHomeHover: { value: 0 },
        uHomeFlash: { value: 0 },
        uHomeOpacity: { value: 0 },
        uHomeCursor: { value: new Vector3(-400, 500, 600) },
        uHomeCursorOn: { value: 0 },
        uHomeBodyLight: { value: new Color("#0B0D12") },
        uHomeBodyDark: { value: new Color("#E9EBF1") },
        uHomeInkLight: { value: new Color(light.fog) },
        uHomeInkDark: { value: new Color(dark.fog) },
        uHomeRimLight: { value: new Color(light.accent) },
        uHomeRimDark: { value: new Color(dark.accent) },
      },
      vertexShader: PILL_VERTEX,
      fragmentShader: PILL_FRAGMENT,
      transparent: true,
    });
    this.glowMaterial = new ShaderMaterial({
      uniforms: {
        ...uniforms,
        uHomeGlow: { value: 0 },
        uHomeGlowLight: { value: new Color(light.ember) },
        uHomeGlowDark: { value: new Color(dark.accent) },
      },
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.moteMaterial = new ShaderMaterial({
      uniforms: {
        ...uniforms,
        uHomeRing: { value: new Vector3(1, 1, 1) },
        uHomeMotes: { value: 0 },
        uHomeBurst: { value: 0 },
        uHomeMoteLight: { value: new Color("#D9CFB8") },
        uHomeMoteDark: { value: new Color(dark.mote) },
      },
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });

    this.pill = new Mesh(pillGeometry({ width: 240, height: 88 }), this.pillMaterial);
    this.glow = new Mesh(new PlaneGeometry(1, 1), this.glowMaterial);
    const moteGeometry = new PlaneGeometry(1, 1);
    const seeds = new Float32Array(MOTES * 4);
    // A fixed-seed spread (never Math.random): the same ring every visit.
    let seed = 0x2f6b3c1d;
    const next = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < MOTES; i += 1) {
      seeds.set([i / MOTES + next() * 0.04, next(), next(), next()], i * 4);
    }
    moteGeometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 4));
    this.motes = new InstancedMesh(moteGeometry, this.moteMaterial, MOTES);
    const identity = new Matrix4();
    for (let i = 0; i < MOTES; i += 1) this.motes.setMatrixAt(i, identity);
    for (const mesh of [this.pill, this.glow, this.motes]) mesh.frustumCulled = false;
    this.glow.renderOrder = 1;
    this.pill.renderOrder = 2;
    this.motes.renderOrder = 3;
    this.group.add(this.glow, this.pill, this.motes);
    this.group.visible = false;
    world.gl.overlay.add(this.group);

    anchor.addEventListener("pointerenter", this.onEnter);
    anchor.addEventListener("pointerleave", this.onLeave);
    anchor.addEventListener("focus", this.onFocus);
    anchor.addEventListener("blur", this.onBlur);
    anchor.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    anchor.addEventListener("click", this.onClick);
    this.observer = new ResizeObserver(() => {
      this.measureQueued = true;
    });
    this.observer.observe(anchor);
    this.observer.observe(document.body);
    this.visibility = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0.2))
          this.surface();
      },
      { threshold: [0, 0.2, 0.5] },
    );
    this.visibility.observe(anchor);
    void this.drawLabel();
  }

  update(frame: WorldFrame) {
    if (this.disposed) return;
    const dt = frame.dt;
    this.time += dt;
    if (this.measureQueued) this.measure(frame.scrollY);

    const s = this.state;
    const width = this.rect.width;
    const height = this.rect.height;
    const cx = this.rect.left + width / 2;
    const cy = this.rect.top - frame.scrollY + height / 2;

    // Magnet and tilt toward the cursor.
    let pullX = 0;
    let pullY = 0;
    let tiltX = 0;
    let tiltY = 0;
    const pointer = frame.pointer;
    if (pointer) {
      const dx = pointer.x - cx;
      const dy = pointer.y - cy;
      const distance = Math.hypot(dx, dy);
      const reach = MAGNET_RADIUS + width * 0.35;
      const near = Math.max(0, 1 - distance / reach);
      const strength = near * near * (3 - 2 * near);
      pullX = dx * MAGNET_PULL * strength;
      pullY = dy * MAGNET_PULL * strength;
      tiltY = Math.max(-1, Math.min(1, dx / reach)) * TILT_Y * Math.max(strength, 0.25);
      tiltX = Math.max(-1, Math.min(1, dy / reach)) * TILT_X * Math.max(strength, 0.25);
      // The cursor as a small light a little in front of the page.
      this.cursor
        .set(pointer.x - frame.width / 2, frame.height / 2 - pointer.y, height * 2.2)
        .applyMatrix4(this.world.gl.camera.matrixWorldInverse);
    }
    this.cursorOn += ((pointer ? 1 : 0) - this.cursorOn) * ease(0.1, dt);
    const k = ease(0.1, dt);
    this.magnet.x += (pullX - this.magnet.x) * k;
    this.magnet.y += (pullY - this.magnet.y) * k;
    this.tilt.x += (tiltX - this.tilt.x) * ease(0.07, dt);
    this.tilt.y += (tiltY - this.tilt.y) * ease(0.07, dt);

    // Step back into the fog while a transition covers the page (the
    // overlay is drawn above its wipe), except for the click's own burst.
    const covered =
      (isArticleTransitionBusy() || isRouteCoverActive()) &&
      (this.burstAt < 0 || this.time - this.burstAt > 0.45);
    s.visible += ((covered ? 0 : 1) - s.visible) * ease(covered ? 0.2 : 0.08, dt);

    const t = this.time;
    const bob = Math.sin(t * 1.25) * 7 * s.appear;
    const x = cx + this.magnet.x - frame.width / 2;
    const y = frame.height / 2 - (cy + this.magnet.y) + bob;
    const depth = (1 - s.appear) * -620;
    this.group.position.set(x, y, depth);
    const hoverScale = 1 + s.hover * 0.06 + s.flash * 0.12;
    const appearScale = 0.72 + 0.28 * s.appear;
    this.pill.scale.set(
      s.squashX * hoverScale * appearScale,
      s.squashY * hoverScale * appearScale,
      (2 - s.squashX) * hoverScale * appearScale,
    );
    this.pill.rotation.set(
      this.tilt.x + Math.sin(t * 0.95) * 0.05 + (1 - s.appear) * -0.7,
      this.tilt.y + Math.sin(t * 0.7 + 1.3) * 0.06,
      Math.sin(t * 0.8) * 0.03,
    );
    this.glow.position.set(0, -height * 0.05, -height * 0.7);
    this.glow.scale.set(width * 2.4, height * 3.4, 1);
    this.motes.rotation.set(0.28, 0, -0.12);

    const opacity = s.appear * s.visible;
    this.group.visible = opacity > 0.002;
    const pu = this.pillMaterial.uniforms;
    pu.uHomeOpacity.value = opacity;
    pu.uHomeHover.value = s.hover;
    pu.uHomeFlash.value = s.flash;
    (pu.uHomeCursor.value as Vector3).copy(this.cursor);
    pu.uHomeCursorOn.value = this.cursorOn;
    this.glowMaterial.uniforms.uHomeGlow.value = (0.25 + s.hover * 0.75 + s.flash) * opacity;
    const mu = this.moteMaterial.uniforms;
    (mu.uHomeRing.value as Vector3).set(width * 0.66, height * 1.05, height * 1.2);
    mu.uHomeMotes.value = s.hover * opacity;
    mu.uHomeBurst.value = s.burst;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const tween of this.tweens) tween.kill();
    this.tweens.clear();
    this.anchor.removeEventListener("pointerenter", this.onEnter);
    this.anchor.removeEventListener("pointerleave", this.onLeave);
    this.anchor.removeEventListener("focus", this.onFocus);
    this.anchor.removeEventListener("blur", this.onBlur);
    this.anchor.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    this.anchor.removeEventListener("click", this.onClick);
    this.observer.disconnect();
    this.visibility.disconnect();
    this.world.gl.overlay.remove(this.group);
    this.pill.geometry.dispose();
    this.glow.geometry.dispose();
    this.motes.geometry.dispose();
    this.motes.dispose();
    this.pillMaterial.dispose();
    this.glowMaterial.dispose();
    this.moteMaterial.dispose();
    this.label?.dispose();
  }

  // ---------------------------------------------------------------- internals

  private tween(vars: gsap.TweenVars) {
    const tween = gsap.to(this.state, {
      ...vars,
      onComplete: () => {
        this.tweens.delete(tween);
      },
    });
    this.tweens.add(tween);
    return tween;
  }

  private measure(scrollY: number) {
    this.measureQueued = false;
    const rect = this.anchor.getBoundingClientRect();
    this.rect = {
      left: rect.left,
      top: rect.top + scrollY,
      width: rect.width,
      height: rect.height,
    };
    if (
      Math.abs(rect.width - this.size.width) > 0.5 ||
      Math.abs(rect.height - this.size.height) > 0.5
    ) {
      this.size = { width: rect.width, height: rect.height };
      this.pill.geometry.dispose();
      this.pill.geometry = pillGeometry(this.size);
      (this.pillMaterial.uniforms.uHomeSize.value as Vector2).set(rect.width, rect.height);
      void this.drawLabel();
    }
  }

  /** The label: a house and "Home" in the display face, as an alpha mask the shader inks. */
  private async drawLabel() {
    const face = this.anchor.querySelector<HTMLElement>(".articles-home-label") ?? this.anchor;
    const family = getComputedStyle(face).fontFamily;
    const { width, height } = this.size.width ? this.size : { width: 240, height: 88 };
    const fontSize = Math.round(height * 0.34);
    const font = `500 ${fontSize}px ${family}`;
    try {
      await Promise.race([
        document.fonts.load(font),
        new Promise((resolve) => window.setTimeout(resolve, 2000)),
      ]);
    } catch {
      // Draw in whatever face is there.
    }
    if (this.disposed) return;
    const ratio = Math.min(3, Math.max(2, window.devicePixelRatio * 1.5));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#ffffff";
    context.font = font;
    context.textBaseline = "alphabetic";
    if ("letterSpacing" in context) {
      (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "-0.02em";
    }
    const text = "Home";
    const metrics = context.measureText(text);
    const icon = height * 0.33;
    const gap = height * 0.14;
    const total = icon + gap + metrics.width;
    const left = (width - total) / 2;
    const ascent = metrics.actualBoundingBoxAscent;
    const baseline = height / 2 + ascent / 2;
    context.fillText(text, left + icon + gap, baseline);
    context.save();
    context.translate(left, height / 2 - icon / 2 - height * 0.01);
    context.scale(icon / 24, icon / 24);
    context.lineWidth = 2.25;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke(HOUSE);
    context.restore();

    const texture = new CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = Math.min(8, this.world.gl.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    this.label?.dispose();
    this.label = texture;
    this.pillMaterial.uniforms.uHomeLabel.value = texture;
    this.pillMaterial.uniforms.uHomeHasLabel.value = 1;
  }

  /** The first time the button comes into view, it rises out of the depth. */
  private surface() {
    if (this.appeared) return;
    this.appeared = true;
    this.measureQueued = true;
    this.tween({ appear: 1, duration: 1.6, ease: "expo.out" });
  }

  private setHover() {
    const on = this.hovered || this.focused;
    this.tween({ hover: on ? 1 : 0, duration: on ? 0.5 : 0.7, ease: "power3.out" });
  }

  private readonly onEnter = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    this.hovered = true;
    this.setHover();
  };

  private readonly onLeave = () => {
    this.hovered = false;
    this.setHover();
  };

  private readonly onFocus = () => {
    this.focused = this.anchor.matches(":focus-visible");
    this.setHover();
  };

  private readonly onBlur = () => {
    this.focused = false;
    this.setHover();
  };

  private readonly onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.tween({ squashX: 1.07, squashY: 0.84, duration: 0.14, ease: "power2.out" });
  };

  private readonly onUp = () => {
    if (this.state.squashY >= 0.999) return;
    this.tween({ squashX: 1, squashY: 1, duration: 0.8, ease: "elastic.out(1, 0.4)" });
  };

  private readonly onClick = () => {
    this.burstAt = this.time;
    this.state.burst = 0;
    this.tween({ burst: 1, duration: 1.2, ease: "power2.out" });
    const flash = gsap
      .timeline()
      .to(this.state, { flash: 1, duration: 0.12, ease: "power2.out" })
      .to(this.state, { flash: 0, duration: 0.7, ease: "power2.inOut" });
    this.tweens.add(flash as unknown as gsap.core.Tween);
    const rect = this.anchor.getBoundingClientRect();
    this.world.fx.pulse(rect.left + rect.width / 2, rect.top + rect.height / 2, 1);
  };
}
