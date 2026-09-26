import gsap from "gsap";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  NoColorSpace,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  VideoTexture,
} from "three";

import type { ReelController } from "@/components/reel/reel-controller";
import {
  CAP_FRAGMENT,
  CAP_VERTEX,
  LINE_FRAGMENT,
  LINE_VERTEX,
  VIDEO_FRAGMENT,
  VIDEO_VERTEX,
} from "@/components/reel/gl/reel-shaders";
import { lineHead, lineWiggle, reelLine } from "@/components/reel/reel-line";
import type { GlHost } from "@/lib/gl-host";

const OWNER = "reel";

type Rgb = [number, number, number];

/** A CSS colour to display-value RGB (0..1), no colour-space conversion. */
function cssRgb(value: string, fallback: Rgb): Rgb {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.appendChild(probe);
  const parsed = getComputedStyle(probe).color.match(/[\d.]+/g);
  probe.remove();
  if (!parsed || parsed.length < 3) return fallback;
  return [Number(parsed[0]) / 255, Number(parsed[1]) / 255, Number(parsed[2]) / 255];
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The uv scale that shows `source` covering a box of `boxAspect` (width / height). */
function coverScale(sourceAspect: number, boxAspect: number, out: Vector2) {
  if (!(sourceAspect > 0) || !(boxAspect > 0)) return out.set(1, 1);
  return sourceAspect > boxAspect
    ? out.set(boxAspect / sourceAspect, 1)
    : out.set(1, sourceAspect / boxAspect);
}

function buildRibbon() {
  const line = reelLine();
  const count = line.count;
  const center = new Float32Array(count * 4);
  const normal = new Float32Array(count * 4);
  const side = new Float32Array(count * 2);
  const t = new Float32Array(count * 2);
  const ao = new Float32Array(count * 2);
  const position = new Float32Array(count * 6);
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < 2; k += 1) {
      const v = i * 2 + k;
      center[v * 2] = line.x[i];
      center[v * 2 + 1] = line.y[i];
      normal[v * 2] = line.nx[i];
      normal[v * 2 + 1] = line.ny[i];
      side[v] = k === 0 ? -1 : 1;
      t[v] = line.t[i];
      ao[v] = line.ao[i];
    }
  }
  const index: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new BufferGeometry();
  // three needs a position attribute to count vertices; the shader ignores it.
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("a_center", new BufferAttribute(center, 2));
  geometry.setAttribute("a_normal", new BufferAttribute(normal, 2));
  geometry.setAttribute("a_side", new BufferAttribute(side, 1));
  geometry.setAttribute("a_t", new BufferAttribute(t, 1));
  geometry.setAttribute("a_ao", new BufferAttribute(ao, 1));
  geometry.setIndex(index);
  return { geometry, line };
}

/**
 * The reel's WebGL layer: the video plane and the ribbon, drawn into a
 * GlHost's scene (the cursor-flow stage, which smears them with the
 * cursor, or the reel's own StandaloneGlHost). It reads everything from
 * the controller's frame state, so it moves exactly with the DOM.
 *
 * `attach()` and `detach()` move it between hosts without rebuilding.
 */
export class ReelGlLayer {
  private readonly controller: ReelController;
  private readonly group = new Group();
  private readonly texture: Texture;
  private readonly video: HTMLVideoElement | null;
  private readonly card: HTMLCanvasElement | null;
  private readonly plane: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly ribbon: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly cap: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly line = reelLine();
  private readonly observer: MutationObserver;
  private readonly onReady: () => void;
  private host: GlHost | null = null;
  private offFrame: (() => void) | null = null;
  private lastVideoTime = -1;
  private lastCardVersion = -1;
  private ready = false;
  private active = false;
  private disposed = false;

