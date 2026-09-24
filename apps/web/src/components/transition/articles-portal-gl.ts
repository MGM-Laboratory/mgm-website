import { hexUnit, type PortalPalette } from "@/components/transition/articles-portal-palette";
import type {
  PortalFront,
  PortalFrontFrame,
  PortalFrontScene,
} from "@/components/transition/articles-portal-stage";

/**
 * The portal's WebGL2 layer: everything that passes in front of the page
 * on the way into the library and back out. Raw WebGL2, no three.js (it
 * ships with the root layout's portal and loads only when a navigation
 * into or out of the library is near: the controller imports it on
 * intent).
 *
 * Three draws a frame, on a transparent canvas over the whole screen:
 *
 * 1. The fog. Going in, a wall of luminous fog (white and gold, or ink with
 *    blue fire along its lip) rises from below until the screen is nothing
 *    but fog; on arrival it thins from the heart of the screen outward, in
 *    wisps, onto the library. Going out, a plain flood for a library the
 *    world doesn't draw (the WebGL world floods its own fog).
 * 2. The stream: a few hundred paper fragments and motes of light (embers
 *    and blue sparks in the dark) rising past the camera, or falling like
 *    leaves on the way out. Every particle lives entirely in the vertex
 *    shader, computed from its seeds and the stream clock: no per-frame
 *    buffer uploads, no allocations.
 * 3. The sheet (out only): one sheet of paper that tumbles in from the far
 *    fog and flies at the camera until it fills the screen; on the other
 *    side it dissolves from its centre outward like wet paper.
 *
 * Colours stay in display sRGB and the output is premultiplied, so the
 * palette hex values show as written over the page.
 */

const PIXEL_RATIO = { high: 1.5, low: 1 } as const;
const FIELD_OF_VIEW = (48 * Math.PI) / 180;
const SHEET_COLUMNS = 36;
const SHEET_ROWS = 24;

/** Renderers that are really a CPU: those visitors get the DOM portal. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

// ------------------------------------------------------------------ GLSL

const NOISE = /* glsl */ `
uint scramble(uint v) {
  v ^= v >> 16u;
  v *= 0x7feb352du;
  v ^= v >> 15u;
  v *= 0x846ca68bu;
  v ^= v >> 16u;
  return v;
}

float hash(vec2 cell) {
  uvec2 c = uvec2(ivec2(floor(cell)) + ivec2(65536));
  return float(scramble(c.x ^ scramble(c.y))) * (1.0 / 4294967295.0);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = p - cell;
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * noise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    amplitude *= 0.5;
  }
  return sum / 0.9375;
}
`;

