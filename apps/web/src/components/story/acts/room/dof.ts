import {
  BufferAttribute,
  BufferGeometry,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type Color,
  type PerspectiveCamera,
  type WebGLRenderer,
} from "three";

/**
 * The table act's lens: a toy photographer's shallow depth of field. The
 * act renders the room into a target of its own (display bytes, the same
 * programs as the canvas, with depth), blurs a half resolution copy by each
 * pixel's circle of confusion (a gather over a golden angle disc, bright
 * samples weighted up so lamps and glints turn into bokeh), and hands the
 * stage a one triangle scene that composites the sharp and the soft frame.
 * The stage's own post (bloom, vignette, grain) then runs on top as usual.
 *
 * Focus is a distance along the view axis and an aperture: a pixel's blur
 * is `aperture * |1 / focus - 1 / depth|` of the largest radius, which is
 * a share of the frame height, so the look holds at any resolution.
 */

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const DEPTH_CHUNK = /* glsl */ `
uniform sampler2D uDepth;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uAperture;
uniform float uMaxRadius;
float linearDepth(vec2 uv) {
  float d = texture2D(uDepth, uv).x;
  return (uNear * uFar) / (uFar - d * (uFar - uNear));
}
// Signed blur radius in full resolution pixels: negative in front of the focus.
float coc(vec2 uv) {
  float z = linearDepth(uv);
  float c = uAperture * (1.0 / uFocus - 1.0 / z);
  return clamp(c, -1.0, 1.0) * uMaxRadius;
}
`;

const PREFILTER_FRAGMENT = /* glsl */ `
uniform sampler2D uColour;
uniform vec2 uTexel;
${DEPTH_CHUNK}
varying vec2 vUv;
void main() {
  // Four taps: a soft downsample. The circle of confusion goes in alpha (half resolution pixels).
  vec3 c = texture2D(uColour, vUv + uTexel * vec2(-0.5, -0.5)).rgb;
  c += texture2D(uColour, vUv + uTexel * vec2(0.5, -0.5)).rgb;
  c += texture2D(uColour, vUv + uTexel * vec2(-0.5, 0.5)).rgb;
  c += texture2D(uColour, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  gl_FragColor = vec4(c * 0.25, coc(vUv) * 0.5);
}
`;