  constructor(controller: ReelController, onReady: () => void) {
    this.controller = controller;
    this.onReady = onReady;
    this.video = controller.video;
    this.card = controller.card?.canvas ?? null;

    if (this.video) {
      const texture = new VideoTexture(this.video);
      this.texture = texture;
    } else {
      this.texture = new CanvasTexture(this.card ?? document.createElement("canvas"));
    }
    this.texture.colorSpace = NoColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;

    const planeGeometry = new PlaneGeometry(1, 1, 32, 32);
    planeGeometry.translate(0.5, 0.5, 0);
    this.plane = new Mesh(
      planeGeometry,
      new ShaderMaterial({
        vertexShader: VIDEO_VERTEX,
        fragmentShader: VIDEO_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          u_map: { value: this.texture },
          u_from: { value: new Vector4() },
          u_to: { value: new Vector4() },
          u_progress: { value: 0 },
          u_tint: { value: new Vector3(58 / 255, 109 / 255, 197 / 255) },
          u_radius: { value: 20 },
          u_coverFrom: { value: new Vector2(1, 1) },
          u_coverTo: { value: new Vector2(1, 1) },
          u_hover: { value: 0 },
          u_hoverCenter: { value: new Vector2(0.5, 0.5) },
          u_ready: { value: 0 },
        },
      }),
    );
    this.plane.renderOrder = 1000;
    this.plane.frustumCulled = false;

