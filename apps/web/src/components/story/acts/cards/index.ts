import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
} from "three";

import {
  aim,
  beatLabel,
  beatText,
  placeholderLights,
  vec,
} from "@/components/story/acts/placeholder-kit";
import {
  backOut,
  cubicInOut,
  expoOut,
  fit,
  mix,
  saturate,
  span,
  stepSpring,
  type ActState,
  type StoryAct,
  type StoryContext,
  type StoryHotspot,
  type StoryLabel,
  type StoryPointerEvent,
} from "@/components/story/engine/act";
import { planeToRect, projectBox } from "@/components/story/engine/dom-glue";
import {
  BOX_REST,
  CARD_STAGE,
  SHOT_LAND,
  SIZES,
  fovForAspect,
} from "@/components/story/engine/frame";
import { STORY_CARDS, STORY_HINTS } from "@/data/story";

/**
 * PLACEHOLDER for Act 1 (the cards package replaces it). A blue box glued
 * to the DOM placeholder during the entrance, rising to the card stage, a
 * snake of instanced cards, four drawn cards that turn over, the gather and
 * the drop onto the coffee table with the backdrop dissolving into the
 * room. A label names the beat. It exists to prove the timeline, the glue,
 * the backdrop and the hand-off to the room act.
 */

declare module "@/components/story/engine/act" {
  interface StoryPropMap {
    placeholderBox: Group;
  }
}

const SWARM = 24;
const ACCENTS = new Map([
  ["blue", "#3a6dc5"],
  ["red", "#f94141"],
  ["green", "#0f8657"],
  ["yellow", "#f7bf33"],
]);

function faceTexture(
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  w = 256,
  h = 360,
) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (g) draw(g, w, h);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.314;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

const forward = new Vector3();
const glued = new Vector3();
const rest = new Vector3();
const temp = new Vector3();
const dummy = new Object3D();

class CardsPlaceholder implements StoryAct {
  readonly id = "cards" as const;
  private readonly group = new Group();
  private readonly box = new Group();
  private boxMesh: Mesh | null = null;
  private readonly cards: Mesh[] = [];
  private swarm: InstancedMesh | null = null;
  private label: StoryLabel | null = null;
  private readonly hotspots: StoryHotspot[] = [];
  private readonly textures: CanvasTexture[] = [];
  private readonly materials: Material[] = [];
  private readonly geometries: Array<BoxGeometry | PlaneGeometry> = [];
  private readonly hop: [number, number] = [0, 0];
  private hopTarget = 0;
  private hover = 0;

  async init(ctx: StoryContext) {
    await placeholderLights(ctx);
    const { width, height, depth } = SIZES.box;
    const front = faceTexture((g, w, h) => {
      g.fillStyle = "#3a6dc5";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 6;
      g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = "#ffffff";
      star(g, w / 2, h * 0.42, w * 0.2);
      g.fill();
      g.font = "600 30px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText("MGM", w / 2, h * 0.8);
    });
    this.textures.push(front);
    const blue = new MeshStandardMaterial({ color: 0x3a6dc5, roughness: 0.55 });
    const glueCheck =
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).has("storyglue");
    const faceMaterial = glueCheck
      ? new MeshBasicMaterial({ color: 0x00ff00, toneMapped: false })
      : new MeshStandardMaterial({ map: front, roughness: 0.5 });
    this.materials.push(blue, faceMaterial);
    const boxGeometry = new BoxGeometry(depth, height, width);
    this.geometries.push(boxGeometry);
    // BoxGeometry faces: +x, -x, +y, -y, +z, -z. The front looks along +x.
    const mesh = new Mesh(boxGeometry, [faceMaterial, blue, blue, blue, blue, blue]);
    mesh.name = "placeholder-box";
    this.boxMesh = mesh;
    this.box.add(mesh);
    this.group.add(this.box);
    await ctx.props.ensure("placeholderBox", () => this.box);

