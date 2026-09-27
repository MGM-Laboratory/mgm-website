import {
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import gsap from "gsap";

import { HopelessWatch } from "@/components/articles/world/quality";
import { onPointer, pointer } from "@/lib/motion/pointer";

/**
 * The footer's 3D MGM mark: the three shards of `LogoMark`, extruded with a
 * soft bevel, lit by a generated studio room (no files to load), floating
 * over a blurred contact shadow.
 *
 * - The camera follows the cursor across the whole window, so the mark
 *   tilts as if you were walking around it.
 * - A click spins it (the side you click decides the direction) with a
 *   small hop and a burst of its shards; a drag spins it by hand and lets
 *   it coast. Once slow, it settles facing front again.
 * - Hovering spreads the shards a little, an exploded view.
 * - `celebrate()` plays a bigger spin and burst, for the end of the page.
 *
 * It renders only while it is on screen and the tab is visible, at a pixel
 * ratio of at most 1.5. A lost context or frames that stay too slow call
 * `onFail`, and the host puts the flat mark back.
 */

export type LogoEngine = {
  celebrate: () => void;
  dispose: () => void;
};

type Options = {
  /** Each shard's SVG path data, in LogoMark's viewBox units. */
  paths: string[];
  /** Each shard's fill. */
  colors: string[];
  /** LogoMark's viewBox: x, y, width, height. */
  viewBox: [number, number, number, number];
  onReady: () => void;
  onFail: () => void;
};

type Shard = { mesh: Mesh; dir: Vector3 };

const TAU = Math.PI * 2;
const CAMERA_Z = 7.4;

function shadowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.45, "rgba(0,0,0,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createLogoEngine(host: HTMLElement, options: Options): LogoEngine {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
  } catch {
    queueMicrotask(options.onFail);
    return { celebrate() {}, dispose() {} };
  }

  let disposed = false;
  let failed = false;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.logoCanvas = "";
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    opacity: "0",
    transition: "opacity 0.6s ease",
    cursor: "grab",
    touchAction: "pan-y",
  });
  host.appendChild(canvas);

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.5;

  const camera = new PerspectiveCamera(26, 1, 0.1, 60);
  camera.position.set(0, 0, CAMERA_Z);

  const key = new DirectionalLight(0xffffff, 1.25);
  key.position.set(3, 4, 6);
  const rim = new DirectionalLight(0xffffff, 0.7);
  rim.position.set(-5, -1.5, -4);
  scene.add(key, rim);

  // ---- the mark ----
  const [vx, vy, vw, vh] = options.viewBox;
  const scale = 2.3 / vw;
  const loader = new SVGLoader();
  const flip = new Group();
  // SVG y points down; three's points up.
  flip.scale.set(scale, -scale, scale);
  const shards: Shard[] = options.paths.map((d, i) => {
    const data = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
    const shapes = data.paths.flatMap((path) => path.toShapes());
    const geometry = new ExtrudeGeometry(shapes, {
      depth: 64,
      bevelEnabled: true,
      bevelThickness: 10,
      bevelSize: 6,
      bevelSegments: 6,
      curveSegments: 28,
    });
    geometry.translate(-(vx + vw / 2), -(vy + vh / 2), -32);
    geometry.computeBoundingBox();
    const centre = new Vector3();
    geometry.boundingBox?.getCenter(centre);
    const material = new MeshPhysicalMaterial({
      color: new Color(options.colors[i] ?? "#3A6DC5"),
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
    });
    const mesh = new Mesh(geometry, material);
    flip.add(mesh);
    return { mesh, dir: centre.setZ(0).normalize() };
  });
  const logo = new Group();
  logo.add(flip);
  scene.add(logo);

  const shadowMap = shadowTexture();
  const shadowMaterial = new MeshBasicMaterial({
    map: shadowMap,
    transparent: true,
    depthWrite: false,
    opacity: 0.2,
    color: 0x0e1116,
  });
  const shadow = new Mesh(new PlaneGeometry(2.4, 0.55), shadowMaterial);
  shadow.position.set(0, -1.5, -0.4);
  scene.add(shadow);

  const applyTheme = () => {
    const dark = document.documentElement.classList.contains("dark");
    shadowMaterial.opacity = dark ? 0.55 : 0.2;
    rim.intensity = dark ? 1.3 : 0.7;
    key.intensity = dark ? 1.45 : 1.25;
  };
  applyTheme();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  // ---- size ----
  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);

  // ---- motion state ----
  let time = 0;
  const spin = { angle: 0, speed: 0 };
  const cam = { x: 0, y: 0, vx: 0, vy: 0 };
  const hop = { y: 0, v: 0 };
  const burst = { x: 0, v: 0 };
  const hover = { x: 0, v: 0, target: 0 };
  let dragging = false;
  let dragMoved = 0;
  let dragLastX = 0;
  let dragLastT = 0;

  const springTo = (
    s: { x?: number; y?: number; v: number },
    key: "x" | "y",
    target: number,
    k: number,
    c: number,
    dt: number,
  ) => {
    const value = s[key] ?? 0;
    s.v += (k * (target - value) - c * s.v) * dt;
    s[key] = value + s.v * dt;
  };

  function step(dt: number) {
    time += dt;
    const p = pointer();
    let nx = 0;
    let ny = 0;
    if (p.inside && p.type !== "touch") {
      nx = (p.x / window.innerWidth) * 2 - 1;
      ny = (p.y / window.innerHeight) * 2 - 1;
    }
    // The camera follows the cursor, critically damped.
    cam.vx += (60 * (nx * 1.25 - cam.x) - 15 * cam.vx) * dt;
    cam.vy += (60 * (-ny * 0.8 - cam.y) - 15 * cam.vy) * dt;
    cam.x += cam.vx * dt;
    cam.y += cam.vy * dt;

    if (!dragging) {
      if (Math.abs(spin.speed) > 1.6) {
        spin.speed *= Math.exp(-1.35 * dt);
      } else {
        // Slow enough: settle facing front, with a little wobble.
        const target = Math.round(spin.angle / TAU) * TAU;
        spin.speed += (38 * (target - spin.angle) - 7 * spin.speed) * dt;
      }
      spin.angle += spin.speed * dt;
    }
    springTo(hop, "y", 0, 90, 9, dt);
    springTo(burst, "x", 0, 70, 10, dt);
    springTo(hover, "x", hover.target, 120, 16, dt);
  }

  function render() {
    camera.position.set(cam.x, cam.y, CAMERA_Z);
    camera.lookAt(0, 0, 0);
    const float = Math.sin(time * 1.1) * 0.07;
    logo.position.y = float + hop.y;
    logo.rotation.y = spin.angle + Math.sin(time * 0.55) * 0.16;
    logo.rotation.x = Math.sin(time * 0.8) * 0.06 - hop.y * 0.25;
    logo.rotation.z = Math.sin(time * 0.45) * 0.03;
    const spread = (burst.x + hover.x * 0.1) * 70;
    for (const shard of shards) {
      shard.mesh.position.set(shard.dir.x * spread, shard.dir.y * spread, 0);
    }
    const lift = logo.position.y;
    shadow.scale.setScalar(1 - lift * 0.35);
    shadowMaterial.opacity =
      (document.documentElement.classList.contains("dark") ? 0.55 : 0.2) * (1 - lift * 0.8);
    renderer.render(scene, camera);
  }

  const hopeless = new HopelessWatch(() => fail());

  const tick = (_time: number, deltaMs: number) => {
    if (disposed) return;
    hopeless.sample(deltaMs);
    step(Math.min(deltaMs, 50) / 1000);
    render();
  };

  let running = false;
  let ready = false;
  let visible = false;
  const setRunning = (on: boolean) => {
    if (on === running || disposed) return;
    running = on;
    if (on) gsap.ticker.add(tick);
    else gsap.ticker.remove(tick);
  };
  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      setRunning(visible && ready);
    },
    { rootMargin: "120px 0px" },
  );
  io.observe(host);

  // ---- input ----
  const kick = (direction: number, strength: number) => {
    spin.speed += direction * 13 * strength;
    hop.v += 2.4 * strength;
    burst.v += 5.5 * strength;
  };
  const onEnter = (event: PointerEvent) => {
    if (event.pointerType !== "touch") hover.target = 1;
  };
  const onLeave = () => {
    hover.target = 0;
  };
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragMoved = 0;
    dragLastX = event.clientX;
    dragLastT = event.timeStamp;
    if (event.pointerType === "touch") return;
    dragging = true;
    spin.speed = 0;
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture?.(event.pointerId);
  };
  const onMove = (event: PointerEvent) => {
    if (!dragging) return;
    const dx = event.clientX - dragLastX;
    const dt = Math.max(1, event.timeStamp - dragLastT) / 1000;
    dragMoved += Math.abs(dx);
    spin.angle += dx * 0.012;
    spin.speed = spin.speed * 0.5 + ((dx * 0.012) / dt) * 0.5;
    dragLastX = event.clientX;
    dragLastT = event.timeStamp;
  };
  const onUp = (event: PointerEvent) => {
    const wasDragging = dragging;
    dragging = false;
    canvas.style.cursor = "grab";
    if (wasDragging && dragMoved > 4) {
      spin.speed = Math.max(-26, Math.min(26, spin.speed));
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const side = event.clientX < rect.left + rect.width / 2 ? -1 : 1;
    kick(side, 1);
  };
  canvas.addEventListener("pointerenter", onEnter);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onLeave);
  // Keeps the shared pointer reading alive for the camera follow.
  const offPointer = onPointer(() => {});

  const onContextLost = (event: Event) => {
    event.preventDefault();
    fail();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  function fail() {
    if (failed || disposed) return;
    failed = true;
    options.onFail();
  }

  // Compile before the first frame, so the mark fades in whole.
  const start = () => {
    if (disposed) return;
    render();
    ready = true;
    canvas.style.opacity = "1";
    options.onReady();
    setRunning(visible);
  };
  renderer
    .compileAsync(scene, camera)
    .then(start)
    .catch(() => start());

  return {
    celebrate() {
      kick(1, 1.35);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gsap.ticker.remove(tick);
      io.disconnect();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      offPointer();
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      for (const shard of shards) {
        shard.mesh.geometry.dispose();
        (shard.mesh.material as MeshPhysicalMaterial).dispose();
      }
      shadow.geometry.dispose();
      shadowMaterial.dispose();
      shadowMap.dispose();
      env.dispose();
      pmrem.dispose();
      room.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
