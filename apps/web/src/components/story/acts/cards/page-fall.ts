import {
  DoubleSide,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from "three";

import { seededRandom, type StoryScheme } from "@/components/story/engine/act";
import { CARD_H, CARD_W } from "@/components/story/props/card-mesh";
import { STAR_SDF_GLSL } from "@/components/story/props/fx/star-sdf.glsl";

/** Drop progress at which the first tile lets go, the wave's spread, a tile's jitter and its fall. */
const START = 0.08;
const SPREAD = 0.24;
const JITTER = 0.03;
const FALL = 0.19;
/** The tiles' own vertical field of view (degrees). */
const TILE_FOV = 46;
/** The card back's navy. */
const BACK = 0x2d318a;

/**
 * "The box falls, and the page falls with it" (CREATIVE 1.2): the page
 * breaks into card-shaped tiles that tip toward the lens and drop with
 * gravity, in a wave from where the box left, and the lit room shows behind
 * them. It replaces the plain dissolve for the deck's fall: the tiles are
 * the page (its exact colour while they lie flat), so the switch from the
 * painted page to the tiles is invisible, and the way back reassembles the
 * page exactly.
 *
 * The tiles live in the camera's own space (they ride the lens through the
 * crane), one instanced draw, every pose a pure function of `progress`.
 * They draw over the whole room but under the box: in the stage's single
 * pass (the reveal complete) they sit at render order 1 with no depth test,
 * after the room's opaque meshes and before the box, whose root the act
 * lifts to group order 2 for the fall.
 */

const VERTEX = /* glsl */ `
precision highp float;
in vec4 aTile;
in vec4 aSeed;
uniform vec2 uHalf;
uniform vec2 uSize;
uniform float uProgress;
uniform vec2 uOrigin;
uniform float uSpread;
uniform float uDistance;
uniform vec4 uCursor;
uniform vec2 uFocal;
out vec2 vUv;
out float vShade;
out float vCrack;
out float vTilt;
void main() {
  vUv = uv;
  // aTile: centre in NDC (x, y), the tile's share of the wave (0 near the box, 1 at the far corner).
  float start = ${START.toFixed(3)} + uSpread * aTile.z + aSeed.x * ${JITTER.toFixed(3)};
  float k = clamp((uProgress - start) / ${FALL.toFixed(3)}, 0.0, 1.0);
  vCrack = smoothstep(start - 0.035, start, uProgress) * (1.0 - k);
  // The cursor lifts the loose tiles near it a little (life, never the story).
  float near = uCursor.z * exp(-dot((aTile.xy - uCursor.xy) * vec2(uCursor.w, 1.0), (aTile.xy - uCursor.xy) * vec2(uCursor.w, 1.0)) / 0.02);
  float lift = near * vCrack * 0.35;
  // Tips toward the lens about its top edge, then falls away down the screen.
  float tip = (k * k * (2.2 + aSeed.y * 1.4) + lift) * 1.5708;
  float spin = (aSeed.z - 0.5) * 1.6 * k * k;
  vTilt = clamp(abs(tip) / 0.3 + abs(spin) * 2.0, 0.0, 1.0);
  vec3 p = vec3(position.x * uSize.x, position.y * uSize.y, 0.0);
  // The hinge is the top edge: move it there, turn, move back.
  p.y -= uSize.y * 0.5;
  float c = cos(tip);
  float s = sin(tip);
  p = vec3(p.x, p.y * c, -p.y * s);
  p.y += uSize.y * 0.5;
  float cz = cos(spin);
  float sz = sin(spin);
  p.xy = vec2(p.x * cz - p.y * sz, p.x * sz + p.y * cz);
  vec3 n = vec3(0.0, s, c);
  n.xy = vec2(n.x * cz - n.y * sz, n.x * sz + n.y * cz);
  // Lambert from above the lens, so a tile turning down to us goes into its own shadow.
  vShade = clamp(0.55 + 0.45 * dot(normalize(n), normalize(vec3(0.15, 0.75, 0.65))), 0.0, 1.0);
  // Gravity: half a screen in the first half of the fall, gone off the bottom by its end.
  float drop = k * k * (2.6 + aSeed.w * 0.9);
  float drift = (aSeed.z - 0.5) * 0.35 * k + (aTile.x - uOrigin.x) * 0.25 * k * k;
  vec2 centre = (aTile.xy + vec2(drift, -drop)) * uHalf;
  vec3 view = vec3(centre + p.xy, -uDistance + p.z);
  // Overlap flat tiles a hair so the page never shows a seam.
  view.xy += position.xy * uSize * 0.004 * (1.0 - k);
  // The tiles' own lens (wider than the long lens of the card stage, so a tipping tile shows its
  // depth): the flat grid at uDistance still spans the screen exactly. Depth is not used.
  gl_Position = vec4(view.x * uFocal.x, view.y * uFocal.y, 0.0, -view.z);
  if (k >= 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
${STAR_SDF_GLSL}
uniform vec3 uPage;
uniform vec3 uShadow;
uniform vec3 uLine;
uniform vec3 uBack;
uniform vec2 uTileAspect;
in vec2 vUv;
in float vShade;
in float vCrack;
in float vTilt;
layout(location = 0) out highp vec4 outColor;
void main() {
  // Flat: the page's own bytes. Turning: shaded, and the back a touch deeper.
  vec3 lit = mix(uShadow, uPage, vShade);
  vec3 colour = mix(uPage, lit, vTilt);
  vec2 e = min(vUv, 1.0 - vUv) * uTileAspect;
  float edge = min(e.x, e.y);
  float w = fwidth(edge) * 1.2;
  if (!gl_FrontFacing) {
    // The back: the page was a deck all along. Navy, a white frame and the compass star.
    vec3 back = uBack * (0.62 + 0.38 * vShade);
    float frame = smoothstep(w, 0.0, abs(edge - 0.11)) * 0.85;
    vec2 q = (vUv - 0.5) * uTileAspect * 2.0;
    float star = sdStar4Rot(q / 0.34, 0.92, 0.314, 0.0);
    float starFill = 1.0 - smoothstep(-0.02, 0.02 + fwidth(star), star);
    colour = mix(back, vec3(0.93, 0.93, 0.95) * (0.7 + 0.3 * vShade), max(frame, starFill * 0.9));
    outColor = vec4(colour, 1.0);
    return;
  }
  // The crack: a hairline along the tile's edge just before it lets go.
  float line = (1.0 - smoothstep(0.0, w, edge)) * max(vCrack, vTilt * 0.6);
  colour = mix(colour, uLine, line * 0.55);
  outColor = vec4(colour, 1.0);
}
`;

/** sRGB 0..1 channels of 0xRRGGBB, untouched by colour management. */
function srgb(hex: number, out: Vector3) {
  return out.set(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

export class PageFall {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly material: ShaderMaterial;
  private key = "";
  private cols = 0;
  private rows = 0;
  private readonly cursor = new Vector4(0, 0, 0, 1);

  constructor() {
    const base = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.instanceCount = 0;
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uHalf: { value: new Vector2(1, 1) },
        uSize: { value: new Vector2(0.1, 0.1) },
        uProgress: { value: 0 },
        uOrigin: { value: new Vector2() },
        uSpread: { value: SPREAD },
        uFocal: { value: new Vector2(1, 1) },
        uBack: { value: new Vector3() },
        uTileAspect: { value: new Vector2(1, 1) },
        uDistance: { value: 1 },
        uCursor: { value: this.cursor },
        uPage: { value: new Vector3() },
        uShadow: { value: new Vector3() },
        uLine: { value: new Vector3() },
      },
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      toneMapped: false,
    });
    this.material.name = "cards-page-fall";
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = "cards-page-fall";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  /** Builds the tile grid for this viewport: card-shaped tiles about 1/26 of the width. */
  private layout(width: number, height: number, origin: Vector2) {
    const key = `${width}x${height}`;
    if (key === this.key) return;
    this.key = key;
    const aspect = CARD_W / CARD_H;
    const cols = Math.max(6, Math.round(width / Math.max(38, width / 26)));
    const tileW = width / cols;
    const rows = Math.ceil(height / (tileW / aspect));
    this.cols = cols;
    this.rows = rows;
    const count = cols * rows;
    const tiles = new Float32Array(count * 4);
    const seeds = new Float32Array(count * 4);
    const random = seededRandom(0xfa11);
    let far = 0;
    const ox = origin.x * (width / height);
    const oy = origin.y;
    const places: number[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        // NDC centre; the grid is anchored to the top edge (the last row may run off the bottom).
        const x = -1 + ((c + 0.5) * 2) / cols;
        const y = 1 - ((r + 0.5) * 2 * (tileW / aspect)) / height;
        const d = Math.hypot(x * (width / height) - ox, y - oy);
        far = Math.max(far, d);
        places.push(x, y, d);
      }
    }
    for (let i = 0; i < count; i += 1) {
      const x = places.at(i * 3) ?? 0;
      const y = places.at(i * 3 + 1) ?? 0;
      const d = places.at(i * 3 + 2) ?? 0;
      tiles.set([x, y, d / Math.max(1e-3, far), 0], i * 4);
      seeds.set([random(), random(), random(), random()], i * 4);
    }
    const geometry = this.mesh.geometry;
    geometry.setAttribute("aTile", new InstancedBufferAttribute(tiles, 4));
    geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 4));
    geometry.instanceCount = count;
  }

  /** Shows every tile flat once, for a compile pass. */
  warm(on: boolean) {
    this.mesh.visible = on;
  }

  /**
   * One frame of the fall. `progress` is the drop's (0..1); `origin` the box's
   * place on screen when it let go (NDC). Returns how much of the page has
   * gone (0 whole, 1 every tile fallen).
   */
  update(
    size: { width: number; height: number },
    progress: number,
    origin: Vector2,
    scheme: StoryScheme,
    page: number,
    pointer: { x: number; y: number; inside: boolean },
  ) {
    this.layout(size.width, size.height, origin);
    const u = this.material.uniforms;
    const distance = 1;
    const aspect = size.width / Math.max(1, size.height);
    const tanHalf = Math.tan((TILE_FOV * Math.PI) / 360);
    (u.uFocal.value as Vector2).set(1 / (tanHalf * aspect), 1 / tanHalf);
    (u.uHalf.value as Vector2).set(distance * tanHalf * aspect, distance * tanHalf);
    // A tile's size in camera units: the grid spans the view exactly in width.
    const tileW = (2 * distance * tanHalf * aspect) / Math.max(1, this.cols);
    const tileH = tileW / (CARD_W / CARD_H);
    (u.uSize.value as Vector2).set(tileW, tileH);
    // UV units scaled to the tile's shorter side, so the back's frame is even all round.
    (u.uTileAspect.value as Vector2).set(1, tileH / tileW);
    srgb(BACK, u.uBack.value as Vector3);
    u.uProgress.value = progress;
    (u.uOrigin.value as Vector2).copy(origin);
    u.uDistance.value = distance;
    this.cursor.set(pointer.x, pointer.y, pointer.inside ? 1 : 0, size.width / size.height);
    // Written as they are (no colour conversion), so a flat tile is the page's own bytes.
    srgb(page, u.uPage.value as Vector3);
    // The shade and the crack line: ink on the light page, a lifted grey on the dark one.
    const light = scheme === "light";
    srgb(light ? 0xc9c8c2 : 0x2c313b, u.uShadow.value as Vector3);
    srgb(light ? 0x9a9a94 : 0x4a515e, u.uLine.value as Vector3);
    // Every tile gone: the last starts at START + SPREAD + JITTER and falls for FALL.
    const gone = (progress - START) / (SPREAD + JITTER + FALL);
    const shown = progress > START - 0.005 && gone < 1;
    this.mesh.visible = shown;
    return Math.min(1, Math.max(0, gone));
  }

  /** Rows and columns this frame (for the docs and the checks). */
  get grid() {
    return { cols: this.cols, rows: this.rows };
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
