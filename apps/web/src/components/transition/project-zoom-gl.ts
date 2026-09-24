import { encodedSource, whenLoaded } from "@/components/projects/stage/cover-textures";
import { toUnit, type Rgb } from "@/components/transition/project-zoom-colors";
import {
  FIELD_OF_VIEW,
  FOG_SOFTNESS,
  type PreparedPicture,
  type View,
  type ZoomFrame,
  type ZoomRenderer,
  type ZoomSetup,
} from "@/components/transition/project-zoom-frame";
import { randomBetween } from "@/lib/random";

/**
 * The project zoom's WebGL2 renderer: one perspective quad on a canvas
 * inside the overlay, shaded per pixel. Raw WebGL2 (no three.js: this ships
 * with the root layout's overlay, dynamically imported on first use).
 *
 * The fragment shader, per pixel, from the quad's centre outward:
 * - a barrel bulge that grows with the zoom;
 * - the picture zoomed into its centre;
 * - a radial motion blur (taps along the ray to the centre, so the centre
 *   stays sharp and the rim streaks), its length following the zoom speed;
 * - a radial chromatic split (red sampled a little outward, blue inward);
 * - a dissolve into the theme colour whose front moves from the rim to the
 *   centre (or back), broken up by value noise and slightly by brightness,
 *   so it reads as a fog rolling in rather than a clean iris.
 */

const MAX_PIXEL_RATIO = 2;
const MAX_TEXTURE = 2560;
const MAX_TAPS = 16;
// Device px between two streak taps: the tap count follows the streak.
const TAP_SPACING = 2.5;

const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 a_corner;
uniform mat4 u_matrix;
uniform vec2 u_size;
out vec2 v_uv;

