import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  Group,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  NearestFilter,
  Quaternion,
  RGBAFormat,
  Ray,
  Vector3,
  type Raycaster,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { StoryLoaderLike, StoryTier } from "@/components/story/assets/types";
import {
  BRAND,
  LETTERS_BASE_URL,
  patchShader,
  tierPick,
} from "@/components/story/props/deck-shared";

/**
 * The toy letters on the coffee table: chunky extruded Hanken Grotesk
 * ExtraBold glyphs with rounded bevels, glossy plastic in the brand
 * colours, one mesh for the whole phrase (one draw call) with a transform
 * per letter read from a small float texture.
 *
 * Frame: the group's origin is the phrase's centre on the table (y = 0),
 * letters stand on the table reading along +x with their faces toward +z;
 * the second line stands one row behind the first (-z). Each letter's
 * pivot is the middle of its base, so drops, wobbles and hops turn about
 * the point that touches the table.
 *
 * Scrubbed motion (drops) is written by the act into `letter.position`,
 * `quaternion`, `scale` and `squash`, then `commit()`. The clock-driven
 * life (`poke`, `hop`, run by `update(dt)`) rides on top and never changes
 * the act's values.
 *
 * Size: the phrase fits `maxWidth` (default 34 cm, the two-line strip the
 * room research validated on the coffee table, research/room.md 2.4). At
 * that width the capitals are about 1.8 cm tall, not the 3 cm first
 * planned: a 3 cm cap makes the longer line 57 cm wide, wider than the
 * table's free strip and the toy close-up's frame.
 */

export const TOY_LETTERS_URL = `${LETTERS_BASE_URL}toy-letters.typeface.json`;
export const TOY_PHRASE: readonly string[] = ["We tell stories", "through interactive media."];
/** The widest validated strip for the letters on the coffee table (metres). */
export const TOY_LETTERS_MAX_WIDTH = 0.34;

const LETTER_COLOURS: readonly number[] = [BRAND.blue, BRAND.yellow, BRAND.red, BRAND.green];

export type ToyLettersOptions = {
  tier: StoryTier;
  lines?: readonly string[];
  /** Height of a capital, metres (3 cm unless `maxWidth` asks for less). */
  capHeight?: number;
  /**
   * The widest line's length limit, metres (default TOY_LETTERS_MAX_WIDTH):
   * the cap height shrinks so the phrase fits. Infinity keeps `capHeight`.
   */
  maxWidth?: number;
  /** Extrusion depth, metres. */
  depth?: number;
  /** Distance between rows (line 2 stands behind line 1), metres. */
  rowGap?: number;
  /** Extra space between letters as a share of the cap height (toy letters stand apart). */
  tracking?: number;
  colours?: readonly number[];
};

export type ToyLetter = {
  readonly index: number;
  readonly char: string;
  readonly line: number;
  /** The rest pose of the letter's pivot in the group frame. */
  readonly home: Vector3;
  /** Glyph size (width, height, depth) in metres. */
  readonly size: Vector3;
  readonly colour: Color;
  /** Live pose (group frame), written by the act; `commit()` uploads it. */
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  scale: number;
  /** Vertical squash about the base, 1 none (volume kept), for `letterDrop`'s impacts. */
  squash: number;
};

export type ToyLetters = {
  readonly group: Group;
  readonly mesh: Mesh;
  readonly letters: readonly ToyLetter[];
  /** The cap height used (after the width fit), metres. */
  readonly capHeight: number;
  /** Phrase extents on the table (x span, z span), metres. */
  readonly width: number;
  readonly depth: number;
  /** Uploads every letter's pose plus its reaction offsets. */
  commit(): void;
  /** Every letter back to its home pose. */
  reset(): void;
  /** A wobble (hover): the letter rocks on its base and settles. */
  poke(index: number, strength?: number): void;
  /** A hop (click): a small jump with a squash on landing. */
  hop(index: number, height?: number): void;
  /** Advances the reactions on the clock; call once a frame, then `commit()`. */
  update(dt: number): void;
  /** The letter under a ray (world space), or -1. */
  hit(raycaster: Raycaster): number;
  /** Changes the program (envMap define): call it before the stage compiles. */
  setEnvironment(texture: Texture | null, intensity?: number): void;
  dispose(): void;
};

