import * as THREE from "three";
import type { FormDesign, FormScene } from "@repo/shared";

import { HopelessWatch, QualityGovernor } from "@/components/articles/world/quality";
import type { SceneColors } from "@/lib/forms/public-theme";

import type { SceneSignal } from "../bus";
import { seeded, type Piece } from "../vocabulary";
import { pieceGeometry, planeGeometry } from "./shapes3d";

/**
 * The form's WebGL scene (three.js, loaded only on /forms and the preview).
 * One engine, four behaviours over the same brand pieces:
 *
 * - orbit: loose pieces circle their anchors while the anchors sweep round
 *   the poster; each valid answer springs the next piece into its cell.
 * - constellation: the pieces are small stars in a field of dust; placed
 *   ones settle near their cells and a line draws to each new one, and the
 *   finished constellation blooms into the full poster.
 * - paper: pieces are sheets printed with a shape, fluttering down; placed
 *   sheets unfold flat into the collage while paper planes glide round.
 * - blocks: deep blocks tumbling; placed ones drop into a tilted tower and
 *   bounce, and the finished composition turns for the camera.
 *
 * One unit is one CSS pixel on the z = 0 plane, so the poster lands exactly
 * on the CSS poster rect ([data-fx-poster]) the DOM version uses. The
 * pointer tilts the camera, a focused question pulses the poster, a failed
 * Next shudders it, and the ending pulls the camera back while the pieces
 * wave. Pauses in hidden tabs, steps its pixel ratio down on slow frames,
 * hands a hopeless renderer back to the DOM scene, and disposes everything.
 */

export type EngineStage = "welcome" | "form" | "ending" | "status";

export type EngineOptions = {
  scene: Exclude<FormScene, "none">;
  intensity: FormDesign["background"]["intensity"];
  interactive: boolean;
  poster: Piece[];
  extras: Piece[];
  colors: SceneColors;
  /** Called once the first frame is on screen. */
  onReady: () => void;
  /** The renderer can't keep up or lost its context: go back to the DOM scene. */
  onFail: () => void;
};

type Body = {
  piece: Piece;
  object: THREE.Object3D;
  extra: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  scaleVel: number;
  quat: THREE.Quaternion;
  placed: boolean;
  placedAt: number;
  /** Constellation: the jittered star position inside its cell. */
  jitter: THREE.Vector2;
};

const FOV = 32;
const tmpVec = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const zAxis = new THREE.Vector3(0, 0, 1);

function spring(value: number, velocity: number, target: number, k: number, c: number, dt: number) {
  const next = velocity + ((target - value) * k - velocity * c) * dt;
  return [value + next * dt, next] as const;
}