const BLUR_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uMaxRadius;
varying vec2 vUv;
#define TAPS __TAPS__
void main() {
  vec4 centre = texture2D(uSource, vUv);
  float r0 = abs(centre.a);
  float total = 1.0;
  vec3 sum = centre.rgb;
  float near = max(0.0, -centre.a);
  float radius = uMaxRadius * 0.5;
  for (int i = 1; i < TAPS; i++) {
    float k = float(i) / float(TAPS);
    float dist = sqrt(k) * radius;
    float a = float(i) * 2.39996323;
    vec2 offset = vec2(cos(a), sin(a)) * dist;
    vec4 s = texture2D(uSource, vUv + offset * uTexel);
    float rs = abs(s.a);
    // A sample counts where its own blur reaches this pixel; a sharper background never paints over us.
    float reach = smoothstep(dist - 1.0, dist + 1.0, rs);
    float behind = s.a > 0.0 ? smoothstep(dist - 1.0, dist + 1.0, min(rs, r0 + 1.0)) : reach;
    float luma = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
    float w = behind * (1.0 + 3.0 * luma * luma * luma * luma);
    sum += s.rgb * w;
    total += w;
    if (s.a < 0.0) near = max(near, reach * rs);
  }
  gl_FragColor = vec4(sum / total, near);
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uSharp;
uniform sampler2D uSoft;
${DEPTH_CHUNK}
varying vec2 vUv;
void main() {
  vec3 sharp = texture2D(uSharp, vUv).rgb;
  vec4 soft = texture2D(uSoft, vUv);
  float own = abs(coc(vUv));
  float spread = soft.a * 2.0;
  float k = smoothstep(0.6, 2.2, max(own, spread));
  gl_FragColor = vec4(mix(sharp, min(soft.rgb, vec3(1.0)), k), 1.0);
}
`;

/** A triangle that covers the whole frame. */
function fullscreenTriangle() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  return geometry;
}

export type DofSettings = Readonly<{
  /** Focus distance along the view axis, metres. */
  focus: number;
  /** 0 off (everything sharp) to about 1. */
  aperture: number;
  /** The largest blur radius, as a share of the frame height (0.0125 when omitted). */
  maxRadius?: number;
}>;

export class RoomDof {
  /** The scene the stage renders while the lens is on: one triangle. */
  readonly scene = new Scene();
  private readonly geometry = fullscreenTriangle();
  private readonly ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh;
  private readonly prefilter: ShaderMaterial;
  private readonly blur: ShaderMaterial;
  private readonly composite: ShaderMaterial;
  private readonly pass: Mesh;
  private readonly passScene = new Scene();
  private sharp: WebGLRenderTarget | null = null;
  private halfA: WebGLRenderTarget | null = null;
  private halfB: WebGLRenderTarget | null = null;
  private width = 0;
  private height = 0;
  private readonly samples: number;

  constructor(taps: number, samples: number) {
    this.samples = samples;
    const depthUniforms = () => ({
      uDepth: { value: null },
      uNear: { value: 0.01 },
      uFar: { value: 40 },
      uFocus: { value: 1 },
      uAperture: { value: 0 },
      uMaxRadius: { value: 12 },
    });
    this.prefilter = new ShaderMaterial({
      uniforms: { uColour: { value: null }, uTexel: { value: new Vector2() }, ...depthUniforms() },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: PREFILTER_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.blur = new ShaderMaterial({
      uniforms: {
        uSource: { value: null },
        uTexel: { value: new Vector2() },
        uMaxRadius: { value: 12 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BLUR_FRAGMENT.replace("__TAPS__", String(Math.max(8, Math.round(taps)))),
      depthTest: false,
      depthWrite: false,
    });
    this.composite = new ShaderMaterial({
      uniforms: { uSharp: { value: null }, uSoft: { value: null }, ...depthUniforms() },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    for (const material of [this.prefilter, this.blur, this.composite]) material.toneMapped = false;
    this.pass = new Mesh(this.geometry, this.prefilter);
    this.pass.frustumCulled = false;
    this.passScene.add(this.pass);
    this.quad = new Mesh(this.geometry, this.composite);
    this.quad.frustumCulled = false;
    this.quad.name = "story-room-dof";
    this.scene.add(this.quad);
  }

  /**
   * Compiles the three passes for the targets they draw into (the half
   * resolution passes into a float target, the composite into the canvas or
   * the stage's post target), so the first frame through the lens builds no
   * program.
   */
  async compile(renderer: WebGLRenderer) {
    this.ensure(4, 4);
    const previous = renderer.getRenderTarget();
    const jobs: Promise<unknown>[] = [];
    try {
      renderer.setRenderTarget(this.halfA);
      for (const material of [this.prefilter, this.blur]) {
        this.pass.material = material;
        jobs.push(renderer.compileAsync(this.passScene, this.ortho));
      }
      renderer.setRenderTarget(previous);
      jobs.push(renderer.compileAsync(this.scene, this.ortho));
    } finally {
      renderer.setRenderTarget(previous);
      this.pass.material = this.prefilter;
    }
    await Promise.all(jobs);
    this.release();
  }

  private ensure(width: number, height: number) {
    if (this.sharp && width === this.width && height === this.height) return;
    this.release();
    this.width = width;
    this.height = height;
    const depth = new DepthTexture(width, height, UnsignedIntType);
    depth.minFilter = NearestFilter;
    depth.magFilter = NearestFilter;
    // Display bytes, three's XR flag: lit materials run the canvas's programs into it (docs/homepage-story.md).
    const sharp = new WebGLRenderTarget(width, height, {
      type: UnsignedByteType,
      format: RGBAFormat,
      samples: this.samples,
      depthBuffer: true,
      depthTexture: depth,
    });
    sharp.texture.colorSpace = SRGBColorSpace;
    sharp.texture.internalFormat = "RGBA8";
    sharp.texture.minFilter = LinearFilter;
    sharp.texture.generateMipmaps = false;
    Object.assign(sharp, { isXRRenderTarget: true });
    this.sharp = sharp;
    const half = () => {
      const target = new WebGLRenderTarget(Math.max(1, width >> 1), Math.max(1, height >> 1), {
        type: HalfFloatType,
        format: RGBAFormat,
        depthBuffer: false,
      });
      target.texture.minFilter = LinearFilter;
      target.texture.magFilter = LinearFilter;
      target.texture.generateMipmaps = false;
      return target;
    };
    this.halfA = half();
    this.halfB = half();
  }

  /**
   * Allocates the targets for a `width` by `height` drawing buffer ahead of
   * the first frame through the lens (the act calls it late in the card
   * act's drop), so that frame does not stall on about 160 MB of new
   * textures. A no-op while the targets already fit.
   */
  reserve(renderer: WebGLRenderer, width: number, height: number) {
    if (this.sharp && width === this.width && height === this.height) return;
    this.ensure(width, height);
    for (const target of [this.sharp, this.halfA, this.halfB]) {
      if (target) renderer.initRenderTarget(target);
    }
  }

  /**
   * Renders `scene` through the lens for this frame and returns the scene
   * the stage should draw (the composite). `width` and `height` are the
   * drawing buffer's size; `background` is cleared behind the room.
   */
  render(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    width: number,
    height: number,
    settings: DofSettings,
    exposure: number,
    background: Color | null,
  ) {
    this.ensure(width, height);
    const { sharp, halfA, halfB } = this;
    if (!sharp || !halfA || !halfB) return this.scene;
    const previous = renderer.getRenderTarget();
    const exposureBefore = renderer.toneMappingExposure;
    const mask = camera.layers.mask;
    const clearAlpha = renderer.getClearAlpha();
    renderer.toneMappingExposure = exposure;
    renderer.setRenderTarget(sharp);
    if (background) renderer.setClearColor(background, 1);
    else renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    camera.layers.enableAll();
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    camera.layers.mask = mask;
    renderer.toneMappingExposure = exposureBefore;

    const maxRadius = height * (settings.maxRadius ?? 0.0125);
    for (const material of [this.prefilter, this.composite]) {
      const u = material.uniforms;
      u.uDepth.value = sharp.depthTexture;
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      u.uFocus.value = Math.max(0.02, settings.focus);
      u.uAperture.value = settings.aperture;
      u.uMaxRadius.value = maxRadius;
    }
    this.prefilter.uniforms.uColour.value = sharp.texture;
    this.prefilter.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.pass.material = this.prefilter;
    renderer.setRenderTarget(halfA);
    renderer.render(this.passScene, this.ortho);
    this.blur.uniforms.uSource.value = halfA.texture;
    this.blur.uniforms.uTexel.value.set(1 / halfA.width, 1 / halfA.height);
    this.blur.uniforms.uMaxRadius.value = maxRadius;
    this.pass.material = this.blur;
    renderer.setRenderTarget(halfB);
    renderer.render(this.passScene, this.ortho);
    this.composite.uniforms.uSharp.value = sharp.texture;
    this.composite.uniforms.uSoft.value = halfB.texture;
    renderer.setRenderTarget(previous);
    renderer.setClearColor(0x000000, clearAlpha);
    return this.scene;
  }

  /**
   * Lets the targets go (they come back on the next frame through the lens).
   * The act keeps them while it is on screen and frees them only when it
   * sleeps, at the cut to the worlds act, or when the tier drops to low.
   */
  release() {
    this.sharp?.depthTexture?.dispose();
    this.sharp?.dispose();
    this.halfA?.dispose();
    this.halfB?.dispose();
    this.sharp = null;
    this.halfA = null;
    this.halfB = null;
    this.width = 0;
    this.height = 0;
  }

  dispose() {
    this.release();
    this.geometry.dispose();
    this.prefilter.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}
