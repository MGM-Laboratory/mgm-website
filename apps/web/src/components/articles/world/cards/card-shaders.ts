import { WORLD_COMMON } from "@/components/articles/world/world-glsl";

/**
 * The card material, shared by a card's two planes (its cover and its text
 * strip), so the whole sheet moves as one piece of paper.
 *
 * Positions are computed from the plane's rest rect (the DOM frame, in
 * viewport CSS px) straight into world space, where one unit is one CSS px
 * on the z = 0 plane. Every effect is keyed on where a vertex would rest on
 * screen, which is what makes the list a river:
 *
 * - Ripple: a slow diagonal swell travels across every card all the time,
 *   lifting a crest of about 24 px toward the camera (paper floating on
 *   water). Crests catch a little light.
 * - The fold: above roughly a third of the viewport height, vertices are
 *   pushed back into the depth (up to 2400 px), wobble sideways and are
 *   pulled down onto the fold line by one to two card heights, by amounts
 *   that differ across the card so the sheet twists as it goes. Perspective
 *   then draws the receding part toward the vanishing point: each card rolls
 *   over an invisible weir near the top and slides away upstream into the
 *   fog, while the next row arrives flat from below.
 * - Depth fade and fog: what is thrown back dissolves into the fog colour
 *   instead of meeting the far plane.
 * - Hover: the picture zooms inside its frame, and the sheet leans toward
 *   the cursor a little.
 */

export const CARD_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec2 uViewport;
  /** The plane's rest rect in viewport CSS px: left, top, width, height. */
  uniform vec4 uRect;
  /** Fold zones in CSS px above the viewport centre: push (x..y) and pull (z..w). */
  uniform vec4 uFold;
  /** How far the fold pulls the sheet down: the cover's height, CSS px. */
  uniform float uPull;
  uniform float uRipple;
  /** Extra depth toward (+) or away from (-) the camera: filters and the intro. */
  uniform float uLift;
  /** Hover lean (radians about x and y) and the pivot's centre in CSS px. */
  uniform vec2 uTilt;
  uniform vec2 uPivot;

  varying vec2 vUv;
  varying float vCrest;
  varying float vDepth;
  varying float vFold;

  void main() {
    vUv = uv;
    vec2 local = position.xy + 0.5;
    vec3 rest = vec3(
      uRect.x + local.x * uRect.z - uViewport.x * 0.5,
      uViewport.y * 0.5 - (uRect.y + (1.0 - local.y) * uRect.w),
      0.0
    );

    vec3 p = rest;

    // Hover lean about the card's own centre (so both planes lean together).
    vec3 q = p - vec3(uPivot, 0.0);
    float cy = cos(uTilt.y), sy = sin(uTilt.y);
    q = vec3(cy * q.x + sy * q.z, q.y, -sy * q.x + cy * q.z);
    float cx = cos(uTilt.x), sx = sin(uTilt.x);
    q = vec3(q.x, cx * q.y - sx * q.z, sx * q.y + cx * q.z);
    p = q + vec3(uPivot, 0.0);

    float swell = sin((rest.x - rest.y) * 0.01 - uTime * 2.0);
    float crest = uRipple * swell;
    p.z += crest + uLift;

    float up = rest.y;
    float push = smoothstep(uFold.x, uFold.y, up);
    float pull = smoothstep(uFold.z, uFold.w, up);
    float wobble = 100.0 * sin((rest.x - rest.y * 0.1) * 0.015 - uTime * 1.1 + 1.7);
    float twist = 0.5 * sin((rest.x + rest.y * 0.1) * 0.005 - uTime * 0.4);
    p.z -= (2400.0 + wobble) * push;
    p.y -= (1.5 - twist) * pull * uPull;

    vCrest = crest;
    vFold = push;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const CARD_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  uniform sampler2D uMap;
  uniform float uHasMap;
  /** 1 for the text strip (a channel-coded glyph mask), 0 for the cover. */
  uniform float uIsText;
  /** Cover fit: texture uv = offset + frame uv * scale. */
  uniform vec4 uMapUv;
  uniform float uInner;
  uniform float uOpacity;
  uniform float uReveal;
  uniform vec3 uPaperLight;
  uniform vec3 uPaperDark;
  uniform vec3 uInkLight;
  uniform vec3 uInkDark;
  uniform vec3 uInkSoftLight;
  uniform vec3 uInkSoftDark;
  uniform float uHover;

  varying vec2 vUv;
  varying float vCrest;
  varying float vDepth;
  varying float vFold;

  void main() {
    float dark = darkAt();
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    vec4 color;
    if (uIsText > 0.5) {
      // R: the title, G: the description, B: the arrow and the rule.
      vec4 m = texture2D(uMap, uv);
      vec3 ink = mix(uInkLight, uInkDark, dark);
      vec3 soft = mix(uInkSoftLight, uInkSoftDark, dark);
      float total = max(m.r + m.g + m.b, 1e-4);
      vec3 rgb = (ink * (m.r + m.b) + soft * m.g) / total;
      color = vec4(rgb, m.a * uHasMap);
    } else {
      vec2 inner = (uv - 0.5) / uInner + 0.5;
      vec3 paper = mix(uPaperLight, uPaperDark, dark);
      vec3 picture = texture2D(uMap, uMapUv.xy + inner * uMapUv.zw).rgb;
      color = vec4(mix(paper, picture, uHasMap * uReveal), 1.0);
      // Crests of the swell catch the light; less of it in the dark.
      color.rgb += smoothstep(0.0, 10.0, vCrest * 0.3) * mix(0.3, 0.14, dark);
      color.rgb += uHover * 0.035;
    }
    color.a *= smoothstep(4000.0, 3000.0, vDepth);
    float fog = smoothstep(1000.0, 9000.0, vDepth);
    color.rgb = mix(color.rgb, worldFogColor(dark), fog);
    color.a *= uOpacity;
    gl_FragColor = color;
  }
`;
