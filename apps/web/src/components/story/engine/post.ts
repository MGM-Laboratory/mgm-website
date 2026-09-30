import {
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type IUniform,
  type WebGLRenderer,
} from "three";

import {
  POST_DEFAULTS,
  type StoryPostApi,
  type StoryPostParams,
} from "@/components/story/engine/act";

/**
 * Cheap post effects for the story: bloom, vignette, grain, a flash and a
 * fade, all in display space and all in one composite pass (plus a small
 * dual-filter blur chain at a quarter resolution and below when bloom is
 * on). When every effect is off the stage renders straight to the canvas
 * and this costs nothing.
 *
 * The scene target is made to behave exactly like the canvas: it carries
 * three's XR render target flag, so lit materials are tone mapped and
 * encoded to sRGB into it (the same programs as the direct path, so one
 * compile covers both), and its storage is plain RGBA8 so nothing decodes or
 * re-encodes. The backdrop's page colour bytes therefore survive the post
 * path unchanged. This leans on three 0.186's handling of that flag
 * (`WebGLPrograms.getParameters`, `getUnlitUniformColorSpace`); re-check it
 * when three is upgraded.
 */

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BRIGHT = /* glsl */ `
uniform sampler2D tInput;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tInput, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = smoothstep(uThreshold, uThreshold + 0.25, l);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

// Dual filter (Kawase): a 5-tap down and an 8-tap up, half a texel apart.
const DOWN = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uSpread;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uSpread;
  vec3 c = texture2D(tInput, vUv).rgb * 4.0;
  c += texture2D(tInput, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture2D(tInput, vUv + vec2(o.x, -o.y)).rgb;
  c += texture2D(tInput, vUv + vec2(-o.x, o.y)).rgb;
  c += texture2D(tInput, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

const UP = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uSpread;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uSpread;
  vec3 c = texture2D(tInput, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(tInput, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  c += texture2D(tInput, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += texture2D(tInput, vUv + vec2(o.x, o.y)).rgb * 2.0;
  c += texture2D(tInput, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(tInput, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  c += texture2D(tInput, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(tInput, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0, 1.0);
}
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec2 uRes;
uniform vec3 uFlashColor;
uniform float uFlash;
uniform vec3 uFadeColor;
uniform float uFade;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec4 c = texture2D(tScene, vUv);
  if (uBloom > 0.0) {
    vec3 b = texture2D(tBloom, vUv).rgb * uBloom;
    c.rgb += b;
    c.a = max(c.a, clamp(max(b.r, max(b.g, b.b)), 0.0, 1.0));
  }
  if (uVignette > 0.0) {
    vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float v = 1.0 - smoothstep(0.35, 1.05, length(q));
    c.rgb *= mix(1.0, v, uVignette);
  }
  if (uGrain > 0.0) {
    float g = hash(vUv * uRes + fract(uTime) * 61.0) - 0.5;
    c.rgb += g * uGrain * 0.12 * c.a;
  }
  c = mix(c, vec4(uFlashColor, 1.0), uFlash);
  c = mix(c, vec4(uFadeColor, 1.0), uFade);
  gl_FragColor = c;
}
`;