void main() {
  v_uv = a_corner;
  vec2 local = (a_corner - 0.5) * u_size;
  gl_Position = u_matrix * vec4(local.x, -local.y, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform float u_hasImage;
uniform vec4 u_crop;
uniform vec2 u_size;
uniform float u_radius;
uniform float u_zoom;
uniform float u_reach;
uniform float u_streak;
uniform int u_taps;
uniform float u_split;
uniform float u_bulge;
uniform float u_fog;
uniform float u_fogSoftness;
uniform vec3 u_fogColor;
uniform vec3 u_backdrop;
uniform float u_alpha;
uniform vec2 u_grainOffset;

const int MAX_TAPS = ${MAX_TAPS};

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

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = p - cell;
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

// The picture at a point given in quad px from the centre, zoom applied.
vec3 picture(vec2 p) {
  vec2 frameUv = p / (u_size * u_zoom) + 0.5;
  vec4 texel = texture(u_image, u_crop.xy + frameUv * u_crop.zw);
  return mix(u_backdrop, texel.rgb, texel.a);
}

void main() {
  vec2 q = (v_uv - 0.5) * u_size;

  // Rounded frame, antialiased over one device pixel.
  vec2 corner = abs(q) - (0.5 * u_size - u_radius);
  float edge = length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - u_radius;
  float coverage = clamp(0.5 - edge / max(fwidth(edge), 1e-4), 0.0, 1.0) * u_alpha;
  if (coverage <= 0.0) discard;

  float r = length(q) / u_reach;
  vec2 bulged = q * (1.0 + u_bulge * r * r);

  vec3 color = u_backdrop;
  if (u_hasImage > 0.5) {
    float spread = u_split * r / u_reach;
    float jitter = hash(gl_FragCoord.xy);
    vec3 sum = vec3(0.0);
    float total = 0.0;
    for (int i = 0; i < MAX_TAPS; i++) {
      if (i >= u_taps) break;
      float t = u_taps > 1 ? (float(i) + jitter) / float(u_taps) : 0.0;
      vec2 p = bulged * (1.0 - t * u_streak / u_reach);
      float weight = 1.0 - 0.6 * t;
      vec3 tap = spread > 0.0
        ? vec3(picture(p * (1.0 + spread)).r, picture(p).g, picture(p * (1.0 - spread)).b)
        : picture(p);
      sum += tap * weight;
      total += weight;
    }
    color = sum / total;
  }

  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float grain = valueNoise(q / u_reach * 3.5 + u_grainOffset) - 0.5;
  float field = r + grain * 0.26 + (0.5 - luma) * 0.12;
  color = mix(color, u_fogColor, smoothstep(u_fog - u_fogSoftness, u_fog, field));

  outColor = vec4(color * coverage, coverage);
}
`;

const UNIFORMS = [
  "u_matrix",
  "u_size",
  "u_image",
  "u_hasImage",
  "u_crop",
  "u_radius",
  "u_zoom",
  "u_reach",
  "u_streak",
  "u_taps",
  "u_split",
  "u_bulge",
  "u_fog",
  "u_fogSoftness",
  "u_fogColor",
  "u_backdrop",
  "u_alpha",
  "u_grainOffset",
] as const;

type Uniform = (typeof UNIFORMS)[number];

// Column-major 4x4 matrices.
type Matrix = Float32Array;

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

function perspective(fieldOfView: number, aspect: number, near: number, far: number): Matrix {
  const f = 1 / Math.tan(fieldOfView / 2);
  const depth = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * depth, -1,
    0, 0, 2 * far * near * depth, 0,
  ]);
}

function translation(x: number, y: number, z: number): Matrix {
  // prettier-ignore
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function turnAboutY(angle: number): Matrix {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // prettier-ignore
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function turnAboutZ(angle: number): Matrix {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // prettier-ignore
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/** The part of the picture an object-cover frame of this aspect shows. */
function coverCrop(naturalWidth: number, naturalHeight: number, aspect: number) {
  const imageAspect = naturalWidth / naturalHeight;
  if (imageAspect > aspect) {
    const width = aspect / imageAspect;
    return [(1 - width) / 2, 0, width, 1] as const;
  }
  const height = imageAspect / aspect;
  return [0, (1 - height) / 2, 1, height] as const;
}

function loadImage(url: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  return image;
}

export class ZoomGl implements ZoomRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly uniforms: Record<Uniform, WebGLUniformLocation | null>;
  private readonly maxTexture: number;
  private view: View = { width: 1, height: 1 };
  private ratio = 1;
  private hasImage = false;
  private crop: readonly [number, number, number, number] = [0, 0, 1, 1];
  private aspect = 1.5;
  private lost = false;

  /** A hardware WebGL2 context with the program built, or null. */
  static create(host: HTMLElement, onLost: () => void): ZoomGl | null {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
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
        // A software rasteriser would crawl through a full-screen shader
        // with up to 48 texture reads a pixel: those get the DOM fallback.
        failIfMajorPerformanceCaveat: true,
      });
    } catch {
      gl = null;
    }
    if (!gl) return null;
    const renderer = new ZoomGl(canvas, gl, onLost);
    if (!renderer.ready) return null;
    host.appendChild(canvas);
    return renderer;
  }

  private readonly ready: boolean = false;

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, onLost: () => void) {
    this.canvas = canvas;
    this.gl = gl;
    const program = gl.createProgram();
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const texture = gl.createTexture();
    this.program = program;
    this.texture = texture;
    this.uniforms = {} as Record<Uniform, WebGLUniformLocation | null>;
    this.maxTexture = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, MAX_TEXTURE);
    if (!vertex || !fragment) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "a_corner");
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(program, name);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const anisotropy = gl.getExtension("EXT_texture_filter_anisotropic");
    if (anisotropy) gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, 4);

    gl.useProgram(program);
    gl.uniform1i(this.uniforms.u_image, 0);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);

    canvas.addEventListener("webglcontextlost", () => {
      this.lost = true;
      onLost();
    });
    this.ready = true;
  }

  get isLost() {
    return this.lost;
  }

  /** Whether the current zoom has a picture on the GPU (verification). */
  get hasPicture() {
    return this.hasImage;
  }

  /**
   * Decodes a cover for upload, off the main thread where the engine can:
   * the page's own cached bytes (the card's <img>, or an address the page
   * shows), cropped to nothing and resized to at most MAX_TEXTURE.
   * Resolves null when the picture can't be loaded.
   */
  async prepare(
    element: HTMLImageElement | null,
    url?: string | null,
  ): Promise<PreparedPicture | null> {
    const image = element ?? (url ? loadImage(url) : null);
    if (!image || !(await whenLoaded(image))) return null;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const address = image.currentSrc || image.src;
    const scale = Math.min(1, this.maxTexture / Math.max(width, height));
    if (typeof createImageBitmap === "function") {
      try {
        const source = await createImageBitmap(await encodedSource(image), {
          resizeWidth: Math.max(1, Math.round(width * scale)),
          resizeHeight: Math.max(1, Math.round(height * scale)),
          resizeQuality: "high",
          premultiplyAlpha: "none",
          imageOrientation: "from-image",
        });
        return { source, width, height, url: address };
      } catch {
        // Older engines reject the options bag: upload the element itself.
      }
    }
    return { source: image, width, height, url: address };
  }

  begin({ view, source, picture, fog, backdrop }: ZoomSetup) {
    const gl = this.gl;
    this.resize(view);
    this.hasImage = false;
    this.aspect = source.rect.width / source.rect.height;
    const prepared =
      picture.prepared ??
      (picture.element?.complete && picture.element.naturalWidth
        ? {
            source: picture.element,
            width: picture.element.naturalWidth,
            height: picture.element.naturalHeight,
            url: "",
          }
        : null);
    if (prepared) this.setPicture(prepared);
    this.setColors(fog, backdrop);
    gl.uniform2f(this.uniforms.u_grainOffset, randomBetween(0, 64), randomBetween(0, 64));
  }

  /**
   * Uploads the zoom's picture: at begin(), or later, mid-zoom, for a
   * picture that arrived late (the quad shows the frame's own background
   * until then, which the dissolve mostly hides).
   */
  setPicture(prepared: PreparedPicture) {
    const gl = this.gl;
    if (this.lost) {
      if (!(prepared.source instanceof HTMLImageElement)) prepared.source.close();
      return;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, prepared.source);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.hasImage = true;
    } catch {
      this.hasImage = false;
    }
    // The pixels live on the GPU now.
    if (!(prepared.source instanceof HTMLImageElement)) prepared.source.close();
    this.crop = coverCrop(prepared.width, prepared.height, this.aspect);
  }

  resize(view: View) {
    this.view = view;
    this.ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(view.width * this.ratio));
    const height = Math.max(1, Math.round(view.height * this.ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(frame: ZoomFrame) {
    const gl = this.gl;
    if (this.lost) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (frame.alpha <= 0) return;

    const { width, height } = this.view;
    const distance = height / 2 / Math.tan(FIELD_OF_VIEW / 2);
    const model = multiply(
      translation(frame.cx - width / 2, height / 2 - frame.cy, 0),
      multiply(turnAboutY(frame.yaw), turnAboutZ(-frame.roll)),
    );
    const matrix = multiply(
      perspective(FIELD_OF_VIEW, width / height, distance / 10, distance * 10),
      multiply(translation(0, 0, -distance), model),
    );

    const u = this.uniforms;
    const taps =
      frame.streak >= 0.5
        ? Math.max(1, Math.min(MAX_TAPS, Math.ceil((frame.streak * this.ratio) / TAP_SPACING)))
        : 1;
    gl.uniformMatrix4fv(u.u_matrix, false, matrix);
    gl.uniform2f(u.u_size, frame.width, frame.height);
    gl.uniform1f(u.u_hasImage, this.hasImage ? 1 : 0);
    gl.uniform4f(u.u_crop, this.crop[0], this.crop[1], this.crop[2], this.crop[3]);
    gl.uniform1f(u.u_radius, Math.min(frame.radius, frame.width / 2, frame.height / 2));
    gl.uniform1f(u.u_zoom, frame.zoom);
    gl.uniform1f(u.u_reach, frame.reach);
    gl.uniform1f(u.u_streak, frame.streak >= 0.5 ? frame.streak : 0);
    gl.uniform1i(u.u_taps, taps);
    gl.uniform1f(u.u_split, frame.split >= 0.25 ? frame.split : 0);
    gl.uniform1f(u.u_bulge, frame.bulge);
    gl.uniform1f(u.u_fog, frame.fog);
    gl.uniform1f(u.u_fogSoftness, FOG_SOFTNESS);
    gl.uniform1f(u.u_alpha, frame.alpha);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  end() {
    const gl = this.gl;
    if (this.lost) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Free the full-screen buffer and the picture until the next zoom.
    this.canvas.width = this.canvas.height = 1;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.hasImage = false;
  }

  private setColors(fog: Rgb, backdrop: Rgb) {
    const gl = this.gl;
    gl.uniform3fv(this.uniforms.u_fogColor, toUnit(fog));
    gl.uniform3fv(this.uniforms.u_backdrop, toUnit(backdrop));
  }
}
