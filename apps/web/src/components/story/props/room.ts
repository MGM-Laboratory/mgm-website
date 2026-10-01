import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  HalfFloatType,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Scene,
  ShaderMaterial,
  SpotLight,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from "three";
import type {
  ColorRepresentation,
  IUniform,
  Material,
  Object3D,
  Texture,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from "three";

import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { ROOM_BASE_URL } from "../assets/files-room";
import type { StoryLoaderLike, StoryTier } from "../assets/types";

/**
 * The living room of the homepage story (Act 2), lit for dusk.
 *
 * Everything static is lit by baked lightmaps: Cycles irradiance in three
 * layers (the floor lamps and the display cabinet, the ceiling pendant over
 * the table, and the cool window), each baked alone with white light. The
 * shader mixes the layers with a tint per layer, so one bake serves the
 * night grade (dark scheme), the late afternoon grade (light scheme) and the
 * lamps warming up. Baked surfaces ignore three.js lights completely, which
 * keeps them cheap; the one live light they take is the TV glow, computed
 * from uniforms (`tvGlow()`).
 *
 * Things that are not baked (the card box, Godette, the toy letters) light
 * themselves with `room.rig`, a fixed set of lights that matches the bake,
 * and can reflect the room through `room.envMap` once `prepare()` has run.
 *
 * Frame: the room glTF's (metres, Y up, floor at y = 0), no transform.
 *
 * Usage:
 *   const room = await loadRoom(assets, tier);
 *   room.setLayer(STORY_LAYERS.behind); // the meshes only; the rig's lights stay on every layer
 *   rootScene.add(room.root);     // before the first compile: the rig's lights count
 *   await room.prepare(renderer); // in the loader, before compiling: the env map
 *   room.setGrade("dark");        // or "light"; amount blends from the other grade
 *   room.setPhase("land");        // visibility by story phase
 *   room.lamps(0 .. 1);           // warm-up; floor lamps lead, the pendant follows
 *
 * Rules the stage has to keep:
 * - The scene's light count is part of every lit material's program in three.js,
 *   the room's included: an act that adds or removes a light (or hides one)
 *   recompiles them all. Create every story light up front and fade it instead.
 * - The first frame after compiling still builds GPU pipelines (about 200 ms on
 *   a cold cache), so the loader renders one warm-up frame of the room.
 * - The glTF loader needs KTX2 (`KHR_texture_basisu` is required) and meshopt.
 * - The grades are tuned for the stage's renderer: NeutralToneMapping at exposure 1
 *   with sRGB output. They were fitted in CIELAB to the look of the first bake under
 *   AgX (warm lamp pools, a cool window, no clipped peach walls) and checked against
 *   Cycles renders graded the same way. Under another tone mapping they read wrong.
 * - Baked surfaces receive no three.js shadows: contact shadows for the box and
 *   the figure are the acts' (a soft blob on the table top).
 */

export type RoomScheme = "light" | "dark";

/**
 * Visibility sets by story phase (anchors.json `phases`), from an ID-render sweep of every story
 * camera at every aspect from 390x844 to 2560x1080 (with the spine's FOV blend), plus a union with
 * the earlier sets where a path is shared. A set is valid for its camera moves with mouse parallax
 * of up to 6 cm across and 4 cm up or down, the aim moving along or held on the target (10 cm and
 * 6.8 cm for `table` and `takeoff`, which keep every node for whip pans). `letters` and `closeup`
 * also allow pans of 8 degrees in yaw and 5 in pitch, with a FOV up to 4 and 6 degrees wider.
 * - `hidden`: the card act (the page backdrop covers the room). Rig lights off.
 * - `crane`: the drop from the card stage down to `a_land`.
 * - `land`: `a_land`, and the moves from it to `b_letters` and `b_mcu` (and between those two).
 * - `letters`: the `b_letters` hold, where the toy letters are read.
 * - `closeup`: the `b_mcu` hold, Godette's close-up.
 * - `table`: from `b_mcu` or `b_letters` to `c_start`, the spark and the drag (whip pans).
 * - `takeoff`: `c_start` to `c_end`, the drag and the learning flight.
 * - `chase`: `c_end` to `d_start` to `d_mid`, over her shoulder toward the TV. At `c_end` both
 *   `takeoff` and `chase` hold; switch once the camera leaves it.
 * - `screen`: `d_mid` to the fill distance at the frame's aspect, with a FOV up to 10 degrees wider.
 * - `fill`: the camera at or inside `screenFillDistance()`; only `tv_screen` draws.
 * - `all`: everything (debug, env capture).
 */
export type RoomPhase =
  | "hidden"
  | "crane"
  | "land"
  | "letters"
  | "closeup"
  | "table"
  | "takeoff"
  | "chase"
  | "screen"
  | "fill"
  | "all";

export type Vec3 = readonly [number, number, number];

export type RoomShot = Readonly<{
  position: Vec3;
  target: Vec3;
  /** Vertical FOV in degrees (three.js `PerspectiveCamera.fov`). */
  fov: Readonly<{ landscape: number; portrait: number }>;
}>;

type LampAnchor = Readonly<{
  /** Where the light comes from (the bulb). */
  bulb: Vec3;
  /** The glowing diffuser or opening a camera sees: centre, radius, facing. */
  glow: Readonly<{ centre: Vec3; radius: number; normal: Vec3 }>;
}>;

/** `room/anchors.json`: the room's story data, shared with the acts. */
export type RoomAnchors = Readonly<{
  version: number;
  units: string;
  table: Readonly<{
    /** Centre of the top surface (average of its four corners). */
    centre: Vec3;
    topY: number;
    /** Edge lengths in metres (the top is a slightly skewed 0.94 m square). */
    size: readonly [number, number];
    /** Corners on the top surface, named by compass (north is -z, the sofa side). */
    corners: Readonly<{ nw: Vec3; ne: Vec3; se: Vec3; sw: Vec3 }>;
  }>;
  boxSpot: Readonly<{ position: Vec3; yawDeg: number }>;
  figureSpot: Readonly<{ position: Vec3; standRadius: number }>;
  /**
   * The toy letters (the deck's `loadToyLetters` with these `lines`, `capHeight` and `tracking`): five
   * rows behind the box that read top to bottom from the `b_letters` shot. Checked against the table's
   * 1 cm free-space raster with a 1 cm margin, clear of the box and of a 7.5 cm circle round the figure
   * spot (room for her to step off). Line 0 is the back row. From the low shots (`a_land`, `b_mcu`) the
   * rows overlap: the camera rises to `b_letters` to read them.
   */
  letters: Readonly<{
    /** The shot that frames the phrase and Godette at every aspect from 390x844 to 2560x1080. */
    shot: "b_letters";
    capHeight: number;
    rowGap: number;
    /** Extra space between letters as a share of the cap height (the deck's default). */
    tracking: number;
    /** The block's centre on the table top. */
    centre: Vec3;
    /** Turns the deck's letter frame (reading along +x, faces toward +z) to this layout, about +y. */
    rotationYDeg: number;
    /** The reading direction, and the way the letters face (toward `b_letters`). */
    along: Vec3;
    facing: Vec3;
    /** Each row's centre on the table top (rows are centred) and its width with the deck's metrics. */
    lines: readonly Readonly<{ text: string; centre: Vec3; width: number }>[];
    checkedFree: boolean;
  }>;
  cardStage: Readonly<{ centre: Vec3; camera: RoomShot }>;
  /**
   * The drop's camera path, card stage to `a_land`: its smallest distance to any room triangle (metres),
   * the node it comes closest to, and the free radius around the card stage.
   */
  crane: Readonly<{
    from: Vec3;
    to: Vec3;
    clearance: number;
    nearest: string;
    stageClearance: number;
  }>;
  shots: Readonly<{
    a_start: RoomShot;
    a_land: RoomShot;
    b_mcu: RoomShot;
    c_start: RoomShot;
    c_end: RoomShot;
    d_start: RoomShot;
    d_mid: RoomShot;
    /**
     * A raised, long-lens shot (the `r-figure` hold) that reads the toy letters with Godette and the box
     * in frame at every aspect: caps at least 22 px tall from 390x844 to 2560x1080.
     */
    b_letters: RoomShot;
  }>;
  tv: Readonly<{
    centre: Vec3;
    /** Into the room. */
    normal: Vec3;
    /** Width and height of the screen quad in metres. */
    size: readonly [number, number];
    /**
     * Seen from the room. UV (0, 0) is TL (v runs down, the glTF convention). Where the screen
     * covers the frame depends on the aspect: `screenFillDistance()`.
     */
    corners: Readonly<{ tl: Vec3; tr: Vec3; br: Vec3; bl: Vec3 }>;
  }>;
  lamps: Readonly<{ pendant: LampAnchor; arc: LampAnchor; tripod: LampAnchor }>;
  window: Readonly<{ centre: Vec3; normal: Vec3; size: readonly [number, number] }>;
  /** Where the env map is captured from. */
  probe: Vec3;
  lightmaps: readonly Readonly<{ group: LightmapGroup; layer: LightLayer; k: number }>[];
  phases: readonly Readonly<{ phase: RoomPhase; nodes: readonly string[] }>[];
}>;

export type StoryRoom = {
  /** Add once to the story's root scene. Keep it visible; hide with `setPhase("hidden")`. */
  readonly root: Group;
  /**
   * The lights for unbaked props. Their number never changes (no recompiles), and they stay on
   * every layer so that a pass on any one layer counts the same lights.
   */
  readonly rig: Group;
  readonly anchors: RoomAnchors;
  readonly tier: StoryTier;
  /**
   * Every room mesh by glTF node name (`tv_screen`, `coffee_table_top`, `coffee_table_cup_saucer`...).
   * On the low tier, meshes that share a material and a lightmap are merged into one to save draw
   * calls: the table's props into `coffee_table_top`, `tv_body` into `room_atlasB_tv_cabinet`, and
   * the shell's closing pieces into `room_concrete_walls` and `room_dark_panel`. Their names are
   * then missing here, and the merged meshes stay where they are.
   */
  readonly nodes: ReadonlyMap<string, Mesh>;
  /** The nodes an act may move (the cup, the pots, the TV...): fewer on the low tier, see `nodes`. */
  readonly handles: ReadonlySet<string>;
  /** The TV screen quad. UV (0, 0) is its top left: sample a render target with `1.0 - vUv.y`. */
  readonly screen: Mesh;
  /**
   * The room's reflection map (PMREM), null until `prepare()`. Props may use it as their envMap;
   * every `prepare()` makes a new one and disposes the old, so read it again after each call.
   */
  readonly envMap: Texture | null;
  /**
   * Uploads textures and captures `envMap` from the table (six renders of the
   * room). Await it once during the loader, before compiling the story's
   * programs, and again after a grade change if the reflections should follow.
   * Order in the loader: `root` in the scene, `await prepare()`, compile, one warm-up frame.
   * Calls run one after another; after `dispose()` a pending call ends without rendering.
   */
  prepare(renderer: WebGLRenderer): Promise<void>;
  /** `amount` blends from the other scheme's grade (0) to this one (1). */
  setGrade(scheme: RoomScheme, amount?: number): void;
  setPhase(phase: RoomPhase): void;
  /**
   * Puts every room mesh on this one object layer (the stage's `behind` layer, so the page
   * backdrop can hide the room). The rig's lights stay on all layers. Use this rather than a
   * traverse of `root`, which would also move the lights. `prepare()` sees the room on any layer.
   */
  setLayer(layer: number): void;
  /**
   * How much the room's light reaches the unbaked props (the rig), 0 to 1.
   * The backdrop reveal owns the room's own visibility.
   */
  setPresence(amount: number): void;
  /** Puts a material on the TV screen; null restores the dark glossy panel. */
  screenMaterial(material: Material | null): void;
  /** 0 (off) to 1 (on). The floor lamps lead, the pendant over the table follows. */
  lamps(intensity: number): void;
  /**
   * The TV's light on the room and on the props: the screen's average colour and a strength
   * (0 = off, 1 = a bright screen at night; flicker it for a power-on).
   */
  tvGlow(color: ColorRepresentation, intensity: number): void;
  /**
   * Frees the GPU memory of everything the room used, the cached glTF's geometry
   * and textures included (three.js uploads them again if the room is rebuilt).
   */
  dispose(): void;
};

type LightmapGroup = "table" | "shell" | "furniture";
type LightLayer = "practical" | "pendant" | "sky";

const LIGHTMAP_GROUPS: ReadonlyMap<string, LightmapGroup> = new Map<string, LightmapGroup>([
  ["coffee_table_top", "table"],
  ["coffee_table_magazine", "table"],
  ["coffee_table_cup_saucer", "table"],
  ["coffee_table_pot_A", "table"],
  ["coffee_table_pot_B", "table"],
  ["coffee_table_pot_C", "table"],
  ["room_concrete_walls", "shell"],
  ["room_floor_polished", "shell"],
  ["room_rug", "shell"],
  ["room_dark_panel", "shell"],
  ["room_ceiling_concrete", "shell"],
  ["room_steel_window_frame", "shell"],
  ["shell_south", "shell"],
  ["shell_east", "shell"],
  ["shell_ne_block", "shell"],
  ["room_atlasA_sofa_table", "furniture"],
  ["room_atlasB_tv_cabinet", "furniture"],
  ["tv_body", "furniture"],
  ["room_atlasC_plants", "furniture"],
  ["room_atlasD_lamps", "furniture"],
]);
/** Low tier: meshes merged into the first one of each list (same material clone, same lightmaps). */
const LOW_MERGES: readonly (readonly string[])[] = [
  [
    "coffee_table_top",
    "coffee_table_magazine",
    "coffee_table_cup_saucer",
    "coffee_table_pot_A",
    "coffee_table_pot_B",
    "coffee_table_pot_C",
  ],
  ["room_atlasB_tv_cabinet", "tv_body"],
  ["room_concrete_walls", "shell_south", "shell_east"],
  ["room_dark_panel", "shell_ne_block"],
];
/** Nodes that keep live transforms. */
const HANDLES: ReadonlySet<string> = new Set([
  "coffee_table_top",
  "coffee_table_magazine",
  "coffee_table_cup_saucer",
  "coffee_table_pot_A",
  "coffee_table_pot_B",
  "coffee_table_pot_C",
  "tv_body",
  "tv_screen",
]);
const GROUP_NAMES: readonly LightmapGroup[] = ["table", "shell", "furniture"];
const LAYER_NAMES: readonly LightLayer[] = ["practical", "pendant", "sky"];

type Rgb = readonly [number, number, number];

/**
 * A grade: linear tint times intensity per light layer, in the bake's units
 * (the lamps were baked white at their real power), and the parts that are
 * not baked. The two grades share one bake. Rig lights and highlights derive
 * their colours from the layer tints, so the unbaked props always match.
 */
type Grade = Readonly<{
  exposure: number;
  practical: Rgb;
  pendant: Rgb;
  sky: Rgb;
  /** Reflection strength on room surfaces. */
  env: number;
  /** The sky card behind the window: zenith, horizon, and the mullion shade. */
  skyTop: Rgb;
  skyHorizon: Rgb;
  mullion: Rgb;
  /** Emissive diffuser brightness relative to its lamp layer. */
  glow: number;
  /** Lamp light contrast: the irradiance that stays put, and the extra exponent (0 = as baked). */
  pivot: number;
  contrast: number;
  /** Rig strengths: warm bounce from the TV wall, the window as a key from the side, ambient sky and floor. */
  rim: number;
  fill: number;
  hemi: number;
  ground: number;
}>;

const NIGHT: Grade = {
  exposure: 0.615,
  practical: [0.548, 0.375, 0.234],
  pendant: [1.73, 1.161, 0.704],
  sky: [0.096, 0.278, 0.776],
  env: 1.102,
  skyTop: [0.003, 0.007, 0.024],
  skyHorizon: [0.028, 0.05, 0.115],
  mullion: [0.012, 0.012, 0.014],
  glow: 3.571,
  pivot: 0.178,
  contrast: 0.211,
  rim: 12.278,
  fill: 0.08,
  hemi: 0.634,
  ground: 0.1,
};

const AFTERNOON: Grade = {
  exposure: 1.063,
  practical: [0.309, 0.211, 0.132],
  pendant: [0.806, 0.551, 0.344],
  sky: [1.471, 1.36, 1.16],
  env: 1.324,
  skyTop: [0.55, 0.62, 0.8],
  skyHorizon: [1.6, 1.2, 0.8],
  mullion: [0.03, 0.03, 0.032],
  glow: 2.856,
  pivot: 0.485,
  contrast: 0.122,
  rim: 8.075,
  fill: 0.315,
  hemi: 0.479,
  ground: 0.14,
};

/** Lamp powers as baked (Cycles watts), for the highlights and the key light. */
const PENDANT_W = 70;
const ARC_W = 40;
const TRIPOD_DIFFUSER_W = 14;
/** `tvGlow(color, 1)`: a bright screen at night, its light carrying across the table. */
const TV_RADIANCE = 6;

const ANCHORS_URL = `${ROOM_BASE_URL}anchors.json`;

/** The part of the screen a frame may use: its height, or its width over the aspect, less the slack. */
function screenSpan(tv: RoomAnchors["tv"], aspect: number, slack: number) {
  const [w, h] = tv.size;
  return Math.max(0, Math.min(h - 2 * slack, (w - 2 * slack) / Math.max(aspect, 1e-3)));
}

/**
 * True when a camera `d` metres in front of the screen, strayed `slack` metres in any of eight
 * directions, sees nothing but the screen: with its aim moved along (a shift) and with its aim kept
 * on the screen's centre (an orbit, whose frame lands on the screen as a trapezoid). Screen frame:
 * the quad in the plane z = 0, the camera on +z, y up.
 */
function screenCovers(
  tv: RoomAnchors["tv"],
  aspect: number,
  tanV: number,
  d: number,
  slack: number,
) {
  const hw = tv.size[0] / 2;
  const hh = tv.size[1] / 2;
  const tanH = tanV * aspect;
  const steps = slack > 0 ? 8 : 1;
  for (let k = 0; k < steps; k++) {
    const ox = slack * Math.cos((k * Math.PI) / 4);
    const oy = slack * Math.sin((k * Math.PI) / 4);
    for (const orbit of [false, true]) {
      // forward f, right r = f x up, up u = r x f (up is +y)
      let fx = 0;
      let fy = 0;
      let fz = -1;
      if (orbit) {
        const n = Math.hypot(ox, oy, d);
        fx = -ox / n;
        fy = -oy / n;
        fz = -d / n;
      }
      const rn = Math.hypot(fz, fx);
      const rx = -fz / rn;
      const rz = fx / rn;
      const ux = -rz * fy;
      const uy = rz * fx - rx * fz;
      const uz = rx * fy;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const dx = fx + sx * tanH * rx + sy * tanV * ux;
          const dy = fy + sy * tanV * uy;
          const dz = fz + sx * tanH * rz + sy * tanV * uz;
          if (dz >= -1e-6) return false;
          const t = -d / dz;
          if (Math.abs(ox + t * dx) > hw || Math.abs(oy + t * dy) > hh) return false;
        }
      }
    }
  }
  return true;
}