const FULLSCREEN_VERTEX = /* glsl */ `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FOG_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_rise;
uniform float u_thin;
uniform float u_flood;
uniform float u_ghost;
uniform float u_dark;
uniform vec3 u_fog;
uniform vec3 u_glow;
uniform vec3 u_halo;
uniform vec3 u_rim;

${NOISE}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time;
  float slow = fbm(p * 1.5 + vec2(0.0, -t * 0.16));
  float fast = fbm(p * 4.3 + vec2(t * 0.06, -t * 0.45));

  // The wall: its front climbs from below the screen to well above it, a
  // soft body of fog under a torn, rolling edge.
  float front = mix(-0.55, 1.8, u_rise) + (slow - 0.5) * 0.42 + (fast - 0.5) * 0.12;
  float inside = front - uv.y;
  float wall = smoothstep(-0.04, 0.34, inside);
  float lip = exp(-abs(inside - 0.03) * 11.0) * smoothstep(-0.28, 0.0, inside);
  // Blue fire licks along the lip in the dark; light shimmers on it in the light.
  float flicker = 0.62 + 0.38 * noise(vec2(uv.x * 9.0 * aspect, t * 5.5));
  lip *= mix(0.85, flicker * 1.25, u_dark);

  float alpha = max(wall, u_flood);

  // The fog is luminous: a warm heart (a cold blue one in the dark) where
  // the library's light waits behind it.
  vec2 c = (uv - vec2(0.5, 0.55)) * vec2(aspect, 1.0);
  float heart = exp(-dot(c, c) * 2.2);
  vec3 color = u_fog;
  color = mix(color, u_halo, heart * mix(0.16, 0.2, u_dark) * (0.8 + 0.2 * slow));
  color = mix(color, u_glow, heart * heart * mix(0.42, 0.14, u_dark));

  // The ghost of the library's great window, waiting in the fog where the
  // real one will be once the fog parts: a tall arch of light (a ring of
  // blue fire in the dark).
  if (u_ghost > 0.0) {
    vec2 w = vec2((uv.x - 0.5) * aspect, uv.y) + (vec2(slow, fast) - 0.5) * 0.02;
    float d = w.y > 0.66
      ? length(vec2(w.x, w.y - 0.66)) - 0.19
      : max(abs(w.x) - 0.19, 0.4 - w.y);
    float inner = exp(-max(d, 0.0) * 7.0);
    float ring = exp(-abs(d) * mix(70.0, 45.0, u_dark));
    float breathe = 0.85 + 0.15 * sin(t * 2.3);
    color = mix(color, u_glow, inner * mix(0.5, 0.18, u_dark) * u_ghost * breathe);
    color = mix(color, u_rim, ring * mix(0.55, 0.85, u_dark) * u_ghost * mix(1.0, flicker, u_dark));
  }

  // The lip: a band of gold light (blue fire in the dark) along the front.
  float edge = clamp(lip * (1.0 - 0.5 * wall), 0.0, 1.0);
  color = mix(color, u_halo, edge * mix(0.45, 0.35, u_dark));
  color = mix(color, u_rim, edge * mix(0.7, 0.8, u_dark));

  // Arrival: the fog thins from the heart outward, in wisps, with a faint
  // glowing fringe where it parts.
  if (u_thin > 0.0) {
    float r = length(c);
    float field = r * 1.1 + (slow - 0.5) * 0.62 + (fast - 0.5) * 0.18;
    float reach = u_thin * 2.3 - 0.32;
    float keep = smoothstep(reach - 0.34, reach + 0.08, field);
    float fringe = keep * (1.0 - keep) * 4.0;
    color = mix(color, u_rim, fringe * 0.35 * (1.0 - u_thin));
    alpha *= keep * (1.0 - smoothstep(0.86, 1.0, u_thin));
  }

  alpha = clamp(alpha, 0.0, 1.0);
  color += (hash(gl_FragCoord.xy + floor(t * 60.0)) - 0.5) / 255.0;
  outColor = vec4(color * alpha, alpha);
}
`;

const STREAM_VERTEX = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_seed;
layout(location = 2) in vec4 a_look;

uniform mat4 u_projection;
uniform float u_tanHalf;
uniform float u_aspect;
uniform float u_stream;
uniform float u_direction;
uniform float u_amount;
uniform float u_fade;

out vec2 v_uv;
out float v_alpha;
out float v_kind;
out float v_shade;
out float v_mark;
out float v_depth;

const float SPAN = 2.7;

mat3 turn(vec3 axis, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  float k = 1.0 - c;
  vec3 a = normalize(axis);
  return mat3(
    c + a.x * a.x * k, a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s,
    a.x * a.y * k - a.z * s, c + a.y * a.y * k, a.z * a.y * k + a.x * s,
    a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k
  );
}

