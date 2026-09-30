import {
  Box3,
  BufferAttribute,
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
  type BufferGeometry,
  type Raycaster,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
 * `quaternion` and `scale`, then `commit()`. The clock-driven life
 * (`poke`, `hop`, run by `update(dt)`) rides on top and never changes the
 * act's values.
 */

export const TOY_LETTERS_URL = `${LETTERS_BASE_URL}toy-letters.typeface.json`;
export const TOY_PHRASE: readonly string[] = ["We tell stories", "through interactive media."];

const LETTER_COLOURS: readonly number[] = [BRAND.blue, BRAND.yellow, BRAND.red, BRAND.green];

export type ToyLettersOptions = {
  tier: StoryTier;
  lines?: readonly string[];
  /** Height of a capital, metres (the W is 3 cm by default). */
  capHeight?: number;
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
};

export type ToyLetters = {
  readonly group: Group;
  readonly mesh: Mesh;
  readonly letters: readonly ToyLetter[];
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
 * height above the rest pose (metres) and a squash factor (1 = none).
 * `progress` 0 is the release at `height`, 1 is settled.
 */
export function letterDrop(progress: number, height: number): { y: number; squash: number } {
  const p = Math.max(0, Math.min(1, progress));
  // A fall, then bounces to 30% and 9% of the height, all under one gravity: a segment's time
  // goes with the square root of its height.
  const fall = Math.sqrt(height);
  const bounce1 = 2 * Math.sqrt(height * 0.3);
  const bounce2 = 2 * Math.sqrt(height * 0.09);
  const settle = (fall + bounce1 + bounce2) * 0.12;
  let t = p * (fall + bounce1 + bounce2 + settle);
  if (t < fall) {
    const k = t / fall;
    return { y: height * (1 - k * k), squash: 1 };
  }
  t -= fall;
  const arc = (duration: number, peak: number, squash: number) => {
    const k = (t / duration) * 2 - 1;
    const impact = Math.max(0, 1 - (t / duration) * 8) + Math.max(0, 1 - (1 - t / duration) * 8);
    return { y: peak * (1 - k * k), squash: 1 - impact * squash };
  };
  if (t < bounce1) return arc(bounce1, height * 0.3, 0.14);
  t -= bounce1;
  if (t < bounce2) return arc(bounce2, height * 0.09, 0.06);
  t -= bounce2;
  const rest = Math.max(0, 1 - t / settle);
  return { y: 0, squash: 1 - rest * 0.03 * Math.sin(rest * Math.PI * 3) };
}

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

export async function loadToyLetters(
  assets: StoryLoaderLike,
  options: ToyLettersOptions,
): Promise<ToyLetters> {
  const json = await assets.json<FontJson>(TOY_LETTERS_URL);
  const font = new Font(json);
  const lines = options.lines ?? TOY_PHRASE;
  const capHeight = options.capHeight ?? 0.03;
  const depth = options.depth ?? capHeight * 0.4;
  const rowGap = options.rowGap ?? capHeight * 1.5;
  const tracking = options.tracking ?? 0.08;
  const colours = options.colours ?? LETTER_COLOURS;
  const curveSegments = tierPick(options.tier, 5, 4, 3);
  const bevelSegments = tierPick(options.tier, 2, 2, 1);

  // Scale the typeface so a capital W is `capHeight` tall.
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
  const size = capHeight / wHeight;
  const unit = size / json.resolution;
  const bevel = capHeight * 0.06;

  const glyphs: BufferGeometry[] = [];
  const letters: ToyLetter[] = [];
  const bounds: Box3[] = [];
  const kern = new Map(Object.entries(json.kern ?? {}));
  const advanceOf = new Map(Object.entries(json.glyphs).map(([ch, g]) => [ch, g.ha]));
  let colourIndex = 0;
  const rowWidths: number[] = [];

  // Build each distinct glyph once (the phrase repeats most of its letters), yielding to the
  // main thread between glyphs so the build never holds a long task.
  const cache = new Map<string, { geometry: BufferGeometry; box: Box3 }>();
  const distinct = [...new Set(lines.join(""))].filter((char) => char.trim() !== "");
  for (const char of distinct) {
    const raw = new TextGeometry(char, {
      font,
      size,
      depth: depth - bevel * 2,
      curveSegments,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel * 0.8,
      bevelOffset: -bevel * 0.8,
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
    cache.set(char, { geometry, box });
    await yieldToMain();
  }

  lines.forEach((text, line) => {
    const chars = [...text];
    let x = 0;
    const placed: { char: string; x: number; box: Box3; geometry: BufferGeometry }[] = [];
    chars.forEach((char, i) => {
      const next = chars.at(i + 1);
      const advance =
        (advanceOf.get(char) ?? 0) * unit + (next ? (kern.get(char + next) ?? 0) * unit : 0);
      const glyph = cache.get(char);
      if (glyph) {
        placed.push({ char, x, box: glyph.box, geometry: glyph.geometry });
        x += advance + capHeight * tracking;
      } else {
        x += advance;
      }
    });
    rowWidths.push(x);
    const offset = -x / 2;
    for (const item of placed) {
      const cx = (item.box.min.x + item.box.max.x) / 2;
      const instance = item.geometry.clone();
      const index = letters.length;
      const count = instance.getAttribute("position").count;
      instance.setAttribute("aLetter", new BufferAttribute(new Float32Array(count).fill(index), 1));
      const colour = new Color(colours.at(colourIndex % colours.length) ?? BRAND.blue);
      colourIndex += 1;
      const rgb = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) rgb.set([colour.r, colour.g, colour.b], v * 3);
      instance.setAttribute("color", new BufferAttribute(rgb, 3));
      glyphs.push(instance);
      const home = new Vector3(offset + item.x + cx, 0, -line * rowGap);
      const sizeVec = new Vector3(
        item.box.max.x - item.box.min.x,
        item.box.max.y - item.box.min.y,
        item.box.max.z - item.box.min.z,
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
      });
    }
  });
  for (const glyph of cache.values()) glyph.geometry.dispose();

  // mergeGeometries returns null when the attributes disagree (its typings do not say so).
  const merged = mergeGeometries(glyphs, false) as BufferGeometry | null;
  for (const g of glyphs) g.dispose();
  if (!merged) throw new Error("toy letters: could not merge the glyphs");

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
      const stretch = 1 / Math.sqrt(squashY);
      data.set([stretch, squashY, stretch, 1], o + 8);
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
    width: Math.max(...rowWidths),
    depth: (lines.length - 1) * rowGap + depth,
    commit,
    reset() {
      for (const letter of letters) {
        letter.position.copy(letter.home);
        letter.quaternion.identity();
        letter.scale = 1;
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
