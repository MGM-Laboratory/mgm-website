import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Vector3,
  type BufferGeometry,
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
  STORY_LAYERS,
  cubicInOut,
  fit,
  mix,
  type ActState,
  type StoryAct,
  type StoryContext,
  type StoryLabel,
} from "@/components/story/engine/act";
import {
  FIGURE_SPOT,
  SHOT_LAND,
  SIZES,
  TABLE_TOP,
  fovForAspect,
} from "@/components/story/engine/frame";

/**
 * PLACEHOLDER for Act 2 (the roomact package replaces it). A dusk room of
 * boxes on the `behind` layer (so the card act's drop dissolves into it), a
 * capsule for Godette on her figure spot, a TV that wakes up, and a camera
 * move per beat ending in a zoom through the screen.
 */

const TV = { centre: new Vector3(-1.6, 1.0, -0.62), width: 1.1, height: 0.64 };

class RoomPlaceholder implements StoryAct {
  readonly id = "room" as const;
  private readonly group = new Group();
  private readonly figure = new Group();
  private screen: MeshBasicMaterial | null = null;
  private label: StoryLabel | null = null;
  private readonly lamp = new PointLight(0xffb36b, 2.5, 4, 1.6);
  private readonly materials: Material[] = [];
  private readonly geometries: BufferGeometry[] = [];