/**
 * How close the camera must be to the TV screen (metres along its normal, aimed at the screen's
 * centre) for the screen to cover the whole frame, so that only `tv_screen` needs to draw
 * (`setPhase("fill")`). `aspect` is the frame's width over its height and `fovDeg` the vertical
 * FOV. The screen is 1.729:1, so a wider frame needs the camera closer: 0.736 m at 16:9 and
 * 40 degrees, 0.552 m at 2560x1080. `slack` (metres) keeps the frame covered while the camera
 * strays that far from the screen's axis in any direction, whether its aim moves with it or stays
 * on the screen's centre: 0.075 covers a parallax of 6 cm across and 4 cm up at once. Ramp any
 * larger drift down before the phase switches.
 */
export function screenFillDistance(
  tv: RoomAnchors["tv"],
  aspect: number,
  fovDeg: number,
  slack = 0,
) {
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  let d = screenSpan(tv, aspect, slack) / (2 * tanV);
  for (let i = 0; i < 80 && d > 0.01 && !screenCovers(tv, aspect, tanV, d, slack); i++) d *= 0.99;
  return d;
}

/**
 * The widest vertical FOV (degrees) at which the screen still covers the frame from `distance`
 * metres, with the same `slack`: the FOV for lusion's window trick, where the screen keeps a
 * constant size as the camera closes in.
 */