    const { geometry } = buildRibbon();
    this.ribbon = new Mesh(
      geometry,
      new ShaderMaterial({
        vertexShader: LINE_VERTEX,
        fragmentShader: LINE_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          u_diag: { value: 1 },
          u_sectionY: { value: 0 },
          u_halfWidth: { value: 10 },
          u_time: { value: 0 },
          u_reveal: { value: 0 },
          u_crossT: { value: this.line.crossT },
          u_tail: { value: new Vector3() },
          u_head: { value: new Vector3() },
        },
      }),
    );
    this.ribbon.renderOrder = 200;
    this.ribbon.frustumCulled = false;

    this.cap = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        vertexShader: CAP_VERTEX,
        fragmentShader: CAP_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        // The y flip to screen space turns the quad's winding around.
        side: DoubleSide,
        uniforms: {
          u_center: { value: new Vector2() },
          u_radius: { value: 10 },
          u_color: { value: new Vector3() },
        },
      }),
    );
    this.cap.renderOrder = 201;
    this.cap.frustumCulled = false;

    this.group.add(this.ribbon, this.cap, this.plane);
    this.group.visible = false;
    this.readColors();
    this.observer = new MutationObserver(() => this.readColors());
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    gsap.ticker.add(this.watch);
  }

  /** Starts drawing into `host` (leaving any previous one). */
  attach(host: GlHost) {
    if (this.disposed || this.host === host) return;
    this.detach();
    this.host = host;
    host.scene.add(this.group);
    this.offFrame = host.onFrame(this.frame);
    this.active = false;
    this.watch();
  }

  /** Stops drawing into the current host, if any. */
  detach() {
    const host = this.host;
    if (!host) return;
    this.offFrame?.();
    this.offFrame = null;
    host.scene.remove(this.group);
    host.requestFrames(OWNER, false);
    this.host = null;
    this.active = false;
  }

  get attachedTo() {
    return this.host;
  }

  /** Whether the picture has had its first frame. */
  get isReady() {
    return this.ready;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    gsap.ticker.remove(this.watch);
    this.observer.disconnect();
    this.detach();
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    this.ribbon.geometry.dispose();
    this.ribbon.material.dispose();
    this.cap.geometry.dispose();
    this.cap.material.dispose();
    this.texture.dispose();
  }

  /** Holds the host's frames on while the section is near the viewport. */
  private readonly watch = () => {
    const host = this.host;
    if (!host) return;
    const near = this.controller.state.near;
    if (near !== this.active) {
      this.active = near;
      host.requestFrames(OWNER, near);
      if (!near) this.group.visible = false;
    }
  };

  private readColors() {
    const style = getComputedStyle(document.documentElement);
    const blue = cssRgb(style.getPropertyValue("--brand-blue").trim() || "#3a6dc5", [
      58 / 255,
      109 / 255,
      197 / 255,
    ]);
    const dark = document.documentElement.classList.contains("dark");
    const tail = mixRgb(blue, [0, 0, 0], dark ? 0.04 : 0.1);
    const head = mixRgb(blue, [1, 1, 1], dark ? 0.24 : 0.16);
    const uniforms = this.ribbon.material.uniforms;
    (uniforms.u_tail.value as Vector3).set(...tail);
    (uniforms.u_head.value as Vector3).set(...head);
    (this.plane.material.uniforms.u_tint.value as Vector3).set(...blue);
  }

  private readonly frame = () => {
    const s = this.controller.sync();
    if (!s.near) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // The picture.
    const plane = this.plane.material.uniforms;
    (plane.u_from.value as Vector4).set(s.from.x, s.from.y, s.from.w, s.from.h);
    (plane.u_to.value as Vector4).set(s.to.x, s.to.y, s.to.w, s.to.h);
    plane.u_progress.value = s.w;
    plane.u_radius.value = s.radius;
    plane.u_hover.value = Math.max(0, Math.min(1.2, s.hover));
    (plane.u_hoverCenter.value as Vector2).set(s.hoverU, s.hoverV);
    let aspect = 16 / 9;
    const video = this.video;
    if (video) {
      if (video.videoWidth) aspect = video.videoWidth / video.videoHeight;
      if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = video.currentTime;
        this.texture.needsUpdate = true;
        if (!this.ready) this.markReady();
      }
    } else if (this.card) {
      aspect = this.card.width / Math.max(1, this.card.height);
      const version = this.controller.card?.version ?? 0;
      if (version !== this.lastCardVersion) {
        this.lastCardVersion = version;
        this.texture.needsUpdate = true;
        if (!this.ready) this.markReady();
      }
    }
    coverScale(aspect, s.from.w / Math.max(1, s.from.h), plane.u_coverFrom.value as Vector2);
    coverScale(aspect, s.to.w / Math.max(1, s.to.h), plane.u_coverTo.value as Vector2);

    // The ribbon and its head.
    const reveal = s.lineReveal;
    const ribbon = this.ribbon.material.uniforms;
    ribbon.u_diag.value = s.diag;
    ribbon.u_sectionY.value = s.secY;
    ribbon.u_halfWidth.value = s.lineHalfWidth;
    ribbon.u_time.value = s.time;
    ribbon.u_reveal.value = reveal;
    this.ribbon.visible = reveal > 0.0005;
    const head = lineHead(this.line, reveal);
    const wiggle = lineWiggle(reveal, s.time, reveal);
    const cx = head.x + head.nx * wiggle;
    const cy = head.y + head.ny * wiggle;
    const cap = this.cap.material.uniforms;
    (cap.u_center.value as Vector2).set((cx - 0.05) * s.diag, s.secY + (0.8 - cy) * s.diag);
    cap.u_radius.value = s.lineHalfWidth;
    const tail = ribbon.u_tail.value as Vector3;
    const headColor = ribbon.u_head.value as Vector3;
    const k = 1 - Math.pow(1 - reveal, 2);
    const shaded =
      reveal > this.line.crossT + 0.02
        ? 1
        : reveal < this.line.crossT - 0.02
          ? 0
          : (reveal - this.line.crossT + 0.02) / 0.04;
    const ao = 1 + (0.84 + 0.16 * head.ao - 1) * shaded;
    (cap.u_color.value as Vector3).set(
      (tail.x + (headColor.x - tail.x) * k) * ao,
      (tail.y + (headColor.y - tail.y) * k) * ao,
      (tail.z + (headColor.z - tail.z) * k) * ao,
    );
    this.cap.visible = this.ribbon.visible && reveal < 0.9995;
  };

  private markReady() {
    this.ready = true;
    this.plane.material.uniforms.u_ready.value = 1;
    // One frame later, so the first upload has been drawn before the DOM hides.
    requestAnimationFrame(() => {
      if (!this.disposed) this.onReady();
    });
  }
}