/**
 * A drop onto the table with two bounces, as a pure function of progress:
 * height above the rest pose (metres) and a vertical squash (1 = none).
 * `progress` 0 is the release at `height`, 1 is settled.
 *
 * Every landing is a short contact on the table: the letter squashes and
 * springs back while its base stays down, so the squash never pops and
 * never shows in the air. In the air it stretches a little with its speed.
 * Both curves are continuous across every boundary.
 */
export function letterDrop(progress: number, height: number): { y: number; squash: number } {
  const p = Math.max(0, Math.min(1, progress));
  const segments = DROP_SEGMENTS;
  let t = p * DROP_TOTAL;
  const stretch = (speed: number) => 1 + DROP_STRETCH * speed;
  for (const seg of segments) {
    if (t > seg.duration && seg !== segments.at(-1)) {
      t -= seg.duration;
      continue;
    }
    const u = Math.min(1, t / seg.duration);
    switch (seg.kind) {
      case "fall":
        return { y: height * (1 - u * u), squash: stretch(u) };
      case "arc": {
        const k = u * 2 - 1;
        return { y: height * seg.peak * (1 - k * k), squash: stretch(seg.speed * Math.abs(k)) };
      }
      case "contact": {
        const carry = DROP_STRETCH * (seg.speedIn * (1 - u) * (1 - u) + seg.speedOut * u * u);
        return { y: 0, squash: 1 - seg.amount * Math.sin(Math.PI * u) + carry };
      }
      case "settle":
        return { y: 0, squash: 1 + 0.03 * (1 - u) * Math.sin(3 * Math.PI * u) };
    }
  }
  return { y: 0, squash: 1 };
}

type DropSegment =
  | { kind: "fall"; duration: number }
  | { kind: "arc"; duration: number; peak: number; speed: number }
  | { kind: "contact"; duration: number; amount: number; speedIn: number; speedOut: number }
  | { kind: "settle"; duration: number };

const DROP_STRETCH = 0.06;
/**
 * Durations in units of the fall's time, one gravity throughout (an arc's
 * time goes with the square root of its height); speeds are shares of the
 * first impact's.
 */
const DROP_SEGMENTS: readonly DropSegment[] = (() => {
  const v1 = Math.sqrt(0.3);
  const v2 = 0.3;
  return [
    { kind: "fall", duration: 1 },
    { kind: "contact", duration: 0.12, amount: 0.16, speedIn: 1, speedOut: v1 },
    { kind: "arc", duration: 2 * v1, peak: 0.3, speed: v1 },
    { kind: "contact", duration: 0.08, amount: 0.09, speedIn: v1, speedOut: v2 },
    { kind: "arc", duration: 2 * v2, peak: 0.09, speed: v2 },
    { kind: "contact", duration: 0.06, amount: 0.045, speedIn: v2, speedOut: 0 },
    { kind: "settle", duration: 0.3 },
  ];
})();
const DROP_TOTAL = DROP_SEGMENTS.reduce((sum, seg) => sum + seg.duration, 0);

/** Hands the main thread back between build steps (not throttled like a timer in a hidden tab). */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

type FontJson = FontData & {
  kern?: Record<string, number>;
  glyphs: Record<string, { ha: number }>;
};

const LETTER_VERTEX_DECL = /* glsl */ `
attribute float aLetter;
uniform sampler2D uLetters;
vec3 letterRotate(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
`;

const LETTER_NORMAL = /* glsl */ `
vec4 letterMove = texelFetch(uLetters, ivec2(int(aLetter) * 3, 0), 0);
vec4 letterTurn = texelFetch(uLetters, ivec2(int(aLetter) * 3 + 1, 0), 0);
vec4 letterSquash = texelFetch(uLetters, ivec2(int(aLetter) * 3 + 2, 0), 0);
objectNormal = letterRotate(letterTurn, normalize(objectNormal / letterSquash.xyz));
`;

const LETTER_POSITION = /* glsl */ `
transformed = letterRotate(letterTurn, transformed * letterSquash.xyz * letterMove.w) + letterMove.xyz;
`;