    const card = SIZES.card;
    const cardGeometry = new BoxGeometry(0.0006, card.height, card.width);
    this.geometries.push(cardGeometry);
    const back = new MeshStandardMaterial({ color: 0x2d318a, roughness: 0.6 });
    this.materials.push(back);
    for (const data of STORY_CARDS) {
      const accent = ACCENTS.get(data.accent) ?? "#3a6dc5";
      const texture = faceTexture((g, w, h) => {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, w, h);
        g.fillStyle = accent;
        g.beginPath();
        g.arc(w / 2, h * 0.3, w * 0.24, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#0e1116";
        g.font = "600 38px system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText(data.title, w / 2, h * 0.72);
      });
      this.textures.push(texture);
      const faceMat = new MeshStandardMaterial({ map: texture, roughness: 0.5 });
      this.materials.push(faceMat);
      const cardMesh = new Mesh(cardGeometry, [faceMat, back, back, back, back, back]);
      cardMesh.visible = false;
      this.cards.push(cardMesh);
      this.group.add(cardMesh);
      this.hotspots.push(
        ctx.overlay.hotspot({
          id: `card-${data.id}`,
          label: `${data.title}. ${data.line}`,
          href: data.href,
        }),
      );
    }

    const plane = new PlaneGeometry(card.width, card.height);
    plane.rotateY(Math.PI / 2);
    this.geometries.push(plane);
    const swarmMaterial = new MeshStandardMaterial({ color: 0x2d318a, roughness: 0.6, side: 2 });
    this.materials.push(swarmMaterial);
    const swarm = new InstancedMesh(plane, swarmMaterial, SWARM);
    swarm.instanceMatrix.setUsage(DynamicDrawUsage);
    swarm.frustumCulled = false;
    swarm.visible = false;
    this.swarm = swarm;
    this.group.add(swarm);