export function screenFillFov(tv: RoomAnchors["tv"], aspect: number, distance: number, slack = 0) {
  const d = Math.max(distance, 1e-4);
  let tanV = screenSpan(tv, aspect, slack) / (2 * d);
  for (let i = 0; i < 80 && tanV > 1e-3 && !screenCovers(tv, aspect, tanV, d, slack); i++) {
    tanV *= 0.99;
  }
  return (2 * Math.atan(tanV) * 180) / Math.PI;
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a: number, b: number, v: number) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function mixNum(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mixGrade(a: Grade, b: Grade, t: number): Grade {
  return {
    exposure: mixNum(a.exposure, b.exposure, t),
    practical: mixRgb(a.practical, b.practical, t),
    pendant: mixRgb(a.pendant, b.pendant, t),
    sky: mixRgb(a.sky, b.sky, t),
    env: mixNum(a.env, b.env, t),
    skyTop: mixRgb(a.skyTop, b.skyTop, t),
    skyHorizon: mixRgb(a.skyHorizon, b.skyHorizon, t),
    mullion: mixRgb(a.mullion, b.mullion, t),
    glow: mixNum(a.glow, b.glow, t),
    pivot: mixNum(a.pivot, b.pivot, t),
    contrast: mixNum(a.contrast, b.contrast, t),
    rim: mixNum(a.rim, b.rim, t),
    fill: mixNum(a.fill, b.fill, t),
    hemi: mixNum(a.hemi, b.hemi, t),
    ground: mixNum(a.ground, b.ground, t),
  };
}

/** Splits a linear tint into a colour (max channel 1) and its strength. */
function setTint(c: Color, rgb: Rgb) {
  const m = Math.max(rgb[0], rgb[1], rgb[2], 1e-6);
  c.setRGB(rgb[0] / m, rgb[1] / m, rgb[2] / m);
  return m;
}

function v3(a: Vec3) {
  return new Vector3(a[0], a[1], a[2]);
}

// Shader patch for every baked room surface (MeshStandardMaterial). Three.js
// lights are skipped; the lightmap layers, the env reflections and the TV
// glow are the whole of the lighting.
const ROOM_PARS = /* glsl */ `
uniform vec3 uRoomFlat;
uniform vec3 uRoomTvPos;
uniform vec3 uRoomTvNormal;
uniform vec3 uRoomTvColor;
uniform float uRoomTvArea;
uniform vec3 uRoomGlintPos[ 4 ];
uniform vec3 uRoomGlintAxis[ 4 ];
uniform vec3 uRoomGlintColor[ 4 ];
uniform vec3 uRoomGlintShape[ 4 ];
uniform vec2 uRoomContrast;
#ifdef USE_LIGHTMAP
uniform sampler2D uRoomLmPendant;
uniform sampler2D uRoomLmSky;
uniform vec3 uRoomLmA;
uniform vec3 uRoomLmB;
uniform vec3 uRoomLmC;
#endif
`;

// Specular only, from a small spherical source (the widened lobe of Karis 2013): the bake has no
// view-dependent light, so the lamps and the TV put their highlights back this way.
const ROOM_GLINT = /* glsl */ `
vec3 roomGlint( const in int i, const in vec3 geometryPosition, const in vec3 n, const in vec3 v, const in PhysicalMaterial material ) {
	vec3 toL = ( viewMatrix * vec4( uRoomGlintPos[ i ], 1.0 ) ).xyz - geometryPosition;
	float d2 = max( dot( toL, toL ), 1e-4 );
	float d = sqrt( d2 );
	vec3 l = toL / d;
	float dotNL = saturate( dot( n, l ) );
	vec3 axis = normalize( ( viewMatrix * vec4( uRoomGlintAxis[ i ], 0.0 ) ).xyz );
	float lobe = pow( saturate( dot( - l, axis ) ), uRoomGlintShape[ i ].y );
	if ( dotNL <= 0.0 || lobe <= 0.0 ) return vec3( 0.0 );
	vec3 h = normalize( l + v );
	float alpha = pow2( material.roughness );
	float alphaS = saturate( alpha + uRoomGlintShape[ i ].x / ( 2.0 * d ) );
	float energy = pow2( alpha / alphaS );
	vec3 F = F_Schlick( material.specularColorBlended, material.specularF90, saturate( dot( v, h ) ) );
	float V = V_GGX_SmithCorrelated( alphaS, dotNL, saturate( dot( n, v ) ) );
	float D = D_GGX( alphaS, saturate( dot( n, h ) ) );
	return uRoomGlintColor[ i ] * ( lobe * dotNL / d2 ) * F * ( V * D * energy );
}
`;

const ROOM_LIGHTS_BEGIN = /* glsl */ `
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	material.multiScatteringCompensation = vec3( 1.0 );
#endif
{
	// The TV as a small Lambertian emitter: its facing, the surface's facing, a soft inverse square.
	vec3 tvPos = ( viewMatrix * vec4( uRoomTvPos, 1.0 ) ).xyz;
	vec3 tvNormal = normalize( ( viewMatrix * vec4( uRoomTvNormal, 0.0 ) ).xyz );
	vec3 toTv = tvPos - geometryPosition;
	float tvD2 = max( dot( toTv, toTv ), 1e-4 );
	vec3 tvL = toTv * inversesqrt( tvD2 );
	float tvLobe = saturate( dot( tvNormal, - tvL ) );
	float tvNL = saturate( dot( geometryNormal, tvL ) );
	reflectedLight.directDiffuse += uRoomTvColor * ( tvNL * tvLobe * uRoomTvArea / ( tvD2 + uRoomTvArea ) ) * BRDF_Lambert( material.diffuseContribution );
}
#if defined( STANDARD )
	for ( int gi = 0; gi < 4; gi ++ ) reflectedLight.directSpecular += roomGlint( gi, geometryPosition, geometryNormal, geometryViewDir, material );
#endif
vec3 iblIrradiance = vec3( 0.0 );
vec3 irradiance = vec3( 0.0 );
vec3 radiance = vec3( 0.0 );
vec3 clearcoatRadiance = vec3( 0.0 );
`;

const ROOM_LIGHTS_MAPS = /* glsl */ `
#ifdef USE_LIGHTMAP
	// Lamp light gets a luminance contrast around a pivot (x) with exponent 1 + y: the pools stay, the
	// bounce between them falls away, so the cool window light reads in the shadows.
	vec3 roomWarm = texture2D( lightMap, vLightMapUv ).rgb * uRoomLmA + texture2D( uRoomLmPendant, vLightMapUv ).rgb * uRoomLmB;
	float roomWarmL = max( dot( roomWarm, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-5 );
	irradiance += roomWarm * pow( roomWarmL / uRoomContrast.x, uRoomContrast.y ) + texture2D( uRoomLmSky, vLightMapUv ).rgb * uRoomLmC;
#else
	irradiance += uRoomFlat;
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
#endif
`;

type SharedUniforms = {
  uRoomFlat: IUniform<Vector3>;
  uRoomTvPos: IUniform<Vector3>;
  uRoomTvNormal: IUniform<Vector3>;
  uRoomTvColor: IUniform<Vector3>;
  uRoomTvArea: IUniform<number>;
  uRoomGlintPos: IUniform<Vector3[]>;
  uRoomGlintAxis: IUniform<Vector3[]>;
  uRoomGlintColor: IUniform<Vector3[]>;
  uRoomGlintShape: IUniform<Vector3[]>;
  uRoomContrast: IUniform<Vector2>;
};

type GroupUniforms = {
  uRoomLmPendant: IUniform<Texture>;
  uRoomLmSky: IUniform<Texture>;
  uRoomLmA: IUniform<Vector3>;
  uRoomLmB: IUniform<Vector3>;
  uRoomLmC: IUniform<Vector3>;
};

/** A three.js shader chunk include line, the text `onBeforeCompile` replaces. */
function chunk(name: string) {
  return `#include ${String.fromCharCode(60)}${name}${String.fromCharCode(62)}`;
}

function patchRoomMaterial(
  material: MeshStandardMaterial,
  shared: SharedUniforms,
  group: GroupUniforms | null,
) {
  const key = group ? "story-room-lm" : "story-room";
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, shared);
    if (group) Object.assign(shader.uniforms, group);
    shader.fragmentShader = shader.fragmentShader
      .replace(chunk("common"), `${chunk("common")}\n${ROOM_PARS}`)
      .replace(
        chunk("lights_physical_pars_fragment"),
        `${chunk("lights_physical_pars_fragment")}\n${ROOM_GLINT}`,
      )
      .replace(chunk("lights_fragment_begin"), ROOM_LIGHTS_BEGIN)
      .replace(chunk("lights_fragment_maps"), ROOM_LIGHTS_MAPS);
    if (
      process.env.NODE_ENV !== "production" &&
      !shader.fragmentShader.includes("uRoomTvArea / ( tvD2")
    ) {
      console.warn("room: the lighting patch did not apply (three.js shader chunks changed)");
    }
  };
  material.customProgramCacheKey = () => key;
}

