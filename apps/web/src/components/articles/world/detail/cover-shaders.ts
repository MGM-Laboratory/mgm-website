import { WORLD_COMMON } from "@/components/articles/world/world-glsl";

/**
 * The article cover as a sheet of water, drawn by the world on the cover's
 * DOM frame (one world unit is one CSS px on the z = 0 plane, so the frame's
 * viewport rect maps straight onto it).
 *
 * The surface is one height field in CSS px, evaluated with its slope so the
 * vertex shader can lift the sheet and the fragment shader can light and
 * refract it from the same waves:
 *
 * - Emergence: a wave front sweeps across the frame (mostly left to right,
 *   a little up from the bottom edge). Ahead of it the picture is still
 *   under the sea (sunk back, not yet drawn); the crest lifts toward the
 *   reader, foam and spray glitter along it, and behind it the surface
 *   rocks in a damped wake while the picture, still wet and tinted, clears.
 * - Swell: two slow, crossing waves keep the settled surface breathing.
 * - Ripples: rings from the pointer's path and splashes from clicks, each
 *   spreading at a fixed speed and dying away (a ring buffer of eight).
 *
 * The picture is refracted along the slope, split into its channels where
 * the water is steep, and lit with a small specular sheen. The world's fog
 * applies too, so a transition that swallows the library swallows the
 * cover with it.
 */

export const RIPPLE_SLOTS = 8;

const SURFACE = /* glsl */ `
  uniform vec4 uRect;
  uniform float uEmerge;
  uniform float uClock;
  uniform vec4 uRipples[${RIPPLE_SLOTS}];
  uniform float uSwell;

  const float TAU = 6.28318531;

  /** Where the emergence front is measured, 0..1 across the sheet (uv.y up). */
  float frontCoord(vec2 uv) {
    return uv.x * 0.84 + uv.y * 0.16;
  }

  float frontAt() {
    return mix(-0.3, 1.32, uEmerge);
  }

  /**
   * Height (CSS px, toward the reader) and its slope (per CSS px) at a point
   * on the sheet, given in CSS px from its top-left corner.
   */
  vec3 surface(vec2 px) {
    vec2 size = uRect.zw;
    vec2 uv = vec2(px.x / size.x, 1.0 - px.y / size.y);
    float h = 0.0;
    vec2 g = vec2(0.0);

    // The swell: two slow crossing waves.
    vec2 k1 = vec2(0.0105, 0.0042);
    vec2 k2 = vec2(-0.0046, 0.0121);
    float a1 = dot(px, k1) - uClock * 1.15;
    float a2 = dot(px, k2) - uClock * 0.83 + 1.7;
    h += uSwell * (3.6 * sin(a1) + 2.2 * sin(a2));
    g += uSwell * (3.6 * cos(a1) * k1 + 2.2 * cos(a2) * k2);

    // The emergence: crest, wake and the sunk sea ahead of the front.
    if (uEmerge < 0.999) {
      // d/dpx of frontCoord (uv.y runs up, px.y down).
      vec2 ds = vec2(0.84 / size.x, -0.16 / size.y);
      float s = frontCoord(uv);
      float f = frontAt();
      float e = (s - f) / 0.055;
      float crest = 34.0 * exp(-e * e);
      h += crest;
      g += crest * (-2.0 * e / 0.055) * ds;
      float behind = max(f - s, 0.0);
      float wake = 11.0 * sin(behind * 46.0) * exp(-behind * 5.5);
      float wakeD = 11.0 * exp(-behind * 5.5) * (46.0 * cos(behind * 46.0) - 5.5 * sin(behind * 46.0));
      float isBehind = step(s, f);
      h += wake * isBehind;
      g += -wakeD * isBehind * ds;
      float sunkT = clamp((s - f + 0.02) / 0.16, 0.0, 1.0);
      float sunk = sunkT * sunkT * (3.0 - 2.0 * sunkT);
      h -= 90.0 * sunk;
    }

    // Ripples: rings spreading from where the pointer passed or clicked.
    for (int i = 0; i < ${RIPPLE_SLOTS}; i++) {
      vec4 r = uRipples[i];
      if (r.w <= 0.0) continue;
      float age = uClock - r.z;
      if (age < 0.0 || age > 3.2) continue;
      vec2 d = px - r.xy;
      float dist = length(d) + 1e-3;
      float radius = age * 360.0;
      float band = (dist - radius) / 70.0;
      float envelope = exp(-band * band) * exp(-age * 1.35) * r.w;
      float phase = dist * 0.085 - age * 30.0;
      float wave = 13.0 * envelope * sin(phase);
      float dwave = 13.0 * envelope * (0.085 * cos(phase) - sin(phase) * 2.0 * band / 70.0);
      h += wave;
      g += dwave * (d / dist);
    }
    return vec3(h, g);
  }
`;