void main() {
  float kind = a_look.w;
  bool paper = kind < 0.5;
  float z = mix(0.8, 9.5, pow(a_seed.z, 0.8));
  // Screen-space travel: nearer particles cross the screen faster.
  float speed = (paper ? mix(0.22, 0.48, a_seed.w) : mix(0.3, 0.75, a_seed.w)) * 2.2 / sqrt(z);
  float s = u_stream * speed - a_seed.y * SPAN;
  float lifted = step(0.0, s);
  float along = mod(max(s, 0.0), SPAN) - SPAN * 0.5;
  float yN = u_direction * along;
  float sway = sin(u_stream * mix(0.6, 1.5, a_look.x) + a_look.y * 6.2831) * (paper ? 0.07 : 0.03);
  if (u_direction < 0.0) sway *= 2.2;
  float xN = (a_seed.x * 2.0 - 1.0) * 1.15 + sway;
  vec3 centre = vec3(xN * z * u_tanHalf * u_aspect, yN * z * u_tanHalf, -z);

  float size = paper ? mix(0.03, 0.085, a_look.z) : mix(0.006, 0.02, a_look.z);
  vec2 shape = paper ? vec2(1.0, mix(0.62, 1.35, a_look.x)) : vec2(1.0);
  vec3 local = vec3(a_corner * shape * size, 0.0);
  vec3 normal = vec3(0.0, 0.0, 1.0);
  if (paper) {
    // Tumbling: a slow spin about a per-sheet axis, faster for leaves.
    float spin = u_stream * mix(0.7, 2.1, a_look.y) * (u_direction < 0.0 ? 1.6 : 1.0);
    mat3 r = turn(vec3(a_look.x - 0.5, a_look.y - 0.5, 0.35 + a_look.z), spin + a_seed.w * 6.2831);
    local = r * local;
    normal = r * normal;
  }

  gl_Position = u_projection * vec4(centre + local, 1.0);

  // Birth order is its own random, so the first to appear aren't all one size.
  float birth = fract(a_seed.x * 7.13 + a_look.y * 3.71) * 0.999;
  float alive = step(birth, u_amount) * lifted;
  float far = smoothstep(2.0, 9.5, z);
  v_alpha = alive * u_fade * mix(1.0, 0.32, far) * (paper ? 1.0 : mix(0.7, 1.0, a_seed.w));
  v_uv = a_corner + 0.5;
  v_kind = kind;
  v_shade = 0.5 + 0.38 * abs(normal.z) + 0.2 * normal.y;
  v_mark = a_seed.w;
  v_depth = far;
}
`;

const STREAM_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_alpha;
in float v_kind;
in float v_shade;
in float v_mark;
in float v_depth;
out vec4 outColor;

uniform vec3 u_paper;
uniform vec3 u_paperShade;
uniform vec3 u_print;
uniform vec3 u_mote;
uniform vec3 u_ember;
uniform vec3 u_fog;
uniform float u_dark;

void main() {
  if (v_alpha <= 0.001) discard;
  if (v_kind < 0.5) {
    vec2 q = abs(v_uv - 0.5);
    float edge = max(q.x, q.y);
    float cover = 1.0 - smoothstep(0.46, 0.5, edge);
    // A fold across the corner, and a few printed lines on some fragments.
    float fold = step(v_uv.x * 0.8 + v_uv.y, 0.55 + v_mark * 0.5);
    vec3 color = mix(u_paperShade, u_paper, clamp(v_shade, 0.0, 1.0));
    color *= mix(1.0, 0.93, fold * 0.6);
    if (v_mark > 0.5) {
      float row = fract(v_uv.y * 8.0);
      float lineMask = step(0.62, row) * step(0.16, v_uv.x) * step(v_uv.x, 0.84)
        * step(0.18, v_uv.y) * step(v_uv.y, 0.82);
      color = mix(color, u_print, lineMask * 0.3);
    }
    // In the dark the fragments smoulder at their edges.
    color += u_ember * smoothstep(0.3, 0.5, edge) * 0.55 * u_dark * v_mark;
    color = mix(color, u_fog, v_depth * 0.55);
    float alpha = cover * v_alpha;
    outColor = vec4(color * alpha, alpha);
  } else {
    float d = length(v_uv - 0.5) * 2.0;
    float glow = exp(-d * d * 4.5) * (1.0 - smoothstep(0.85, 1.0, d));
    vec3 color = v_kind < 1.5 ? u_mote : u_ember;
    // In the dark, light adds up (premultiplied colour with no coverage).
    // Over a white page added light would vanish, so in the light the
    // motes are gold glints that cover what is under them.
    float a = glow * v_alpha;
    outColor = vec4(color * a * mix(1.0, 1.25, u_dark), a * mix(0.9, 0.0, u_dark));
  }
}
`;