export class FormSceneEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly bodies: Body[] = [];
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly paperMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly extrasDisposables: { dispose: () => void }[] = [];
  private lines: THREE.LineSegments | null = null;
  private stars: THREE.Points | null = null;
  private readonly governor: QualityGovernor;
  private readonly hopeless: HopelessWatch;
  private width = 1;
  private height = 1;
  private posterRect = { x: 0, y: 0, size: 0 };
  private progress = 0;
  private complete = false;
  private completeAt = -1;
  private stage: EngineStage = "welcome";
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private pulse = 0;
  private shudder = 0;
  private time = 0;
  private last = 0;
  private frame = 0;
  private running = false;
  private disposed = false;
  private ready = false;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly options: EngineOptions,
  ) {
    const small = window.innerWidth < 760;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.renderer.domElement.className = "fx-scene-canvas";
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 10, 20000);
    const tier = small || window.matchMedia("(pointer: coarse)").matches ? "medium" : "high";
    this.governor = new QualityGovernor(tier, () => {
      this.applyPixelRatio();
    });
    this.hopeless = new HopelessWatch(() => {
      this.options.onFail();
    });

    // Light: a soft sky and one key light from the upper left, bright enough
    // that the flat faces keep the palette's colours.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d2, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-0.6, 0.9, 1.4);
    this.scene.add(key);

    for (let index = 0; index < 5; index += 1) {
      this.materials.push(new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0 }));
    }
    this.setColors(options.colors);

    const mode = options.scene;
    const depth = mode === "blocks" ? 64 : mode === "paper" ? 3 : 14;
    const geometryCache = new Map<string, THREE.BufferGeometry>();
    const geometryFor = (kind: Piece["kind"]) => {
      let geometry = geometryCache.get(kind);
      if (!geometry) {
        geometry = pieceGeometry(kind, depth);
        geometryCache.set(kind, geometry);
        this.geometries.push(geometry);
      }
      return geometry;
    };
    const sheet = new THREE.BoxGeometry(100, 100, 1.6);
    const plane = planeGeometry();
    this.geometries.push(sheet, plane);

    const random = seeded(options.poster.length * 7919 + options.extras.length);
    const extras = small ? options.extras.filter((_, index) => index % 2 === 0) : options.extras;
    const all = [
      ...options.poster.map((piece) => ({ piece, extra: false })),
      ...extras.map((piece) => ({ piece, extra: true })),
    ];
    for (const { piece, extra } of all) {
      let object: THREE.Object3D;
      const material = this.materials[piece.color % 5];
      if (mode === "paper") {
        if (extra && piece.index % 2 === 0) {
          object = new THREE.Mesh(plane, this.paperMaterial);
        } else {
          const group = new THREE.Group();
          group.add(new THREE.Mesh(sheet, this.paperMaterial));
          const print = new THREE.Mesh(geometryFor(piece.kind), material);
          print.scale.setScalar(0.72);
          print.position.z = 2;
          group.add(print);
          object = group;
        }
      } else {
        object = new THREE.Mesh(geometryFor(piece.kind), material);
      }
      this.scene.add(object);
      this.bodies.push({
        piece,
        object,
        extra,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 0,
        scaleVel: 0,
        quat: new THREE.Quaternion(),
        placed: false,
        placedAt: 0,
        jitter: new THREE.Vector2((random() - 0.5) * 0.36, (random() - 0.5) * 0.36),
      });
    }

    if (mode === "constellation") {
      const count = { calm: 160, lively: 260, wild: 420 }[options.intensity] / (small ? 2 : 1);
      const positions = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        positions[index * 3] = random() - 0.5;
        positions[index * 3 + 1] = random() - 0.5;
        positions[index * 3 + 2] = (random() - 0.5) * 900;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        size: 3,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.55,
      });
      const stars = new THREE.Points(geometry, material);
      stars.userData.unit = true;
      this.scene.add(stars);
      this.stars = stars;
      this.geometries.push(geometry);
      this.extrasDisposables.push(material);

      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(options.poster.length * 6), 3),
      );
      const lineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 });
      const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
      lines.frustumCulled = false;
      this.scene.add(lines);
      this.lines = lines;
      this.geometries.push(lineGeometry);
      this.extrasDisposables.push(lineMaterial);
    }
    this.setColors(options.colors);

    this.resize();
    const onResize = () => {
      this.resize();
    };
    window.addEventListener("resize", onResize);
    this.cleanup.push(() => {
      window.removeEventListener("resize", onResize);
    });
    // The poster box can move without a window resize (the builder's
    // preview switching the form's placement), so follow the probe too.
    const probe = document.querySelector<HTMLElement>("[data-fx-poster]");
    if (probe && typeof ResizeObserver !== "undefined") {
      let last = "";
      const observer = new ResizeObserver(() => {
        const rect = probe.getBoundingClientRect();
        const key = `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}`;
        if (key !== last) {
          last = key;
          this.resize();
        }
      });
      observer.observe(probe);
      this.cleanup.push(() => {
        observer.disconnect();
      });
    }
    if (options.interactive && window.matchMedia("(pointer: fine)").matches) {
      const onMove = (event: PointerEvent) => {
        this.pointer.set(event.clientX / this.width - 0.5, event.clientY / this.height - 0.5);
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      this.cleanup.push(() => {
        window.removeEventListener("pointermove", onMove);
      });
    }
    const onVisibility = () => {
      if (document.hidden) this.stop();
      else this.start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    this.cleanup.push(() => {
      document.removeEventListener("visibilitychange", onVisibility);
    });
    const canvas = this.renderer.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      this.options.onFail();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    this.cleanup.push(() => {
      canvas.removeEventListener("webglcontextlost", onLost);
    });

    // Everything starts where it rests loose, so the first frame matches the DOM scene.
    for (const body of this.bodies) {
      this.looseTarget(body, 0, tmpVec);
      body.pos.copy(tmpVec);
      body.scale = this.looseScale(body);
    }
    this.start();
  }

  // ------------------------------------------------------------ public

  setState(progress: number, complete: boolean, stage: EngineStage) {
    this.progress = progress;
    if (complete && !this.complete) this.completeAt = this.time;
    this.complete = complete;
    this.stage = stage;
  }

  setColors(colors: SceneColors) {
    colors.pieces.forEach((color, index) => {
      const material = this.materials.at(index);
      if (!material) return;
      material.color.set(color);
      material.emissive.set(color).multiplyScalar(0.18);
    });
    this.paperMaterial.color.set(new THREE.Color(colors.bg).lerp(new THREE.Color("#ffffff"), 0.75));
    this.paperMaterial.emissive.set(colors.bg).multiplyScalar(0.12);
    if (this.lines) (this.lines.material as THREE.LineBasicMaterial).color.set(colors.highlight);
    if (this.stars) (this.stars.material as THREE.PointsMaterial).color.set(colors.text);
  }

  signal(signal: SceneSignal) {
    if (signal.type === "focus") this.pulse = 1;
    else if (signal.type === "error") this.shudder = 1;
    else if (signal.type === "celebrate") this.completeAt = this.time;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    for (const clean of this.cleanup) clean();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.paperMaterial.dispose();
    for (const item of this.extrasDisposables) item.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ----------------------------------------------------------- layout

  private applyPixelRatio() {
    const cap = window.innerWidth < 760 ? 1.5 : 2;
    const ratio = Math.min(cap, window.devicePixelRatio || 1, this.governor.level.pixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.width, this.height, false);
  }

  private resize() {
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.applyPixelRatio();
    const probe = document.querySelector<HTMLElement>("[data-fx-poster]");
    const rect = probe?.getBoundingClientRect();
    this.posterRect = rect
      ? { x: rect.left, y: rect.top, size: rect.width }
      : {
          x: this.width * 0.6,
          y: this.height * 0.25,
          size: Math.min(this.width, this.height) * 0.4,
        };
    if (this.stars) {
      this.stars.scale.set(this.width * 1.2, this.height * 1.2, 1);
    }
    this.governor.rest();
  }

  private get distance() {
    return this.height / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  }

  private get cell() {
    return this.posterRect.size / 4;
  }

  /** The poster's centre in world units. */
  private posterCenter(out: THREE.Vector3) {
    const { x, y, size } = this.posterRect;
    return out.set(x + size / 2 - this.width / 2, this.height / 2 - (y + size / 2), 0);
  }

  private looseScale(body: Body) {
    const base = (this.cell / 100) * body.piece.scatter.size * 0.62;
    return this.options.scene === "constellation" ? base * 0.34 : base;
  }

  private looseTarget(body: Body, t: number, out: THREE.Vector3) {
    const { piece } = body;
    const intensity = { calm: 0.55, lively: 1, wild: 1.6 }[this.options.intensity];
    let x = piece.scatter.x * this.width - this.width / 2;
    let y = this.height / 2 - piece.scatter.y * this.height;
    const z = (piece.scatter.z - 0.5) * 420;
    const phase = piece.phase + t * piece.speed * 0.35 * intensity;
    switch (this.options.scene) {
      case "orbit": {
        const radius = 26 + piece.scatter.size * 50 * intensity;
        x += Math.cos(phase) * radius;
        y += Math.sin(phase) * radius * 0.7;
        // The anchors sweep a little round the poster.
        const center = this.posterCenter(tmpVec.clone());
        const angle = Math.sin(t * 0.05 + piece.phase) * 0.14 * intensity;
        const dx = x - center.x;
        const dy = y - center.y;
        x = center.x + dx * Math.cos(angle) - dy * Math.sin(angle);
        y = center.y + dx * Math.sin(angle) + dy * Math.cos(angle);
        return out.set(x, y, z + Math.sin(phase) * 60);
      }
      case "paper": {
        // Falling leaves: a slow drift down that wraps, swaying side to side.
        const span = this.height + 400;
        const fall = ((piece.scatter.y * span + t * 18 * piece.speed * intensity) % span) - 200;
        y = this.height / 2 - fall;
        x += Math.sin(phase * 1.3) * 60;
        if (body.extra && piece.index % 2 === 0) {
          // Paper planes glide in wide loops.
          const loop = t * 0.18 * piece.speed * intensity + piece.phase;
          return out.set(
            Math.cos(loop) * this.width * 0.42,
            Math.sin(loop * 2) * this.height * 0.18 + (piece.scatter.y - 0.5) * this.height * 0.5,
            z + Math.sin(loop) * 160,
          );
        }
        return out.set(x, y, z);
      }
      case "blocks":
        return out.set(x, y + Math.sin(phase) * 22 * intensity, z);
      case "constellation":
      default:
        return out.set(x + Math.sin(phase) * 10, y + Math.cos(phase * 0.8) * 10, z);
    }
  }

  private looseRotation(body: Body, t: number, out: THREE.Quaternion) {
    const { piece } = body;
    const intensity = { calm: 0.5, lively: 1, wild: 1.7 }[this.options.intensity];
    const spin = t * piece.scatter.spin * 0.4 * intensity + piece.phase;
    switch (this.options.scene) {
      case "blocks":
        tmpEuler.set(spin * 0.7, spin, spin * 0.4);
        break;
      case "paper":
        if (body.extra && piece.index % 2 === 0) {
          const loop = t * 0.18 * piece.speed * intensity + piece.phase;
          tmpEuler.set(Math.sin(loop) * 0.4, -loop - Math.PI / 2, Math.cos(loop * 2) * 0.3);
        } else {
          tmpEuler.set(Math.sin(spin * 1.4) * 1.1, Math.cos(spin) * 0.8, spin * 0.3);
        }
        break;
      default:
        tmpEuler.set(Math.sin(spin) * 0.5, Math.cos(spin * 0.7) * 0.5, spin);
    }
    return out.setFromEuler(tmpEuler);
  }

  // -------------------------------------------------------------- loop

  private start() {
    if (this.running || this.disposed || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const ms = now - this.last;
      this.last = now;
      this.governor.sample(ms);
      this.hopeless.sample(ms);
      // Sampling can hand the visit to the DOM scene and dispose this engine.
      if (!this.running) return;
      this.step(Math.min(0.05, ms / 1000));
      this.renderer.render(this.scene, this.camera);
      if (!this.ready) {
        this.ready = true;
        this.options.onReady();
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private step(dt: number) {
    this.time += dt;
    const t = this.time;
    const mode = this.options.scene;
    const placedCount = this.complete
      ? this.options.poster.length
      : Math.round(this.progress * this.options.poster.length);
    const sinceComplete = this.completeAt >= 0 ? t - this.completeAt : -1;
    const celebrating = this.complete && sinceComplete >= 0;

    // Camera: pointer tilt, and the pull back once the composition completes.
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 3));
    const pull = celebrating ? THREE.MathUtils.smootherstep(sinceComplete, 0, 2.4) * 0.14 : 0;
    const distance = this.distance * (1 + pull);
    this.camera.position.set(this.pointerSmooth.x * 70, -this.pointerSmooth.y * 50, distance);
    const center = this.posterCenter(new THREE.Vector3());
    const look = new THREE.Vector3(center.x * pull * 2, center.y * pull * 2, 0);
    this.camera.lookAt(look);

    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.shudder = Math.max(0, this.shudder - dt * 2.6);
    const shake = Math.sin(t * 70) * 10 * this.shudder;

    // The poster's own tilt: blocks lean to show their depth, and turn at the end.
    const tilt = new THREE.Quaternion();
    if (mode === "blocks") {
      const turn = celebrating ? Math.sin(Math.min(1, sinceComplete / 3.2) * Math.PI) * -0.6 : 0;
      tilt.setFromEuler(
        new THREE.Euler(
          0.18 - this.pointerSmooth.y * 0.12,
          -0.32 + turn + this.pointerSmooth.x * 0.2,
          0,
        ),
      );
    } else {
      tilt.setFromEuler(
        new THREE.Euler(-this.pointerSmooth.y * 0.1, this.pointerSmooth.x * 0.14, 0),
      );
    }

    const cell = this.cell;
    const positions = this.lines?.geometry.getAttribute("position") as
      THREE.BufferAttribute | undefined;
    let previous: THREE.Vector3 | null = null;
    let lineIndex = 0;

    for (const body of this.bodies) {
      const index = body.piece.index;
      const shouldPlace = !body.extra && index < placedCount;
      if (shouldPlace && !body.placed) {
        body.placed = true;
        body.placedAt = t;
        if (mode === "blocks") {
          // Blocks drop in from above the poster.
          body.pos.set(body.pos.x * 0.4 + center.x * 0.6, center.y + this.height * 0.8, 0);
          body.vel.set(0, -400, 0);
        }
      } else if (!shouldPlace && body.placed) {
        body.placed = false;
      }

      const target = tmpVec;
      let scaleTarget: number;
      const targetQuat = tmpQuat;
      if (body.placed) {
        const [col, row] = body.piece.cell;
        const local = new THREE.Vector3((col - 1.5) * cell, (1.5 - row) * cell, 0);
        let scale = (cell / 100) * 0.98;
        if (mode === "constellation" && !celebrating) {
          local.x += body.jitter.x * cell;
          local.y += body.jitter.y * cell;
          scale *= 0.42;
        }
        if (mode === "blocks") local.z = (row - 1.5) * -12;
        local.applyQuaternion(tilt);
        target.copy(center).add(local);
        // The wave: at the end each piece hops in turn.
        if (celebrating) {
          const wave = Math.max(0, Math.sin((sinceComplete - (col + row) * 0.12) * 4));
          target.z += sinceComplete < 3 ? wave * 60 : 0;
        }
        scaleTarget = scale * (1 + this.pulse * 0.05);
        targetQuat
          .copy(tilt)
          .multiply(
            new THREE.Quaternion().setFromAxisAngle(zAxis, (body.piece.turn * Math.PI) / 2),
          );
        if (mode === "paper") {
          // A sheet unfolds as it lands.
          const unfold = THREE.MathUtils.smoothstep(t - body.placedAt, 0, 0.9);
          targetQuat.multiply(
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(1, 0, 0),
              (1 - unfold) * Math.PI * 0.5,
            ),
          );
        }
      } else {
        this.looseTarget(body, t, target);
        scaleTarget = this.looseScale(body) * (1 + this.pulse * 0.08);
        this.looseRotation(body, t, targetQuat);
        if (celebrating && body.extra && mode !== "paper") {
          // The loose pieces gather into a loose ring round the finished poster.
          const angle = (index / Math.max(1, this.bodies.length)) * Math.PI * 2 + t * 0.2;
          const ring = this.posterRect.size * 0.78;
          const gather = THREE.MathUtils.smoothstep(sinceComplete, 0.2, 2.2);
          target.lerp(
            new THREE.Vector3(
              center.x + Math.cos(angle) * ring,
              center.y + Math.sin(angle) * ring * 0.8,
              -120,
            ),
            gather * 0.85,
          );
        }
      }

      const k = body.placed ? (mode === "blocks" ? 55 : 70) : 18;
      const c = body.placed ? (mode === "blocks" ? 7 : 11) : 8;
      const [x, vx] = spring(body.pos.x, body.vel.x, target.x, k, c, dt);
      const [y, vy] = spring(body.pos.y, body.vel.y, target.y, k, c, dt);
      const [z, vz] = spring(body.pos.z, body.vel.z, target.z, k, c, dt);
      body.pos.set(x, y, z);
      body.vel.set(vx, vy, vz);
      const [scale, scaleVel] = spring(body.scale, body.scaleVel, scaleTarget, 160, 13, dt);
      body.scale = Math.max(0, scale);
      body.scaleVel = scaleVel;
      body.quat.slerp(targetQuat, 1 - Math.exp(-dt * (body.placed ? 9 : 3)));

      body.object.position.set(body.pos.x + shake, body.pos.y, body.pos.z);
      body.object.quaternion.copy(body.quat);
      body.object.scale.setScalar(body.scale);

      // Constellation lines: from each placed star to the next, drawn out.
      if (positions && body.placed && !body.extra) {
        const here = body.object.position;
        if (previous && lineIndex < this.options.poster.length) {
          const grow = THREE.MathUtils.smoothstep(t - body.placedAt, 0, 0.8);
          const end = previous.clone().lerp(here, grow);
          positions.setXYZ(lineIndex * 2, previous.x, previous.y, previous.z);
          positions.setXYZ(lineIndex * 2 + 1, end.x, end.y, end.z);
          lineIndex += 1;
        }
        previous = here.clone();
      }
    }
    if (positions && this.lines) {
      for (let index = lineIndex; index < this.options.poster.length; index += 1) {
        positions.setXYZ(index * 2, 0, 0, -99999);
        positions.setXYZ(index * 2 + 1, 0, 0, -99999);
      }
      positions.needsUpdate = true;
      const material = this.lines.material as THREE.LineBasicMaterial;
      material.opacity = celebrating ? Math.max(0, 0.7 - sinceComplete * 0.35) : 0.7;
    }
    if (this.stars) {
      this.stars.position.set(-this.pointerSmooth.x * 40, this.pointerSmooth.y * 30, -200);
      (this.stars.material as THREE.PointsMaterial).opacity = 0.4 + Math.sin(t * 0.8) * 0.12;
    }
  }
}

export function createFormScene(host: HTMLElement, options: EngineOptions) {
  return new FormSceneEngine(host, options);
}