type Reaction = { wobble: number; wobbleVel: number; axis: number; hopT: number; hopH: number };

/**
 * Glyphs are built in millimetres and scaled down after the crease pass:
 * three's `toCreasedNormals` welds vertices on a 0.01 unit grid, which in
 * metres would weld whole letters into a few cells (slow, and smeared
 * normals).
 */
const BUILD_SCALE = 1000;
/** The longest stretch of build work between two yields to the main thread (ms). */
const SLICE_MS = 6;

/** Yields to the main thread once `budget` ms of work have passed since the last yield. */
function createSlicer(budget: number) {
  let since = performance.now();
  return async () => {
    if (performance.now() - since < budget) return;
    await yieldToMain();
    since = performance.now();
  };
}

export async function loadToyLetters(
  assets: StoryLoaderLike,
  options: ToyLettersOptions,
): Promise<ToyLetters> {
  const json = await assets.json<FontJson>(TOY_LETTERS_URL);
  const slice = createSlicer(SLICE_MS);
  const font = new Font(json);
  const lines = options.lines ?? TOY_PHRASE;
  const tracking = options.tracking ?? 0.08;
  const colours = options.colours ?? LETTER_COLOURS;
  const curveSegments = tierPick(options.tier, 5, 4, 3);
  const bevelSegments = tierPick(options.tier, 2, 1, 1);
  const kern = new Map(Object.entries(json.kern ?? {}));
  const advanceOf = new Map(Object.entries(json.glyphs).map(([ch, g]) => [ch, g.ha]));

  // Font units per cap height: a capital W is the cap height.
  const probe = new TextGeometry("W", {
    font,
    size: 1,
    depth: 0,
    curveSegments: 1,
    bevelEnabled: false,
  });
  probe.computeBoundingBox();
  const wHeight = probe.boundingBox ? probe.boundingBox.max.y - probe.boundingBox.min.y : 0.7;
  probe.dispose();
  const perCap = 1 / (wHeight * json.resolution);

  // Lay every line out at a cap height of 1 (advances, kerning and tracking all scale with it),
  // then fit the widest line to `maxWidth`.
  const missing = new Set<string>();
  const layouts = lines.map((text) => {
    const chars = [...text];
    const placed: { char: string; x: number }[] = [];
    let x = 0;
    let right = 0;
    chars.forEach((char, i) => {
      const ha = advanceOf.get(char);
      if (ha === undefined) {
        missing.add(char);
        return;
      }
      const next = chars.at(i + 1);
      const advance = (ha + (next ? (kern.get(char + next) ?? 0) : 0)) * perCap;
      if (char.trim() === "") {
        x += advance;
        return;
      }
      placed.push({ char, x });
      right = x + advance;
      x = right + tracking;
    });
    return { placed, width: right };
  });
  if (missing.size > 0 && process.env.NODE_ENV !== "production") {
    console.warn(
      `[toy-letters] no glyph for ${[...missing].map((c) => JSON.stringify(c)).join(", ")}`,
    );
  }
  const widest = Math.max(1e-6, ...layouts.map((layout) => layout.width));
  const capHeight = Math.min(
    options.capHeight ?? 0.03,
    (options.maxWidth ?? TOY_LETTERS_MAX_WIDTH) / widest,
  );
  const depth = options.depth ?? capHeight * 0.4;
  const rowGap = options.rowGap ?? capHeight * 1.5;
  const size = capHeight / wHeight;
  const bevel = capHeight * 0.06;
  const k = BUILD_SCALE;

  // Build each distinct glyph once (the phrase repeats most of its letters), in short slices.
  const cache = new Map<string, { geometry: BufferGeometry; box: Box3 }>();
  for (const char of new Set(layouts.flatMap((layout) => layout.placed.map((item) => item.char)))) {
    const raw = new TextGeometry(char, {
      font,
      size: size * k,
      depth: (depth - bevel * 2) * k,
      curveSegments,
      bevelEnabled: true,
      bevelThickness: bevel * k,
      bevelSize: bevel * 0.8 * k,
      bevelOffset: -bevel * 0.8 * k,
      bevelSegments,
    });
    raw.computeBoundingBox();
    const box = raw.boundingBox?.clone() ?? new Box3();
    // Pivot = the middle of the glyph's base: every letter sits on its own lowest point.
    raw.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    raw.deleteAttribute("uv");
    // Smooth bevels, crisp edges between the face and the bevel.
    const geometry = toCreasedNormals(raw, Math.PI / 5);
    if (geometry !== raw) raw.dispose();
    geometry.scale(1 / k, 1 / k, 1 / k);
    box.min.divideScalar(k);
    box.max.divideScalar(k);
    cache.set(char, { geometry, box });
    await slice();
  }

  // One buffer for the phrase, written glyph by glyph (no clones, no merge pass).
  let total = 0;
  for (const layout of layouts) {
    for (const item of layout.placed)
      total += cache.get(item.char)?.geometry.getAttribute("position").count ?? 0;
  }
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colourData = new Float32Array(total * 3);
  const letterIds = new Float32Array(total);
  const letters: ToyLetter[] = [];
  const bounds: Box3[] = [];
  let written = 0;
  let colourIndex = 0;
  for (const [line, layout] of layouts.entries()) {
    const offset = (-layout.width * capHeight) / 2;
    for (const item of layout.placed) {
      const glyph = cache.get(item.char);
      if (!glyph) continue;
      const position = glyph.geometry.getAttribute("position");
      const normal = glyph.geometry.getAttribute("normal");
      const count = position.count;
      positions.set(position.array, written * 3);
      normals.set(normal.array, written * 3);
      const index = letters.length;
      letterIds.fill(index, written, written + count);
      const colour = new Color(colours.at(colourIndex % colours.length) ?? BRAND.blue);
      colourIndex += 1;
      for (let v = written; v < written + count; v++) {
        colourData[v * 3] = colour.r;
        colourData[v * 3 + 1] = colour.g;
        colourData[v * 3 + 2] = colour.b;
      }
      written += count;
      const { box } = glyph;
      const left = item.x * capHeight;
      // The glyph's own left bearing: its box starts where the outline does, not at the pen.
      const home = new Vector3(offset + left + (box.min.x + box.max.x) / 2, 0, -line * rowGap);
      const sizeVec = new Vector3(
        box.max.x - box.min.x,
        box.max.y - box.min.y,
        box.max.z - box.min.z,
      );
      bounds.push(
        new Box3(
          new Vector3(-sizeVec.x / 2, 0, -sizeVec.z / 2),
          new Vector3(sizeVec.x / 2, sizeVec.y, sizeVec.z / 2),
        ),
      );
      letters.push({
        index,
        char: item.char,
        line,
        home,
        size: sizeVec,
        colour,
        position: home.clone(),
        quaternion: new Quaternion(),
        scale: 1,
        squash: 1,
      });
      await slice();
    }
  }
  for (const glyph of cache.values()) glyph.geometry.dispose();
  const merged = new BufferGeometry();
  merged.setAttribute("position", new BufferAttribute(positions, 3));
  merged.setAttribute("normal", new BufferAttribute(normals, 3));
  merged.setAttribute("color", new BufferAttribute(colourData, 3));
  merged.setAttribute("aLetter", new BufferAttribute(letterIds, 1));

  // Three texels per letter: position + scale, rotation, squash (x, y, z).
  const count = letters.length;
  const data = new Float32Array(count * 3 * 4);
  const poseTexture = new DataTexture(data, count * 3, 1, RGBAFormat, FloatType);
  poseTexture.minFilter = NearestFilter;
  poseTexture.magFilter = NearestFilter;
  poseTexture.generateMipmaps = false;
  poseTexture.needsUpdate = true;

  const material = new MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1,
  });
  material.name = "story-toy-letters";
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uLetters = { value: poseTexture };
    shader.vertexShader = patchShader(shader.vertexShader, [
      ["after", "common", LETTER_VERTEX_DECL],
      ["after", "beginnormal_vertex", LETTER_NORMAL],
      ["after", "begin_vertex", LETTER_POSITION],
    ]);
  };
  material.customProgramCacheKey = () => "story-toy-letters-v1";

  const mesh = new Mesh(merged, material);
  mesh.name = "story-toy-letters";
  // Vertices are stored about each letter's pivot, so the geometry's own bounds mean nothing.
  mesh.frustumCulled = false;
  const group = new Group();
  group.name = "story-toy-letters";
  group.add(mesh);

  const reactions: Reaction[] = letters.map((letter) => ({
    wobble: 0,
    wobbleVel: 0,
    axis: letter.index % 2 === 0 ? 1 : -1,
    hopT: -1,
    hopH: 0,
  }));

  const turn = new Quaternion();
  const tilt = new Quaternion();
  const zAxis = new Vector3(0, 0, 1);
  const commit = () => {
    for (const letter of letters) {
      const r = reactions.at(letter.index);
      let lift = 0;
      let squashY = 1;
      if (r) {
        if (r.hopT >= 0 && r.hopT < 1) {
          lift = r.hopH * 4 * r.hopT * (1 - r.hopT);
        }
        if (r.hopT >= 1 && r.hopT < 1.25)
          squashY = 1 - 0.12 * Math.sin(((r.hopT - 1) / 0.25) * Math.PI);
      }
      tilt.setFromAxisAngle(zAxis, (r?.wobble ?? 0) * (r?.axis ?? 1));
      turn.copy(letter.quaternion).multiply(tilt);
      const o = letter.index * 12;
      data.set([letter.position.x, letter.position.y + lift, letter.position.z, letter.scale], o);
      data.set([turn.x, turn.y, turn.z, turn.w], o + 4);
      const squash = squashY * Math.max(0.05, letter.squash);
      const stretch = 1 / Math.sqrt(squash);
      data.set([stretch, squash, stretch, 1], o + 8);
    }
    poseTexture.needsUpdate = true;
  };
  commit();

  const inverse = new Matrix4();
  const letterMatrix = new Matrix4();
  const localRay = new Ray();
  const hitPoint = new Vector3();
  const unitScale = new Vector3();

  const toy: ToyLetters = {
    group,
    mesh,
    letters,
    capHeight,
    width: widest * capHeight,
    depth: (lines.length - 1) * rowGap + depth,
    commit,
    reset() {
      for (const letter of letters) {
        letter.position.copy(letter.home);
        letter.quaternion.identity();
        letter.scale = 1;
        letter.squash = 1;
      }
      commit();
    },
    poke(index, strength = 1) {
      const r = reactions.at(index);
      if (r) r.wobbleVel += 5.5 * strength * (Math.abs(r.wobble) < 0.02 ? 1 : 0.4);
    },
    hop(index, height = capHeight * 0.9) {
      const r = reactions.at(index);
      if (r && (r.hopT < 0 || r.hopT > 0.9)) {
        r.hopT = 0;
        r.hopH = height;
        r.wobbleVel += 2.5;
      }
    },
    update(dt) {
      const step = Math.min(dt, 1 / 30);
      for (const r of reactions) {
        // A stiff, lightly damped spring: a toy rocking on its base.
        const accel = -170 * r.wobble - 7 * r.wobbleVel;
        r.wobbleVel += accel * step;
        r.wobble += r.wobbleVel * step;
        if (r.hopT >= 0) {
          r.hopT += step / 0.42;
          if (r.hopT > 1.25) r.hopT = -1;
        }
      }
    },
    hit(raycaster) {
      group.updateMatrixWorld();
      let best = -1;
      let bestDistance = Infinity;
      for (const letter of letters) {
        unitScale.setScalar(letter.scale);
        letterMatrix
          .compose(letter.position, letter.quaternion, unitScale)
          .premultiply(group.matrixWorld);
        inverse.copy(letterMatrix).invert();
        localRay.copy(raycaster.ray).applyMatrix4(inverse);
        const box = bounds.at(letter.index);
        if (box && localRay.intersectBox(box, hitPoint)) {
          const distance = hitPoint.applyMatrix4(letterMatrix).distanceTo(raycaster.ray.origin);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = letter.index;
          }
        }
      }
      return best;
    },
    setEnvironment(texture, intensity = 1) {
      material.envMap = texture;
      material.envMapIntensity = intensity;
      material.needsUpdate = true;
    },
    dispose() {
      merged.dispose();
      material.dispose();
      poseTexture.dispose();
      group.removeFromParent();
    },
  };
  return toy;
}