const SHEET_VERTEX = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_uv;

uniform mat4 u_projection;
uniform mat4 u_model;
uniform vec2 u_size;
uniform float u_bend;
uniform float u_wave;
uniform float u_time;

out vec2 v_uv;
out vec3 v_world;

void main() {
  vec2 local = (a_uv - 0.5) * u_size;
  vec3 p = vec3(local, 0.0);
  // A curl about the vertical axis, like a sheet caught by the air.
  float k = u_bend / max(u_size.x, 1e-4);
  if (abs(k) > 1e-5) {
    float r = 1.0 / k;
    float a = local.x * k;
    p = vec3(sin(a) * r, local.y, (1.0 - cos(a)) * r);
  }
  p.z += u_wave * sin(a_uv.x * 5.3 + a_uv.y * 2.1 + u_time * 6.5) * (0.35 + 0.65 * a_uv.y);
  vec4 world = u_model * vec4(p, 1.0);
  v_uv = a_uv;
  v_world = world.xyz;
  gl_Position = u_projection * world;
}
`;

const SHEET_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
in vec3 v_world;
out vec4 outColor;

uniform vec2 u_resolution;
uniform vec2 u_size;
uniform float u_hole;
uniform float u_dark;
uniform vec3 u_paper;
uniform vec3 u_paperShade;
uniform vec3 u_ember;
uniform float u_alpha;

${NOISE}

void main() {
  vec3 normal = normalize(cross(dFdx(v_world), dFdy(v_world)));
  if (!gl_FrontFacing) normal = -normal;
  vec3 light = normalize(vec3(-0.35, 0.6, 0.72));
  float lit = clamp(dot(normal, light), 0.0, 1.0);
  float shade = mix(0.72, 1.0, lit);
  if (!gl_FrontFacing) shade *= 0.9;

  // Paper: the cloudy formation of pulp, and a fine speckle.
  float mottle = fbm(v_uv * vec2(9.0, 6.0));
  float speck = noise(v_uv * vec2(420.0, 280.0));
  vec3 color = mix(u_paperShade, u_paper, shade);
  color *= 0.99 + (mottle - 0.5) * 0.045 + (speck - 0.5) * 0.018;
  // Its edges catch a little shadow (light) or embers (dark).
  vec2 q = abs(v_uv - 0.5) * 2.0;
  float border = smoothstep(0.9, 1.0, max(q.x, q.y));
  color = mix(color, u_paperShade, border * 0.35 * (1.0 - u_dark));
  color += u_ember * border * 0.35 * u_dark;
  float cover = 1.0 - smoothstep(0.985, 1.0, max(q.x, q.y));

  float alpha = cover * u_alpha;
  if (u_hole > 0.0) {
    // Wet paper: a hole opens at the centre of the screen and runs outward,
    // its torn edge fibrous, the paper around it darker and translucent
    // where it has soaked through.
    vec2 screen = gl_FragCoord.xy / u_resolution - 0.5;
    screen.x *= u_resolution.x / u_resolution.y;
    float reach = length(vec2(0.5 * u_resolution.x / u_resolution.y, 0.5));
    float field = length(screen) / reach
      + (fbm(v_uv * 7.0) - 0.5) * 0.3
      + (noise(v_uv * 95.0) - 0.5) * 0.05;
    float h = u_hole * 1.55 - 0.22;
    float open = smoothstep(h, h + 0.018, field);
    float soaked = 1.0 - smoothstep(h, h + 0.16, field);
    color *= 1.0 - soaked * mix(0.07, 0.22, u_dark);
    color += u_ember * soaked * soaked * 0.25 * u_dark;
    alpha *= open * (1.0 - soaked * 0.4);
  }
  if (alpha <= 0.001) discard;
  outColor = vec4(color * alpha, alpha);
}
`;

// ------------------------------------------------------------------ helpers

type Program = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> };

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[articles-portal] shader:", gl.getShaderInfoLog(shader));
    }
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): Program | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return { program, uniforms: new Map() };
}