export const COVER_VERTEX = /* glsl */ `
  uniform vec2 uViewport;
  uniform vec2 uTilt;
  uniform float uLift;
  ${SURFACE}

  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vUv = uv;
    vec2 local = position.xy + 0.5;
    vec2 px = vec2(local.x * uRect.z, (1.0 - local.y) * uRect.w);
    vec3 s = surface(px);
    vec3 p = vec3(
      uRect.x + px.x - uViewport.x * 0.5,
      uViewport.y * 0.5 - (uRect.y + px.y),
      s.x + uLift
    );
    // A lean toward the pointer, about the sheet's own centre.
    vec3 centre = vec3(uRect.x + uRect.z * 0.5 - uViewport.x * 0.5, uViewport.y * 0.5 - uRect.y - uRect.w * 0.5, 0.0);
    vec3 q = p - centre;
    float cy = cos(uTilt.y), sy = sin(uTilt.y);
    q = vec3(cy * q.x + sy * q.z, q.y, -sy * q.x + cy * q.z);
    float cx = cos(uTilt.x), sx = sin(uTilt.x);
    q = vec3(q.x, cx * q.y - sx * q.z, sx * q.y + cx * q.z);
    p = q + centre;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const COVER_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  uniform sampler2D uMap;
  uniform float uHasMap;
  /** Cover fit: texture uv = offset + frame uv * scale. */
  uniform vec4 uMapUv;
  uniform float uRadius;
  uniform float uOpacity;
  uniform vec3 uThemeTint;
  uniform float uSplit;
  ${SURFACE}

  varying vec2 vUv;
  varying float vDepth;

  vec3 picture(vec2 uv) {
    return texture2D(uMap, uMapUv.xy + clamp(uv, 0.001, 0.999) * uMapUv.zw).rgb;
  }

  void main() {
    float dark = darkAt();
    vec2 size = uRect.zw;
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    vec2 px = uv * size;
    vec3 s = surface(px);
    vec2 slope = s.yz;

    // Refraction and a channel split where the water is steep.
    vec2 bend = slope * 0.011;
    float steep = clamp(length(slope) * 1.6, 0.0, 1.0);
    vec2 split = slope * (0.0035 + uSplit * 0.003) * (0.4 + steep);
    vec3 color = vec3(
      picture(uv + bend + split).r,
      picture(uv + bend).g,
      picture(uv + bend - split).b
    );

    // Emergence: drawn only behind the front, wet and tinted just behind it.
    float alpha = 1.0;
    if (uEmerge < 0.999) {
      vec2 fuv = vec2(uv.x, 1.0 - uv.y);
      float sCoord = frontCoord(fuv);
      float f = frontAt();
      float n = worldNoise(px * vec2(0.022, 0.05) + vec2(0.0, uClock * 0.6));
      float n2 = worldNoise(px * 0.09 - uClock * 1.3);
      float edge = sCoord - f + (n - 0.5) * 0.05 + (n2 - 0.5) * 0.018;
      alpha = smoothstep(0.012, -0.012, edge);
      float wet = smoothstep(-0.26, 0.0, edge) * alpha;
      color = mix(color, color * 0.72 + uThemeTint * 0.28, wet * 0.55);
      // Foam along the front, and spray just ahead of it.
      float foam = exp(-pow(edge / 0.016, 2.0)) * (0.55 + 0.45 * n2);
      vec2 cell = floor(px / 3.0);
      float spray = step(0.972, worldHash(cell + floor(uClock * 14.0)))
        * smoothstep(0.07, 0.0, edge) * step(0.0, edge);
      vec3 foamColor = mix(vec3(1.0, 0.995, 0.975), vec3(0.78, 0.86, 1.0), dark);
      color = mix(color, foamColor, clamp(foam * 0.95, 0.0, 1.0));
      color += foamColor * spray * 0.9;
      alpha = max(alpha, clamp(foam * 1.2 + spray, 0.0, 1.0));
    }

    // A small sheen off the slopes (light from the top left).
    vec3 normal = normalize(vec3(-slope * 3.2, 1.0));
    vec3 light = normalize(vec3(-0.45, 0.55, 0.7));
    vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
    float sheen = pow(max(dot(normal, halfway), 0.0), 60.0) * steep;
    vec3 sheenColor = mix(vec3(1.0, 0.98, 0.93), vec3(0.72, 0.82, 1.0), dark);
    color += sheenColor * sheen * mix(0.55, 0.4, dark);
    color *= 1.0 + s.x * 0.0022;

    // Rounded corners, antialiased over a pixel.
    vec2 q = abs(px - size * 0.5) - (size * 0.5 - uRadius);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
    float corner = clamp(0.5 - sd, 0.0, 1.0);

    float fogged = worldFogAmount(vDepth, 0.0);
    color = mix(color, worldFogColor(dark), fogged);
    gl_FragColor = vec4(color, alpha * corner * uOpacity * uHasMap);
  }
`;