    this.label = await beatLabel(ctx, 0.011);
    this.group.add(this.label.object);
    ctx.stage.rootScene.add(this.group);
    await ctx.stage.compile();
  }

  update(ctx: StoryContext, state: ActState) {
    const { camera } = ctx.stage;
    const t = state.t;
    const dropped = state.beat("c-drop");
    this.group.visible = true;
    if (!state.active) {
      // Near but not active (the room's first beat): the box stays on the table.
      this.poseResting();
      this.hideCards();
      if (this.label) this.label.object.visible = false;
      return;
    }

    // --- camera: the card stage, then the crane into the landing shot.
    const stage = vec(CARD_STAGE.centre);
    const stageFov = fovForAspect(
      CARD_STAGE.fovLandscapeDeg,
      CARD_STAGE.fovPortraitDeg,
      ctx.size.aspect,
    );
    const crane = cubicInOut(dropped);
    const camPos = new Vector3(stage.x + CARD_STAGE.distance, stage.y, stage.z).lerp(
      vec(SHOT_LAND.position),
      crane,
    );
    const look = stage.clone().lerp(vec(SHOT_LAND.target), crane);
    const landFov = fovForAspect(
      SHOT_LAND.fovLandscapeDeg,
      SHOT_LAND.fovPortraitDeg,
      ctx.size.aspect,
    );
    aim(camera, camPos, look, mix(stageFov, landFov, crane));
    // Life: a small drift toward the cursor on the card stage.
    if (dropped < 0.2 && ctx.pointer.inside) {
      camera.position.z -= ctx.pointer.ndc.x * 0.004;
      camera.position.y += ctx.pointer.ndc.y * 0.003;
      camera.lookAt(look);
      camera.updateMatrixWorld();
    }

    // --- backdrop: the DOM page during the entrance, the page colour after, the room through the drop.
    if (t < 0) ctx.stage.backdrop.set({ paint: 0, reveal: 0 });
    else ctx.stage.backdrop.set({ paint: 1, reveal: 0 });

    // --- the box
    const life = ctx.clock.time;
    stepSpring(this.hop, this.hopTarget, ctx.clock.dt, 260, 16);
    if (this.hopTarget > 0 && this.hop[0] > 0.8 * this.hopTarget) this.hopTarget = 0;
    const box = this.box;
    rest.copy(stage);
    const rise = state.beat("c-rise");
    if (rise < 1) {
      this.gluedPose(ctx, glued);
      // Leaves the placeholder with no jump: the ease starts at rest.
      const p = backOut(cubicInOut(rise), 0.6);
      box.position.copy(glued).lerp(rest, Math.min(1.05, p));
      box.rotation.set(0, Math.sin(Math.min(1, rise) * Math.PI) * 0.55, 0);
    } else {
      box.position.copy(rest);
      box.rotation.set(0, 0, 0);
    }
    // Life only once the box has left the placeholder: while glued it must match the DOM exactly.
    const alive = saturate(t * 4);
    const breathe = Math.sin(life * 1.6) * 0.0012 * alive;
    box.position.y += breathe + this.hop[0] * 0.02 * alive;
    const hoverScale = 1 + this.hover * 0.04 * alive;
    box.scale.setScalar(
      hoverScale * (1 + state.beat("c-open") * 0.08 * (1 - state.beat("c-gather"))),
    );
    if (dropped > 0) {
      const fall = dropped;
      const from = stage;
      const to = vec(BOX_REST.position).add(temp.set(0, SIZES.box.height / 2, 0));
      const bounce = Math.abs(Math.sin(fit(fall, 0.72, 1, 0, Math.PI * 2))) * (1 - fall) * 0.04;
      box.position
        .copy(from)
        .lerp(to, Math.min(1, fall * fall * 1.4))
        .add(temp.set(0, bounce, 0));
      box.rotation.set(
        fall * Math.PI * 2 * (1 - fall),
        MathUtils.degToRad(BOX_REST.yawDeg) * fall,
        0,
      );
      box.scale.setScalar(1);
      // The page colour dissolves from the box, the room fades in around it.
      const reveal = span(fall, 0.15, 0.85);
      const ndc = box.position.clone().project(camera);
      ctx.stage.backdrop.set({ paint: 1, reveal, origin: [ndc.x, ndc.y], edge: 0.5 });
      if (fall > 0.5) ctx.setHeaderTone("dark");
    }

    // --- the swarm (spring to gather)
    const swarm = this.swarm;
    if (swarm) {
      const inBox = state.beat("c-gather");
      const shown = state.beat("c-spring") > 0 && inBox < 1;
      swarm.visible = shown;
      if (shown) {
        const snake = state.span("c-snake", "c-fan");
        for (let i = 0; i < SWARM; i += 1) {
          const s = i / (SWARM - 1);
          const launch = fit(state.beat("c-spring"), s * 0.6, s * 0.6 + 0.4, 0, 1, expoOut);
          const q = life * 0.35 + snake * 3;
          dummy.position.set(
            stage.x - 0.05 + Math.sin(s * 9 + q) * 0.02,
            stage.y + Math.sin(s * Math.PI * 3 + snake * 6 + life * 0.8) * 0.06 * launch,
            stage.z + (s - 0.5) * 0.38 * launch,
          );
          dummy.position.lerp(stage, inBox * inBox);
          dummy.rotation.set(Math.sin(s * 7 + snake * 5) * 0.4, 0, Math.cos(s * 5 + life) * 0.3);
          dummy.scale.setScalar(Math.max(0.001, launch * (1 - inBox)));
          dummy.updateMatrix();
          swarm.setMatrixAt(i, dummy.matrix);
        }
        swarm.instanceMatrix.needsUpdate = true;
      }
    }

    // --- the four cards
    const drawn = state.beat("c-draw");
    const gather = state.beat("c-gather");
    const portrait = ctx.size.portrait;
    this.cards.forEach((card, index) => {
      const visible = drawn > 0 && gather < 0.7;
      card.visible = visible;
      if (!visible) return;
      const col = portrait ? index % 2 : index;
      const row = portrait ? Math.floor(index / 2) : 0;
      const gap = 0.012;
      const w = SIZES.card.width + gap;
      const h = SIZES.card.height + gap;
      const cols = portrait ? 2 : 4;
      const rows = portrait ? 2 : 1;
      const z = stage.z - (col - (cols - 1) / 2) * w;
      const y = stage.y - (row - (rows - 1) / 2) * h;
      const draw = fit(drawn, index * 0.12, index * 0.12 + 0.6, 0, 1, expoOut);
      const flip = fit(state.beat("c-turn"), index * 0.18, index * 0.18 + 0.4, 0, 1, cubicInOut);
      const back = fit(gather, 0, 0.25, 0, 1);
      card.position.set(stage.x + 0.06 * draw, mix(stage.y, y, draw), mix(stage.z, z, draw));
      card.position.lerp(stage, fit(gather, 0.3, 0.7, 0, 1));
      card.position.y += Math.sin(life * 1.2 + index) * 0.0015 * state.beat("c-turn");
      card.rotation.set(0, Math.PI * (1 - flip) + Math.PI * back, Math.sin(life + index) * 0.02);
      card.position.x += Math.sin(flip * Math.PI) * 0.02;
    });
    this.placeHotspots(ctx, state);

    // --- hints
    if (t > 0.9 && t < 1.12) ctx.overlay.setHint(STORY_HINTS.deckWaiting);
    const turn = state.beat("c-turn");
    if (turn > 0.92 && state.beat("c-hold") < 0.6) ctx.overlay.setHint(STORY_HINTS.cardsReady);

    // --- the label
    const label = this.label;
    if (label) {
      label.setText(beatText(state));
      label.object.visible = true;
      forward.subVectors(look, camera.position).normalize();
      label.object.position.copy(camera.position).addScaledVector(forward, 0.5);
      temp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const worldHeight = 2 * 0.5 * Math.tan(MathUtils.degToRad(camera.fov / 2));
      label.object.position.addScaledVector(temp, worldHeight * 0.38);
      label.object.scale.set(label.object.scale.x, label.object.scale.y, 1);
    }
  }

  /** The box's pose that puts its front face exactly on the DOM placeholder (the entrance glue). */
  private gluedPose(ctx: StoryContext, out: Vector3) {
    const rect = ctx.dom.rect("box");
    const camera = ctx.stage.camera;
    if (!rect) {
      out.copy(vec(CARD_STAGE.centre));
      return;
    }
    planeToRect(camera, rect, ctx.size, SIZES.box.width, out);
    // The face is the box's +x side: the centre sits half a depth further away.
    camera.getWorldDirection(forward);
    out.addScaledVector(forward, SIZES.box.depth / 2);
  }

  private poseResting() {
    this.box.position.copy(vec(BOX_REST.position)).add(temp.set(0, SIZES.box.height / 2, 0));
    this.box.rotation.set(0, MathUtils.degToRad(BOX_REST.yawDeg), 0);
    this.box.scale.setScalar(1);
  }

  private hideCards() {
    for (const card of this.cards) card.visible = false;
    if (this.swarm) this.swarm.visible = false;
    for (const spot of this.hotspots) spot.place(null);
  }

  private placeHotspots(ctx: StoryContext, state: ActState) {
    const ready = state.beat("c-turn") > 0.9 && state.beat("c-gather") === 0;
    const bounds = new Box3();
    this.cards.forEach((card, index) => {
      const spot = this.hotspots.at(index);
      if (!spot) return;
      if (!ready || !card.visible) {
        spot.place(null);
        return;
      }
      card.updateMatrixWorld();
      bounds.setFromObject(card);
      spot.place(projectBox(bounds, ctx.stage.camera, ctx.size));
    });
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent) {
    const mesh = this.boxMesh;
    if (!mesh) return false;
    const hit = event.raycast([mesh]).length > 0;
    if (event.type === "move" || event.type === "leave") {
      this.hover = hit && event.type === "move" ? 1 : 0;
      ctx.pointer.setCursor(hit ? "pointer" : null);
      return hit;
    }
    if (event.type === "tap" && hit) {
      this.hopTarget = 1;
      return true;
    }
    return false;
  }

  sleep() {
    this.group.visible = false;
    this.hideCards();
  }

  dispose() {
    this.group.removeFromParent();
    for (const texture of this.textures) texture.dispose();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.swarm?.dispose();
    this.label?.dispose();
    for (const spot of this.hotspots) spot.dispose();
  }
}

export function createAct(): StoryAct {
  return new CardsPlaceholder();
}