function uniform(gl: WebGL2RenderingContext, program: Program, name: string) {
  if (!program.uniforms.has(name)) {
    program.uniforms.set(name, gl.getUniformLocation(program.program, name));
  }
  return program.uniforms.get(name) ?? null;
}

// Column-major 4x4 matrices, written into preallocated arrays.
function perspective(out: Float32Array, fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2);
  const depth = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * depth;
  out[11] = -1;
  out[14] = 2 * far * near * depth;
}

/** Rotation (x, then y, then z, applied in that order) and translation. */
function compose(
  out: Float32Array,
  rx: number,
  ry: number,
  rz: number,
  x: number,
  y: number,
  z: number,
) {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  // R = Rz * Ry * Rx
  out[0] = cz * cy;
  out[1] = sz * cy;
  out[2] = -sy;
  out[3] = 0;
  out[4] = cz * sy * sx - sz * cx;
  out[5] = sz * sy * sx + cz * cx;
  out[6] = cy * sx;
  out[7] = 0;
  out[8] = cz * sy * cx + sz * sx;
  out[9] = sz * sy * cx - cz * sx;
  out[10] = cy * cx;
  out[11] = 0;
  out[12] = x;
  out[13] = y;
  out[14] = z;
  out[15] = 1;
}

/** A small seeded generator, so the stream looks the same on every visit. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ renderer

export class PortalGl implements PortalFront {
  readonly kind = "gl" as const;
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly fog: Program;
  private readonly stream: Program;
  private readonly sheet: Program;
  private readonly streamVao: WebGLVertexArrayObject;
  private readonly sheetVao: WebGLVertexArrayObject;
  private readonly fullscreenVao: WebGLVertexArrayObject;
  private readonly seedBuffer: WebGLBuffer;
  private readonly sheetIndexCount: number;
  private readonly projection = new Float32Array(16);
  private readonly model = new Float32Array(16);
  private instances = 0;
  private capacity = 0;
  private scene: PortalFrontScene | null = null;
  private width = 1;
  private height = 1;
  private ratio = 1;
  private lost = false;

  /** A hardware WebGL2 context with every program built, or null. */
  static create(onLost: () => void): PortalGl | null {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.articlesPortalCanvas = "";
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: true,
      });
    } catch {
      gl = null;
    }
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    if (SOFTWARE_RENDERER.test(renderer)) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return null;
    }
    const fog = link(gl, FULLSCREEN_VERTEX, FOG_FRAGMENT);
    const stream = link(gl, STREAM_VERTEX, STREAM_FRAGMENT);
    const sheet = link(gl, SHEET_VERTEX, SHEET_FRAGMENT);
    if (!fog || !stream || !sheet) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return null;
    }
    return new PortalGl(canvas, gl, { fog, stream, sheet }, onLost);
  }

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    programs: { fog: Program; stream: Program; sheet: Program },
    onLost: () => void,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.fog = programs.fog;
    this.stream = programs.stream;
    this.sheet = programs.sheet;

    this.fullscreenVao = gl.createVertexArray();

    // The stream: one quad, instanced.
    this.streamVao = gl.createVertexArray();
    gl.bindVertexArray(this.streamVao);
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.seedBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);

    // The sheet: a grid, so it can bend.
    this.sheetVao = gl.createVertexArray();
    gl.bindVertexArray(this.sheetVao);
    const grid = new Float32Array((SHEET_COLUMNS + 1) * (SHEET_ROWS + 1) * 2);
    let g = 0;
    for (let row = 0; row <= SHEET_ROWS; row += 1) {
      for (let column = 0; column <= SHEET_COLUMNS; column += 1) {
        grid[g++] = column / SHEET_COLUMNS;
        grid[g++] = row / SHEET_ROWS;
      }
    }
    const indices = new Uint16Array(SHEET_COLUMNS * SHEET_ROWS * 6);
    let k = 0;
    for (let row = 0; row < SHEET_ROWS; row += 1) {
      for (let column = 0; column < SHEET_COLUMNS; column += 1) {
        const a = row * (SHEET_COLUMNS + 1) + column;
        const b = a + 1;
        const c = a + SHEET_COLUMNS + 1;
        const d = c + 1;
        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = b;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = d;
      }
    }
    this.sheetIndexCount = indices.length;
    const gridBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, grid, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
      onLost();
    });
  }

  get isLost() {
    return this.lost;
  }

  /** Puts the canvas in the portal's layer and sets the scene up for one run. */
  begin(scene: PortalFrontScene) {
    this.scene = scene;
    scene.root.appendChild(this.canvas);
    this.resize();
    this.buildStream(scene);
    const gl = this.gl;
    const colors = scene.palette;
    this.setColors(this.fog, colors, ["fog", "glow", "halo", "rim"]);
    this.setColors(this.stream, colors, ["paper", "paperShade", "print", "mote", "ember", "fog"]);
    this.setColors(this.sheet, colors, ["paper", "paperShade", "ember"]);
    for (const program of [this.fog, this.stream, this.sheet]) {
      gl.useProgram(program.program);
      gl.uniform1f(uniform(gl, program, "u_dark"), scene.dark ? 1 : 0);
    }
  }

  resize() {
    const scene = this.scene;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const cap = scene?.tier === "low" ? PIXEL_RATIO.low : PIXEL_RATIO.high;
    this.ratio = Math.min(window.devicePixelRatio || 1, cap);
    this.width = width;
    this.height = height;
    const w = Math.max(1, Math.round(width * this.ratio));
    const h = Math.max(1, Math.round(height * this.ratio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    perspective(this.projection, FIELD_OF_VIEW, width / height, 0.05, 60);
  }

  draw(frame: PortalFrontFrame) {
    const gl = this.gl;
    if (this.lost || !this.scene) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const resolution = [this.canvas.width, this.canvas.height] as const;
    const tanHalf = Math.tan(FIELD_OF_VIEW / 2);
    const aspect = this.width / this.height;

    // 1. The fog.
    const fogShows = frame.rise > 0 || frame.flood > 0;
    if (fogShows && frame.thin < 1) {
      const p = this.fog;
      gl.useProgram(p.program);
      gl.uniform2f(uniform(gl, p, "u_resolution"), resolution[0], resolution[1]);
      gl.uniform1f(uniform(gl, p, "u_time"), frame.time);
      gl.uniform1f(uniform(gl, p, "u_rise"), frame.rise);
      gl.uniform1f(uniform(gl, p, "u_thin"), frame.thin);
      gl.uniform1f(uniform(gl, p, "u_flood"), frame.flood);
      gl.uniform1f(uniform(gl, p, "u_ghost"), frame.ghost);
      gl.bindVertexArray(this.fullscreenVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 2. The stream.
    if (frame.amount > 0 && frame.fade > 0 && this.instances > 0) {
      const p = this.stream;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(uniform(gl, p, "u_projection"), false, this.projection);
      gl.uniform1f(uniform(gl, p, "u_tanHalf"), tanHalf);
      gl.uniform1f(uniform(gl, p, "u_aspect"), aspect);
      gl.uniform1f(uniform(gl, p, "u_stream"), frame.stream);
      gl.uniform1f(uniform(gl, p, "u_direction"), this.scene.direction === "in" ? 1 : -1);
      gl.uniform1f(uniform(gl, p, "u_amount"), frame.amount);
      gl.uniform1f(uniform(gl, p, "u_fade"), frame.fade);
      gl.bindVertexArray(this.streamVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instances);
    }

    // 3. The sheet.
    if (frame.sheet > 0 && frame.hole < 1) {
      const pose = sheetPose(frame.sheet, frame.time, tanHalf, aspect);
      const p = this.sheet;
      gl.useProgram(p.program);
      compose(this.model, pose.rx, pose.ry, pose.rz, pose.x, pose.y, pose.z);
      gl.uniformMatrix4fv(uniform(gl, p, "u_projection"), false, this.projection);
      gl.uniformMatrix4fv(uniform(gl, p, "u_model"), false, this.model);
      gl.uniform2f(uniform(gl, p, "u_size"), pose.width, pose.height);
      gl.uniform1f(uniform(gl, p, "u_bend"), pose.bend);
      gl.uniform1f(uniform(gl, p, "u_wave"), pose.wave);
      gl.uniform1f(uniform(gl, p, "u_time"), frame.time);
      gl.uniform2f(uniform(gl, p, "u_resolution"), resolution[0], resolution[1]);
      gl.uniform1f(uniform(gl, p, "u_hole"), frame.hole);
      gl.uniform1f(uniform(gl, p, "u_alpha"), pose.alpha);
      gl.bindVertexArray(this.sheetVao);
      gl.drawElements(gl.TRIANGLES, this.sheetIndexCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
  }

  end() {
    this.scene = null;
    this.canvas.remove();
    if (this.lost) return;
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Free the full-screen buffer until the next run.
    this.canvas.width = this.canvas.height = 1;
  }

  /** Seeds for this run's particles, sorted far to near (paper overlaps correctly). */
  private buildStream(scene: PortalFrontScene) {
    const area = (this.width * this.height) / (1440 * 900);
    const budget = scene.tier === "low" ? 0.55 : 1;
    // Going out it is mostly pages, falling like leaves.
    const share = Math.min(1.35, Math.max(0.4, area)) * budget;
    const papers = Math.round(share * (scene.direction === "in" ? 170 : 210));
    const motes = Math.round(share * (scene.direction === "in" ? 230 : 110));
    const count = papers + motes;
    const random = mulberry32(scene.direction === "in" ? 0x51a7 : 0x2e11);
    const rows: number[][] = [];
    for (let i = 0; i < count; i += 1) {
      const paper = i < papers;
      // Kind: 0 paper, 1 mote, 2 warm spark (a third of the motes).
      const kind = paper ? 0 : random() < (scene.dark ? 0.5 : 0.3) ? 2 : 1;
      rows.push([random(), random(), random(), random(), random(), random(), random(), kind]);
    }
    rows.sort((a, b) => b[2] - a[2]);
    const data = new Float32Array(count * 8);
    rows.forEach((row, i) => data.set(row, i * 8));
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuffer);
    if (count > this.capacity) {
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      this.capacity = count;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    }
    this.instances = count;
  }

  private setColors(program: Program, colors: PortalPalette, names: (keyof PortalPalette)[]) {
    const gl = this.gl;
    gl.useProgram(program.program);
    for (const name of names) {
      gl.uniform3fv(uniform(gl, program, `u_${name}`), hexUnit(colors[name]));
    }
  }
}

/**
 * Where the flying sheet is at `t` (0 far in the fog, 1 flat against the
 * camera, overfilling the screen), in camera space.
 *
 * It grows as its distance closes (the apparent size is 1/z, eased in, so
 * it accelerates at the end like something thrown at you), tumbles from a
 * loose spin to flat, and uncurls as it arrives.
 */
export function sheetPose(t: number, time: number, tanHalf: number, aspect: number) {
  const near = 1;
  const k = Math.min(1, Math.max(0, t));
  const approach = k * k * (1.6 - 0.6 * k);
  const scale = 0.1 + (1 - 0.1) * approach;
  const z = -near / scale;
  const settle = 1 - approach;
  const drift = settle * settle;
  // Overfill the screen at rest so the curl and any rounding never show an edge.
  const height = 2 * near * tanHalf * 1.2;
  const width = height * aspect;
  return {
    x: (-0.55 * drift + Math.sin(time * 1.3) * 0.08 * settle) * -z * tanHalf * aspect,
    y: (0.38 * drift + Math.cos(time * 1.1) * 0.06 * settle) * -z * tanHalf,
    z,
    rx: 0.95 * drift + Math.sin(time * 2.1) * 0.12 * settle,
    ry: -0.8 * drift + Math.cos(time * 1.7) * 0.1 * settle,
    rz: 0.5 * drift,
    width,
    height,
    bend: 1.6 * settle,
    wave: 0.035 * settle * height,
    alpha: Math.min(1, k * 6),
  };
}