// The window's sky card: the mullion plane from the model, drawn opaque with a
// dusk gradient behind the bars. Tone mapped like the lit scene.
const SKY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const SKY_FRAGMENT = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>
uniform sampler2D uMullions;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uMullion;
varying vec2 vUv;
void main() {
	vec4 bars = texture2D( uMullions, vUv );
	// glTF UVs run top-down: v = 0 at the top of the window.
	float up = 1.0 - vUv.y;
	vec3 sky = mix( uSkyHorizon, uSkyTop, smoothstep( 0.05, 0.95, up ) );
	gl_FragColor = vec4( mix( sky, uMullion, step( 0.5, bars.a ) ), 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <dithering_fragment>
}
`;

// Emissive diffusers under the lamp shades and the pendant bulb.
const GLOW_VERTEX = /* glsl */ `
attribute float aLayer;
attribute float aFade;
varying float vLayer;
varying float vFade;
void main() {
	vLayer = aLayer;
	vFade = aFade;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uGlowPractical;
uniform vec3 uGlowPendant;
varying float vLayer;
varying float vFade;
void main() {
	vec3 c = mix( uGlowPractical, uGlowPendant, vLayer ) * vFade;
	gl_FragColor = vec4( c, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

type GlowPart = {
  centre: Vector3;
  normal: Vector3;
  radius: number;
  layer: number;
  sphere: boolean;
};

/** One merged mesh: a disc per diffuser (bright centre, dimmer rim), a small sphere for the pendant bulb. */
function buildGlowGeometry(parts: readonly GlowPart[]) {
  const pos: number[] = [];
  const layer: number[] = [];
  const fade: number[] = [];
  const index: number[] = [];
  const seg = 32;
  for (const p of parts) {
    const base = pos.length / 3;
    if (p.sphere) {
      const rings = 8;
      for (let i = 0; i <= rings; i++) {
        const th = (i / rings) * Math.PI;
        for (let j = 0; j <= seg; j++) {
          const ph = (j / seg) * Math.PI * 2;
          pos.push(
            p.centre.x + p.radius * Math.sin(th) * Math.cos(ph),
            p.centre.y + p.radius * Math.cos(th),
            p.centre.z + p.radius * Math.sin(th) * Math.sin(ph),
          );
          layer.push(p.layer);
          fade.push(1);
        }
      }
      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < seg; j++) {
          const a = base + i * (seg + 1) + j;
          const b = a + seg + 1;
          index.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      continue;
    }
    const n = p.normal.clone().normalize();
    const t = Math.abs(n.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const u = new Vector3().crossVectors(n, t).normalize();
    const w = new Vector3().crossVectors(n, u).normalize();
    pos.push(p.centre.x, p.centre.y, p.centre.z);
    layer.push(p.layer);
    fade.push(1);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const q = p.centre
        .clone()
        .addScaledVector(u, Math.cos(a) * p.radius)
        .addScaledVector(w, Math.sin(a) * p.radius);
      pos.push(q.x, q.y, q.z);
      layer.push(p.layer);
      fade.push(0.45);
    }
    for (let j = 0; j < seg; j++) index.push(base, base + 1 + j, base + 2 + j);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aLayer", new BufferAttribute(new Float32Array(layer), 1));
  g.setAttribute("aFade", new BufferAttribute(new Float32Array(fade), 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

function isMesh(o: Object3D): o is Mesh {
  return o instanceof Mesh;
}

/**
 * A mesh's geometry as plain floats in the room frame. The meshopt glTF stores quantized attributes
 * (normalized integers that the node transform scales back), which a merge cannot mix.
 */
function worldGeometry(mesh: Mesh) {
  const src = mesh.geometry;
  const out = new BufferGeometry();
  for (const [name, attribute] of Object.entries(src.attributes)) {
    const size = attribute.itemSize;
    const values = new Float32Array(attribute.count * size);
    for (let i = 0; i < attribute.count; i++) {
      const o = i * size;
      values[o] = attribute.getX(i);
      if (size > 1) values[o + 1] = attribute.getY(i);
      if (size > 2) values[o + 2] = attribute.getZ(i);
      if (size > 3) values[o + 3] = attribute.getW(i);
    }
    out.setAttribute(name, new BufferAttribute(values, size));
  }
  if (src.index) out.setIndex(src.index.clone());
  out.applyMatrix4(mesh.matrixWorld);
  return out;
}

function lightmapUrl(group: LightmapGroup, layer: LightLayer, low: boolean) {
  return `${ROOM_BASE_URL}${low ? "lm-low" : "lm"}/${group}-${layer}.ktx2`;
}

/**
 * Loads and builds the room. `tier` picks the texture set: low loads the 512
 * textures and lightmaps, high and medium the 1024 set; the geometry is shared.
 */
export async function loadRoom(assets: StoryLoaderLike, tier: StoryTier): Promise<StoryRoom> {
  const low = tier === "low";
  const [gltf, anchors] = await Promise.all([
    assets.gltf(`${ROOM_BASE_URL}${low ? "room-low.gltf" : "room.gltf"}`),
    assets.json<RoomAnchors>(ANCHORS_URL),
  ]);
  const lmJobs: Promise<Texture>[] = [];
  for (const g of GROUP_NAMES) {
    for (const l of LAYER_NAMES)
      lmJobs.push(assets.texture(lightmapUrl(g, l, low), { srgb: true, flipY: false }));
  }
  const lmList = await Promise.all(lmJobs);
  const lightmaps = new Map<string, Texture>();
  GROUP_NAMES.forEach((g, gi) => {
    LAYER_NAMES.forEach((l, li) => {
      const t = lmList.at(gi * LAYER_NAMES.length + li);
      if (t) {
        t.channel = 1;
        t.flipY = false;
        lightmaps.set(`${g}_${l}`, t);
      }
    });
  });
  const kOf = new Map<string, number>();
  for (const e of anchors.lightmaps) kOf.set(`${e.group}_${e.layer}`, e.k);

  const root = new Group();
  root.name = "story_room";
  const meshesGroup = new Group();
  meshesGroup.name = "room_meshes";
  root.add(meshesGroup);

  const shared: SharedUniforms = {
    uRoomFlat: { value: new Vector3() },
    uRoomTvPos: { value: v3(anchors.tv.centre) },
    uRoomTvNormal: { value: v3(anchors.tv.normal) },
    uRoomTvColor: { value: new Vector3() },
    uRoomTvArea: { value: anchors.tv.size[0] * anchors.tv.size[1] },
    // Highlights: 0 pendant bulb, 1 arc lamp diffuser, 2 tripod lamp diffuser, 3 the TV screen.
    uRoomGlintPos: {
      value: [
        v3(anchors.lamps.pendant.bulb),
        v3(anchors.lamps.arc.glow.centre),
        v3(anchors.lamps.tripod.glow.centre),
        v3(anchors.tv.centre),
      ],
    },
    uRoomGlintAxis: {
      value: [
        v3(anchors.lamps.pendant.glow.normal),
        v3(anchors.lamps.arc.glow.normal),
        v3(anchors.lamps.tripod.glow.normal),
        v3(anchors.tv.normal),
      ],
    },
    uRoomGlintColor: { value: [new Vector3(), new Vector3(), new Vector3(), new Vector3()] },
    uRoomContrast: { value: new Vector2(1, 0) },
    // x: source radius (widens the lobe), y: emission lobe power (1 = a flat Lambertian diffuser).
    uRoomGlintShape: {
      value: [
        new Vector3(0.05, 0.15, 0),
        new Vector3(anchors.lamps.arc.glow.radius, 1, 0),
        new Vector3(anchors.lamps.tripod.glow.radius, 1, 0),
        new Vector3(Math.sqrt((anchors.tv.size[0] * anchors.tv.size[1]) / Math.PI), 1, 0),
      ],
    },
  };
  const groupUniforms = new Map<LightmapGroup, GroupUniforms>();
  for (const g of GROUP_NAMES) {
    const pend = lightmaps.get(`${g}_pendant`);
    const sky = lightmaps.get(`${g}_sky`);
    if (!pend || !sky) continue;
    groupUniforms.set(g, {
      uRoomLmPendant: { value: pend },
      uRoomLmSky: { value: sky },
      uRoomLmA: { value: new Vector3() },
      uRoomLmB: { value: new Vector3() },
      uRoomLmC: { value: new Vector3() },
    });
  }

  // Materials: one clone per (glTF material, lightmap group), shared by the nodes that need it.
  const nodes = new Map<string, Mesh>();
  const clones = new Map<string, MeshStandardMaterial>();
  const created: Material[] = [];
  const envMaterials: MeshStandardMaterial[] = [];
  let skyMesh: Mesh | null = null;
  let screen: Mesh | null = null;
  // The loader may hand the same parsed glTF to every call (the story's cache does), so build
  // from a clone: it shares geometry and textures, and the cached scene stays whole.
  const source = gltf.scene.clone(true);
  const found: Mesh[] = [];
  source.updateMatrixWorld(true);
  source.traverse((o) => {
    if (isMesh(o)) found.push(o);
  });
  const sources = new Set<Material>();
  for (const mesh of found) {
    nodes.set(mesh.name, mesh);
    const src = mesh.material;
    if (!Array.isArray(src)) sources.add(src);
    if (Array.isArray(src) || !(src instanceof MeshStandardMaterial)) continue;
    if (mesh.name === "window_sky") {
      skyMesh = mesh;
      continue;
    }
    if (mesh.name === "tv_screen") {
      screen = mesh;
      continue;
    }
    const g = LIGHTMAP_GROUPS.get(mesh.name) ?? null;
    const cacheKey = `${src.uuid}:${g ?? "none"}`;
    let m = clones.get(cacheKey);
    if (!m) {
      m = src.clone();
      m.side = src.name === "atlasC_plants" ? DoubleSide : FrontSide;
      m.envMapIntensity = 0.5;
      // Dusk is mostly dark gradients: dither the output so 8 bits never band.
      m.dithering = true;
      const gu = g ? (groupUniforms.get(g) ?? null) : null;
      if (g && gu) {
        m.lightMap = lightmaps.get(`${g}_practical`) ?? null;
        m.lightMapIntensity = 1;
      }
      patchRoomMaterial(m, shared, m.lightMap ? gu : null);
      clones.set(cacheKey, m);
      created.push(m);
      envMaterials.push(m);
    }
    mesh.material = m;
  }
  // Every geometry the room touches, for disposal: the cached glTF's and the merged ones.
  const geometries = new Set<BufferGeometry>(found.map((mesh) => mesh.geometry));
  // Low tier: meshes that share a material clone (so the same lightmaps) become one static mesh under
  // the first part's name; a merged mesh shows when any of its parts is in the phase's set.
  const partsOf = new Map<Mesh, readonly string[]>();
  let placed: Mesh[] = found;
  if (low) {
    const mergedAway = new Set<Mesh>();
    const merged: Mesh[] = [];
    for (const names of LOW_MERGES) {
      const parts = names.map((n) => nodes.get(n)).filter((m): m is Mesh => m !== undefined);
      const first = parts.at(0);
      if (!first || parts.length < 2 || parts.some((p) => p.material !== first.material)) continue;
      const pieces = parts.map(worldGeometry);
      // mergeGeometries returns null when the attributes disagree (its typings do not say so).
      const geometry = mergeGeometries(pieces, false) as BufferGeometry | null;
      for (const piece of pieces) piece.dispose();
      if (!geometry) continue;
      const mesh = new Mesh(geometry, first.material);
      mesh.name = first.name;
      geometries.add(geometry);
      partsOf.set(
        mesh,
        parts.map((p) => p.name),
      );
      for (const p of parts) {
        nodes.delete(p.name);
        mergedAway.add(p);
      }
      nodes.set(mesh.name, mesh);
      merged.push(mesh);
    }
    placed = [...found.filter((mesh) => !mergedAway.has(mesh)), ...merged];
  }
  const handles = new Set(
    [...nodes.entries()]
      .filter(([name, mesh]) => HANDLES.has(name) && !partsOf.has(mesh))
      .map(([name]) => name),
  );
  // Flatten into one group in the room frame. Props and the TV keep live transforms (an act may nudge
  // the cup or shake the TV); everything else is static.
  for (const mesh of placed) {
    mesh.removeFromParent();
    mesh.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    meshesGroup.add(mesh);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = handles.has(mesh.name);
  }
  if (!screen) throw new Error("room: tv_screen node missing");
  const screenMesh: Mesh = screen;

  // The TV screen, off: a dark glossy panel that reflects the room.
  const screenOff = new MeshStandardMaterial({ color: 0x040405, roughness: 0.16, metalness: 0 });
  screenOff.envMapIntensity = 0.9;
  screenOff.dithering = true;
  patchRoomMaterial(screenOff, shared, null);
  created.push(screenOff);
  envMaterials.push(screenOff);
  screenMesh.material = screenOff;

  // The sky behind the window.
  const skyUniforms = {
    uMullions: { value: null as Texture | null },
    uSkyTop: { value: new Color() },
    uSkyHorizon: { value: new Color() },
    uMullion: { value: new Color() },
  };
  const skyCard: Mesh | null = skyMesh;
  if (skyCard) {
    const srcMat = skyCard.material;
    if (!Array.isArray(srcMat) && srcMat instanceof MeshStandardMaterial)
      skyUniforms.uMullions.value = srcMat.map;
    const skyMat = new ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
    });
    skyMat.toneMapped = true;
    skyMat.dithering = true;
    created.push(skyMat);
    skyCard.material = skyMat;
  }

  // Glowing diffusers (one draw call).
  const glowUniforms = {
    uGlowPractical: { value: new Color() },
    uGlowPendant: { value: new Color() },
  };
  const lampParts: GlowPart[] = [
    { ...glowPart(anchors.lamps.tripod), layer: 0, sphere: false },
    { ...glowPart(anchors.lamps.arc), layer: 0, sphere: false },
    {
      centre: v3(anchors.lamps.pendant.bulb),
      normal: new Vector3(0, -1, 0),
      radius: 0.026,
      layer: 1,
      sphere: true,
    },
  ];
  const glowGeo = buildGlowGeometry(lampParts);
  const glowMat = new ShaderMaterial({
    uniforms: glowUniforms,
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
  });
  glowMat.side = DoubleSide;
  glowMat.toneMapped = true;
  created.push(glowMat);
  const glow = new Mesh(glowGeo, glowMat);
  glow.name = "room_lamp_glow";
  meshesGroup.add(glow);
  nodes.set(glow.name, glow);

  // The rig for unbaked props: a warm key from the pendant, a warm rim from the TV wall lamps,
  // the cool window as a directional fill, a hemisphere ambient and the TV glow. Fixed count.
  const rig = new Group();
  rig.name = "room_rig";
  root.add(rig);
  const pendantBulb = v3(anchors.lamps.pendant.bulb);
  const key = new SpotLight(0xffffff, 0, 4.5, 1.25, 0.6, 2);
  key.name = "room_key";
  key.position.copy(pendantBulb);
  key.target.position.set(
    anchors.boxSpot.position[0],
    anchors.table.topY,
    anchors.boxSpot.position[2],
  );
  const rim = new PointLight(0xffffff, 0, 5, 2);
  rim.name = "room_rim";
  rim.position.set(-1.45, 1.25, -0.55);
  const fill = new DirectionalLight(0xffffff, 0);
  fill.name = "room_fill";
  fill.position.copy(v3(anchors.window.centre)).add(new Vector3(0, 0.6, 0));
  fill.target.position.copy(v3(anchors.table.centre));
  const hemi = new HemisphereLight(0xffffff, 0xffffff, 0);
  hemi.name = "room_hemi";
  const tv = new PointLight(0xffffff, 0, 4, 2);
  tv.name = "room_tv";
  tv.position.copy(v3(anchors.tv.centre)).addScaledVector(v3(anchors.tv.normal), 0.3);
  rig.add(key, key.target, rim, fill, fill.target, hemi, tv);
  for (const light of [key, rim, fill, hemi, tv]) light.layers.enableAll();

  // Visibility by phase.
  const phases = new Map<RoomPhase, ReadonlySet<string>>();
  for (const p of anchors.phases) phases.set(p.phase, new Set(p.nodes));

  let grade: Grade = NIGHT;
  let lampLevel = 1;
  let presence = 1;
  let phase: RoomPhase = "all";
  let envTarget: WebGLRenderTarget | null = null;
  let envMap: Texture | null = null;
  const tvColor = new Color(0, 0, 0);
  let tvStrength = 0;

  const glint = shared.uRoomGlintColor.value;
  function applyLight() {
    const e = grade.exposure;
    const lp = smoothstep(0, 0.7, lampLevel);
    const lq = smoothstep(0.3, 1, lampLevel);
    const pr = grade.practical;
    const pe = grade.pendant;
    const sk = grade.sky;
    for (const g of GROUP_NAMES) {
      const u = groupUniforms.get(g);
      if (!u) continue;
      const kp = (kOf.get(`${g}_practical`) ?? 1) * Math.PI * e * lp;
      const kq = (kOf.get(`${g}_pendant`) ?? 1) * Math.PI * e * lq;
      const ks = (kOf.get(`${g}_sky`) ?? 1) * Math.PI * e;
      u.uRoomLmA.value.set(pr[0] * kp, pr[1] * kp, pr[2] * kp);
      u.uRoomLmB.value.set(pe[0] * kq, pe[1] * kq, pe[2] * kq);
      u.uRoomLmC.value.set(sk[0] * ks, sk[1] * ks, sk[2] * ks);
    }
    // Unbaked room parts (pipes, the dark TV panel): a flat irradiance near the room's average.
    shared.uRoomFlat.value
      .set(
        sk[0] * 0.25 + (pr[0] * lp + pe[0] * lq) * 0.3,
        sk[1] * 0.25 + (pr[1] * lp + pe[1] * lq) * 0.3,
        sk[2] * 0.25 + (pr[2] * lp + pe[2] * lq) * 0.3,
      )
      .multiplyScalar(Math.PI * e);
    shared.uRoomContrast.value.set(grade.pivot * e, grade.contrast);
    const envI = grade.env * e * (0.35 + 0.65 * Math.max(lp, lq));
    for (const m of envMaterials) m.envMapIntensity = m === screenOff ? envI * 1.6 : envI;
    // Highlights (radiant intensity in W/sr as baked: a bulb P / 4 pi, a flat diffuser P / pi on its axis).
    glint[0].set(pe[0], pe[1], pe[2]).multiplyScalar((PENDANT_W / (4 * Math.PI)) * e * lq);
    glint[1].set(pr[0], pr[1], pr[2]).multiplyScalar((ARC_W / Math.PI) * e * lp);
    glint[2].set(pr[0], pr[1], pr[2]).multiplyScalar((TRIPOD_DIFFUSER_W / Math.PI) * e * lp);
    shared.uRoomTvColor.value
      .set(tvColor.r, tvColor.g, tvColor.b)
      .multiplyScalar(tvStrength * TV_RADIANCE * e);
    glint[3].copy(shared.uRoomTvColor.value).multiplyScalar(shared.uRoomTvArea.value);
    const gl = grade.glow * e;
    glowUniforms.uGlowPractical.value.setRGB(pr[0], pr[1], pr[2]).multiplyScalar(gl * lp);
    glowUniforms.uGlowPendant.value.setRGB(pe[0], pe[1], pe[2]).multiplyScalar(gl * 1.2 * lq);
    skyUniforms.uSkyTop.value
      .setRGB(grade.skyTop[0], grade.skyTop[1], grade.skyTop[2])
      .multiplyScalar(e);
    skyUniforms.uSkyHorizon.value
      .setRGB(grade.skyHorizon[0], grade.skyHorizon[1], grade.skyHorizon[2])
      .multiplyScalar(e);
    skyUniforms.uMullion.value.setRGB(grade.mullion[0], grade.mullion[1], grade.mullion[2]);
    // The rig, in the same units: a point light of P watts is P / 4 pi candela here.
    const on = phase === "hidden" ? 0 : presence;
    key.intensity = setTint(key.color, pe) * (PENDANT_W / (4 * Math.PI)) * e * lq * on;
    rim.intensity = setTint(rim.color, pr) * grade.rim * e * lp * on;
    fill.intensity = setTint(fill.color, sk) * grade.fill * e * on;
    const skyMax = setTint(hemi.color, sk);
    hemi.intensity = skyMax * grade.hemi * e * on;
    const warmMax = setTint(hemi.groundColor, pr);
    hemi.groundColor.multiplyScalar(
      (warmMax * grade.ground * lp) / Math.max(skyMax * grade.hemi, 1e-4),
    );
    tv.color.copy(tvColor);
    tv.intensity = tvStrength * TV_RADIANCE * e * shared.uRoomTvArea.value * on;
  }

  function applyPhase() {
    const set = phases.get(phase);
    meshesGroup.visible = phase !== "hidden";
    for (const [name, mesh] of nodes) {
      const parts = partsOf.get(mesh) ?? [name];
      mesh.visible = phase === "all" || phase === "hidden" || !set || parts.some((p) => set.has(p));
    }
  }

  // Every texture the room owns (the glTF maps and the lightmaps), for upload and disposal.
  const textures = new Set<Texture>(lightmaps.values());
  for (const m of sources) {
    if (m instanceof MeshStandardMaterial) {
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) if (t) textures.add(t);
    }
  }

  applyLight();
  applyPhase();

  let disposed = false;
  let queue: Promise<void> = Promise.resolve();

  // The env capture: the room rendered from the table in a scene of its own (an object has one
  // parent) into linear half-float targets, a program variant of its own. PMREM's cube camera sees
  // layer 0 only, so the meshes go on every layer for the capture and back to theirs after.
  // compileAsync builds the programs synchronously inside the call and only polls afterwards, so
  // the shared state (the render target, the meshes' parent, layers and phase) is put back before
  // the wait: anything that renders meanwhile (the loader, another prop's warm-up) sees the room as
  // it was.
  async function capture(renderer: WebGLRenderer) {
    for (const t of textures) renderer.initTexture(t);
    const scene = new Scene();
    const probeTarget = new WebGLRenderTarget(4, 4, { type: HalfFloatType });
    const previous = renderer.getRenderTarget();
    const takeRoom = () => {
      const was = phase;
      const masks = new Map<Mesh, number>();
      for (const mesh of nodes.values()) {
        masks.set(mesh, mesh.layers.mask);
        mesh.layers.enableAll();
      }
      phase = "all";
      applyPhase();
      scene.add(meshesGroup);
      return () => {
        root.add(meshesGroup);
        for (const [mesh, mask] of masks) mesh.layers.mask = mask;
        phase = was;
        applyPhase();
      };
    };
    let compiled: Promise<unknown> = Promise.resolve();
    let giveBack = takeRoom();
    renderer.setRenderTarget(probeTarget);
    try {
      compiled = renderer.compileAsync(scene, new PerspectiveCamera(90, 1, 0.04, 20));
    } finally {
      renderer.setRenderTarget(previous);
      giveBack();
    }
    try {
      await compiled;
    } finally {
      probeTarget.dispose();
    }
    // A dispose() during the wait wins: rendering the room now would upload it all again.
    if (disposed) return;
    giveBack = takeRoom();
    const pmrem = new PMREMGenerator(renderer);
    let target: WebGLRenderTarget;
    try {
      target = pmrem.fromScene(scene, 0, 0.04, 20, {
        size: low ? 64 : 128,
        position: v3(anchors.probe),
      });
    } finally {
      pmrem.dispose();
      giveBack();
    }
    if (envTarget) envTarget.dispose();
    envTarget = target;
    envMap = target.texture;
    for (const m of envMaterials) {
      m.envMap = target.texture;
      m.needsUpdate = true;
    }
  }

  const room: StoryRoom = {
    root,
    rig,
    anchors,
    tier,
    nodes,
    handles,
    screen: screenMesh,
    get envMap() {
      return envMap;
    },
    prepare(renderer) {
      // One capture at a time: a call made while another waits runs after it, so the last call's
      // grade is the one the reflections keep.
      queue = queue.catch(() => undefined).then(() => (disposed ? undefined : capture(renderer)));
      return queue;
    },
    setLayer(layer) {
      for (const mesh of nodes.values()) mesh.layers.set(layer);
    },
    setGrade(scheme, amount = 1) {
      const t = clamp01(amount);
      grade = scheme === "dark" ? mixGrade(AFTERNOON, NIGHT, t) : mixGrade(NIGHT, AFTERNOON, t);
      applyLight();
    },
    setPhase(next) {
      phase = next;
      applyPhase();
      applyLight();
    },
    setPresence(amount) {
      presence = clamp01(amount);
      applyLight();
    },
    screenMaterial(material) {
      screenMesh.material = material ?? screenOff;
    },
    lamps(intensity) {
      lampLevel = clamp01(intensity);
      applyLight();
    },
    tvGlow(color, intensity) {
      tvColor.set(color);
      tvStrength = Math.max(0, intensity);
      applyLight();
    },
    dispose() {
      disposed = true;
      root.removeFromParent();
      for (const m of created) m.dispose();
      for (const m of sources) m.dispose();
      glowGeo.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const t of textures) t.dispose();
      if (envTarget) envTarget.dispose();
      envTarget = null;
      envMap = null;
      key.dispose();
      rim.dispose();
      fill.dispose();
      hemi.dispose();
      tv.dispose();
    },
  };
  return room;
}

function glowPart(l: LampAnchor) {
  return { centre: v3(l.glow.centre), normal: v3(l.glow.normal), radius: l.glow.radius };
}