  async init(ctx: StoryContext) {
    await placeholderLights(ctx);
    const add = (geometry: BufferGeometry, material: Material, x: number, y: number, z: number) => {
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.layers.set(STORY_LAYERS.behind);
      this.group.add(mesh);
      return mesh;
    };
    const wall = new MeshStandardMaterial({ color: 0x3b3346, roughness: 0.9 });
    const floor = new MeshStandardMaterial({ color: 0x5a4636, roughness: 0.8 });
    const wood = new MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.6 });
    const sofa = new MeshStandardMaterial({ color: 0x2b4f7a, roughness: 0.85 });
    const dark = new MeshStandardMaterial({ color: 0x111318, roughness: 0.4 });
    this.screen = new MeshBasicMaterial({ color: 0x05060a, toneMapped: false });
    this.materials.push(wall, floor, wood, sofa, dark, this.screen);
    const floorGeometry = new PlaneGeometry(8, 8).rotateX(-Math.PI / 2);
    const wallGeometry = new PlaneGeometry(8, 3.2).rotateY(Math.PI / 2);
    const table = new BoxGeometry(0.9, 0.06, 0.55);
    const leg = new BoxGeometry(0.04, TABLE_TOP.y - 0.06, 0.04);
    const couch = new BoxGeometry(0.9, 0.5, 2.2);
    const tvBody = new BoxGeometry(0.06, TV.height + 0.06, TV.width + 0.06);
    const tvScreen = new PlaneGeometry(TV.width, TV.height).rotateY(Math.PI / 2);
    this.geometries.push(floorGeometry, wallGeometry, table, leg, couch, tvBody, tvScreen);
    add(floorGeometry, floor, 0, 0, -0.8);
    add(wallGeometry, wall, -1.7, 1.6, -0.8);
    const [cx, , cz] = TABLE_TOP.centre;
    add(table, wood, cx, TABLE_TOP.y - 0.03, cz);
    for (const [dx, dz] of [
      [-0.4, -0.24],
      [0.4, -0.24],
      [-0.4, 0.24],
      [0.4, 0.24],
    ] as const) {
      add(leg, wood, cx + dx, (TABLE_TOP.y - 0.06) / 2, cz + dz);
    }
    add(couch, sofa, 1.9, 0.25, -0.8);
    add(tvBody, dark, TV.centre.x - 0.04, TV.centre.y, TV.centre.z);
    add(tvScreen, this.screen, TV.centre.x, TV.centre.y, TV.centre.z);
    this.lamp.position.set(0.9, 1.6, 0.4);
    this.lamp.layers.enableAll();
    this.group.add(this.lamp);

    const body = new CapsuleGeometry(0.018, 0.1, 6, 12);
    const skin = new MeshStandardMaterial({ color: 0xf7bf33, roughness: 0.5 });
    const base = new BoxGeometry(0.05, 0.008, 0.05);
    this.geometries.push(body, base);
    this.materials.push(skin);
    const capsule = new Mesh(body, skin);
    capsule.position.y = 0.075;
    const stand = new Mesh(base, dark);
    stand.position.y = 0.004;
    capsule.layers.set(STORY_LAYERS.behind);
    stand.layers.set(STORY_LAYERS.behind);
    this.figure.add(capsule, stand);
    this.group.add(this.figure);

    this.label = await beatLabel(ctx, 0.02, "#0e1116");
    this.group.add(this.label.object);
    this.group.visible = false;
    ctx.stage.rootScene.add(this.group);
    await ctx.stage.compile();
  }

  update(ctx: StoryContext, state: ActState) {
    this.group.visible = true;
    const box = ctx.props.get("placeholderBox");
    if (box && state.active) {
      // The card box stays where it landed.
      box.visible = true;
    }
    const life = ctx.clock.time;
    const [fx, fy, fz] = FIGURE_SPOT;
    // Godette: frozen, breaks, gets dragged up, learns, flies to the TV.
    const up = state.span("r-dragged", "r-learn");
    const toTv = cubicInOut(state.span("r-tv", "r-dive"));
    const figurePos = new Vector3(fx, fy, fz);
    figurePos.y += up * 0.35 + Math.sin(life * 3) * 0.01 * up;
    figurePos.lerp(TV.centre, toTv);
    this.figure.position.copy(figurePos);
    this.figure.rotation.z =
      Math.sin(life * 6) * 0.25 * state.beat("r-dragged") * (1 - state.beat("r-learn"));
    this.figure.rotation.y = state.beat("r-break") * Math.PI * 0.5 + life * 0.3 * up;
    this.figure.scale.setScalar((SIZES.figureHeight / 0.14) * (1 - toTv * 0.7));

    // The TV wakes up.
    const on = state.beat("r-tv");
    this.screen?.color.setRGB(mix(0.02, 0.35, on), mix(0.02, 0.2, on), mix(0.04, 0.9, on));
    this.lamp.intensity = 2.5 * fit(state.beat("r-land"), 0, 0.6, 0.3, 1);

    if (!state.active) {
      if (this.label) this.label.object.visible = false;
      return;
    }
    ctx.stage.backdrop.set({ reveal: 1 });
    ctx.setHeaderTone("dark");

    // Camera: the landing shot, the toy close-up, the chase, the dive.
    const { camera } = ctx.stage;
    const land = vec(SHOT_LAND.position);
    const landTarget = vec(SHOT_LAND.target);
    const closeUp = new Vector3(fx + 0.32, fy + 0.09, fz + 0.06);
    const toy = new Vector3(fx, fy + 0.07, fz);
    const figureShot = cubicInOut(state.beat("r-figure"));
    const pos = land.clone().lerp(closeUp, figureShot);
    const look = landTarget.clone().lerp(toy, figureShot);
    const chase = cubicInOut(state.span("r-dragged", "r-tv"));
    pos.lerp(figurePos.clone().add(new Vector3(0.5, 0.12, 0.25)), chase * 0.8);
    look.lerp(figurePos, chase);
    const dive = state.beat("r-dive");
    pos.lerp(TV.centre.clone().add(new Vector3(0.05, 0, 0)), cubicInOut(dive));
    look.lerp(TV.centre.clone().add(new Vector3(-1, 0, 0)), dive);
    const landFov = fovForAspect(
      SHOT_LAND.fovLandscapeDeg,
      SHOT_LAND.fovPortraitDeg,
      ctx.size.aspect,
    );
    aim(camera, pos, look, mix(landFov, 30, figureShot));
    // Handheld energy while she is dragged.
    const shake = state.beat("r-dragged") * (1 - state.beat("r-learn")) * 0.004;
    camera.position.x += Math.sin(life * 17) * shake;
    camera.position.y += Math.sin(life * 23 + 1) * shake;
    camera.updateMatrixWorld();
    ctx.stage.post.set({ vignette: 0.35, flash: fit(dive, 0.8, 1, 0, 1) });

    const label = this.label;
    if (label) {
      label.setText(beatText(state));
      label.object.visible = true;
      const forward = look.clone().sub(camera.position).normalize();
      label.object.position.copy(camera.position).addScaledVector(forward, 0.4);
      const upVector = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const worldHeight = 2 * 0.4 * Math.tan(MathUtils.degToRad(camera.fov / 2));
      label.object.position.addScaledVector(upVector, worldHeight * 0.38);
      const scale = worldHeight * 0.06;
      label.object.scale.multiplyScalar(scale / label.object.scale.y);
    }
  }

  sleep() {
    this.group.visible = false;
  }

  dispose() {
    this.group.removeFromParent();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.label?.dispose();
  }
}

export function createAct(): StoryAct {
  return new RoomPlaceholder();
}
