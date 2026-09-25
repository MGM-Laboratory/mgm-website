import { WORLD_COMMON } from "@/components/articles/world/world-glsl";

/**
 * The 3D Home button's materials (home-layer.ts). The pill is the inverse
 * of the library around it, so it reads as an object, never as fog: in the
 * white library it is black lacquer that mirrors the pale stacks and the
 * far window; in the dark library it is moonlit porcelain with a rim of
 * blue light. Its label is printed on the flat front cap. A soft glow
 * behind it and a ring of paper motes answer the hover.
 */

export const PILL_VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  varying vec3 vLocal;
  varying vec3 vNormalLocal;

  void main() {
    vLocal = position;
    vNormalLocal = normal;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mv.xyz;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

export const PILL_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  uniform sampler2D uHomeLabel;
  uniform float uHomeHasLabel;
  /** The pill's front face size, CSS px (the label spans it). */
  uniform vec2 uHomeSize;
  uniform float uHomeHover;
  uniform float uHomeFlash;
  uniform float uHomeOpacity;
  /** The cursor as a small light in front of the page, in view space. */
  uniform vec3 uHomeCursor;
  /** How much the cursor's light counts (0 away or on touch). */
  uniform float uHomeCursorOn;
  uniform vec3 uHomeBodyLight;
  uniform vec3 uHomeBodyDark;
  uniform vec3 uHomeInkLight;
  uniform vec3 uHomeInkDark;
  uniform vec3 uHomeRimLight;
  uniform vec3 uHomeRimDark;

  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  varying vec3 vLocal;
  varying vec3 vNormalLocal;

  /** A pale library to mirror: bright above, the far window up and to the left. */
  vec3 environment(vec3 r, float dark) {
    float sky = smoothstep(-0.35, 0.85, r.y);
    vec3 light = mix(vec3(0.78, 0.8, 0.84), vec3(1.0, 0.995, 0.98), sky);
    vec3 night = mix(vec3(0.02, 0.025, 0.05), vec3(0.16, 0.24, 0.42), sky);
    vec3 env = mix(light, night, dark);
    float window = smoothstep(0.42, 0.78, r.y) * smoothstep(0.62, 0.12, abs(r.x + 0.28));
    env += window * mix(vec3(0.35), vec3(0.55, 0.7, 1.0), dark);
    // The stacks: faint vertical bands low on either side.
    float stacks = smoothstep(0.1, -0.4, r.y) * (0.5 + 0.5 * sin(r.x * 38.0));
    env -= stacks * mix(0.12, -0.03, dark);
    return env;
  }

  void main() {
    float dark = darkAt();
    vec3 n = normalize(vNormalView);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(-vViewPosition);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float fresnel = pow(1.0 - ndv, 4.0);
    vec3 key = normalize(vec3(-0.45, 0.62, 0.64));
    float lambert = max(dot(n, key), 0.0);
    // The flat cap carries the label: its highlights stay soft so the
    // printed "Home" never washes out as the pill tilts toward the cursor
    // (the rounded rim keeps the full gloss, which is where lacquer reads).
    float cap = step(0.5, vNormalLocal.z) * uHomeHasLabel;
    float specK = mix(1.0, 0.28, cap);
    float spec = pow(max(dot(n, normalize(key + v)), 0.0), 140.0) * specK;
    vec3 cursorLight = normalize(uHomeCursor - vViewPosition);
    float glint = pow(max(dot(n, normalize(cursorLight + v)), 0.0), 260.0) * uHomeCursorOn * specK;
    vec3 r = reflect(-v, n);

    // Light scheme: black lacquer mirroring the white library.
    vec3 lacquer = uHomeBodyLight * (0.6 + 0.4 * lambert);
    lacquer = mix(lacquer, environment(r, 0.0), 0.06 + 0.8 * fresnel);
    lacquer += vec3(1.0) * (spec * 0.85 + glint * (0.25 + 0.5 * uHomeHover));
    lacquer += uHomeRimLight * fresnel * 0.35 * (0.4 + uHomeHover);

    // Dark scheme: porcelain under moonlight, a blue rim.
    vec3 porcelain = uHomeBodyDark * (0.32 + 0.72 * lambert);
    porcelain = mix(porcelain, environment(r, 1.0) + uHomeBodyDark * 0.2, 0.25 * fresnel);
    porcelain += vec3(0.8, 0.88, 1.0) * (spec * 0.55 + glint * (0.2 + 0.4 * uHomeHover));
    porcelain += uHomeRimDark * fresnel * (0.9 + 0.8 * uHomeHover);

    vec3 color = mix(lacquer, porcelain, dark);

    // A soft studio band across the flat cap, so the face reads glossy.
    if (vNormalLocal.z > 0.5) {
      float across = vLocal.y / uHomeSize.y - 0.2 + vLocal.x / uHomeSize.x * 0.22;
      color += exp(-across * across * 26.0) * mix(0.1, 0.07, dark);
    }

    // The label, printed on the flat front cap.
    if (vNormalLocal.z > 0.5 && uHomeHasLabel > 0.5) {
      vec2 uv = vLocal.xy / uHomeSize + 0.5;
      float a = texture2D(uHomeLabel, uv).a;
      vec3 ink = mix(uHomeInkLight, uHomeInkDark, dark);
      color = mix(color, ink, a);
    }

    color = mix(color, vec3(1.0), uHomeFlash);
    color = mix(color, worldFogColor(dark), uSwallow * uSwallow);
    gl_FragColor = vec4(color, uHomeOpacity);
  }
`;

export const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const GLOW_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  uniform float uHomeGlow;
  uniform vec3 uHomeGlowLight;
  uniform vec3 uHomeGlowDark;
  varying vec2 vUv;
  void main() {
    float dark = darkAt();
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p * vec2(1.0, 1.35));
    float glow = exp(-d * d * 3.2) * uHomeGlow;
    vec3 color = mix(uHomeGlowLight, uHomeGlowDark, dark);
    gl_FragColor = vec4(color, glow * mix(0.55, 0.7, dark) * (1.0 - uSwallow));
  }
`;

/**
 * Paper motes: small sheets on a tilted ring around the pill, fluttering
 * as they go (they pass in front of it and behind it), and flung outward
 * when the button bursts.
 */
export const MOTE_VERTEX = /* glsl */ `
  uniform float uTime;
  /** Ring radii (x, y) in CSS px, and the ring's depth radius. */
  uniform vec3 uHomeRing;
  uniform float uHomeMotes;
  uniform float uHomeBurst;
  attribute vec4 aSeed;
  varying float vAlpha;
  varying vec2 vUv;
  varying float vShade;

  void main() {
    vUv = uv;
    float speed = 0.35 + aSeed.z * 0.4;
    float angle = aSeed.x * 6.2831853 + uTime * speed;
    float spread = 1.0 + aSeed.y * 0.28 + uHomeBurst * (2.5 + aSeed.w * 4.0);
    vec3 centre = vec3(
      cos(angle) * uHomeRing.x * spread,
      sin(angle * 2.0 + aSeed.w * 6.0) * uHomeRing.y * 0.45 * spread + sin(angle) * uHomeRing.y * 0.35,
      sin(angle) * uHomeRing.z * spread
    );
    centre.y += uHomeBurst * uHomeBurst * (120.0 + aSeed.y * 220.0);

    // Each sheet flutters about its own axis.
    float spin = uTime * (1.2 + aSeed.w * 2.0) + aSeed.x * 12.0;
    float size = (7.0 + aSeed.y * 6.0) * (0.35 + 0.65 * max(uHomeMotes, uHomeBurst));
    vec3 corner = vec3(position.x * size, position.y * size * 1.3, 0.0);
    float c = cos(spin), s = sin(spin);
    corner = vec3(corner.x * c, corner.y, corner.x * s);
    float t = aSeed.z * 3.0 + uTime * 0.7;
    corner = vec3(corner.x, corner.y * cos(t) - corner.z * sin(t), corner.y * sin(t) + corner.z * cos(t));
    vShade = 0.75 + 0.25 * abs(c);

    vec4 mv = modelViewMatrix * vec4(centre + corner, 1.0);
    vAlpha = max(uHomeMotes, uHomeBurst * (1.0 - uHomeBurst));
    gl_Position = projectionMatrix * mv;
  }
`;

export const MOTE_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  uniform vec3 uHomeMoteLight;
  uniform vec3 uHomeMoteDark;
  varying float vAlpha;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    float dark = darkAt();
    vec2 edge = min(vUv, 1.0 - vUv);
    float soft = smoothstep(0.0, 0.08, min(edge.x, edge.y));
    vec3 color = mix(uHomeMoteLight, uHomeMoteDark, dark) * vShade;
    gl_FragColor = vec4(color, vAlpha * soft * (1.0 - uSwallow));
  }
`;