function srgbChannels(hex: number, out: Vector3) {
  return out.set(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

function pass(fragment: string, uniforms: Record<string, IUniform>) {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
}

const BLOOM_LEVELS = 4;

export class StoryPost implements StoryPostApi {
  params: StoryPostParams = { ...POST_DEFAULTS };
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new BufferGeometry();
  private readonly quad: Mesh;
  private readonly bright = pass(BRIGHT, {
    tInput: { value: null },
    uThreshold: { value: 0.8 },
  });
  private readonly down = pass(DOWN, {
    tInput: { value: null },
    uTexel: { value: new Vector2() },
    uSpread: { value: 1 },
  });
  private readonly up = pass(UP, {
    tInput: { value: null },
    uTexel: { value: new Vector2() },
    uSpread: { value: 1 },
  });
  private readonly composite = pass(COMPOSITE, {
    tScene: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uTime: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
    uFlashColor: { value: new Vector3(1, 1, 1) },
    uFlash: { value: 0 },
    uFadeColor: { value: new Vector3() },
    uFade: { value: 0 },
  });
  private target: WebGLRenderTarget | null = null;
  private bloomTargets: WebGLRenderTarget[] = [];
  private samples = 4;
  private width = 1;
  private height = 1;

  constructor() {
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    this.quad = new Mesh(this.geometry, this.composite);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  reset() {
    this.params = { ...POST_DEFAULTS };
  }

  set(params: Partial<StoryPostParams>) {
    Object.assign(this.params, params);
  }

  /** Any effect on this frame (exposure alone needs no pass). */
  get active() {
    const p = this.params;
    return p.bloom > 0 || p.vignette > 0 || p.grain > 0 || p.flash > 0 || p.fade > 0;
  }

  /** MSAA samples of the scene target (0 on the low tier). */
  setSamples(samples: number) {
    if (samples === this.samples) return;
    this.samples = samples;
    this.target?.dispose();
    this.target = null;
  }

  /** The scene target at `width` x `height` device pixels. */
  begin(width: number, height: number): WebGLRenderTarget {
    if (!this.target || width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.target?.dispose();
      const target = new WebGLRenderTarget(width, height, {
        type: UnsignedByteType,
        samples: this.samples,
        depthBuffer: true,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      });
      target.texture.colorSpace = SRGBColorSpace;
      target.texture.internalFormat = "RGBA8";
      Object.assign(target, { isXRRenderTarget: true });
      this.target = target;
      this.disposeBloom();
    }
    return this.target;
  }

  /** Composites the scene target into the canvas with this frame's effects. */
  finish(renderer: WebGLRenderer, time: number) {
    const target = this.target;
    if (!target) return;
    const p = this.params;
    const u = this.composite.uniforms;
    u.tScene.value = target.texture;
    u.uBloom.value = 0;
    if (p.bloom > 0) {
      u.tBloom.value = this.renderBloom(renderer, target, p);
      u.uBloom.value = p.bloom;
    }
    u.uVignette.value = p.vignette;
    u.uGrain.value = p.grain;
    u.uTime.value = time;
    (u.uRes.value as Vector2).set(this.width, this.height);
    srgbChannels(p.flashColor, u.uFlashColor.value as Vector3);
    u.uFlash.value = Math.min(1, Math.max(0, p.flash));
    srgbChannels(p.fadeColor, u.uFadeColor.value as Vector3);
    u.uFade.value = Math.min(1, Math.max(0, p.fade));
    this.draw(renderer, this.composite, null);
  }

  private renderBloom(renderer: WebGLRenderer, source: WebGLRenderTarget, p: StoryPostParams) {
    if (this.bloomTargets.length === 0) {
      let w = this.width;
      let h = this.height;
      for (let i = 0; i < BLOOM_LEVELS; i += 1) {
        w = Math.max(1, w >> 1);
        h = Math.max(1, h >> 1);
        const level = new WebGLRenderTarget(w, h, {
          type: HalfFloatType,
          depthBuffer: false,
          minFilter: LinearFilter,
          magFilter: LinearFilter,
        });
        this.bloomTargets.push(level);
      }
    }
    const levels = this.bloomTargets;
    const first = levels.at(0);
    if (!first) return null;
    this.bright.uniforms.tInput.value = source.texture;
    this.bright.uniforms.uThreshold.value = p.bloomThreshold;
    this.draw(renderer, this.bright, first);
    const spread = 0.75 + p.bloomRadius * 1.5;
    for (let i = 1; i < levels.length; i += 1) {
      const from = levels.at(i - 1);
      const to = levels.at(i);
      if (!from || !to) continue;
      this.down.uniforms.tInput.value = from.texture;
      (this.down.uniforms.uTexel.value as Vector2).set(1 / from.width, 1 / from.height);
      this.down.uniforms.uSpread.value = spread;
      this.draw(renderer, this.down, to);
    }
    for (let i = levels.length - 1; i > 0; i -= 1) {
      const from = levels.at(i);
      const to = levels.at(i - 1);
      if (!from || !to) continue;
      this.up.uniforms.tInput.value = from.texture;
      (this.up.uniforms.uTexel.value as Vector2).set(1 / from.width, 1 / from.height);
      this.up.uniforms.uSpread.value = spread;
      this.draw(renderer, this.up, to);
    }
    return first.texture;
  }

  private draw(
    renderer: WebGLRenderer,
    material: ShaderMaterial,
    target: WebGLRenderTarget | null,
  ) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  /** Compiles every pass (the loading screen warms them with the scene). */
  compile(renderer: WebGLRenderer) {
    for (const material of [this.bright, this.down, this.up, this.composite]) {
      this.quad.material = material;
      renderer.compile(this.scene, this.camera);
    }
    this.quad.material = this.composite;
  }

  private disposeBloom() {
    for (const level of this.bloomTargets) level.dispose();
    this.bloomTargets = [];
  }

  /** Frees the targets (kept until the next post frame when the stage idles). */
  release() {
    this.target?.dispose();
    this.target = null;
    this.disposeBloom();
  }

  dispose() {
    this.release();
    this.geometry.dispose();
    for (const material of [this.bright, this.down, this.up, this.composite]) material.dispose();
  }
}
