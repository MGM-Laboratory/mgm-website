import { WORLD_COMMON } from "@/components/articles/world/world-glsl";

/**
 * The card material: one sheet per card, spanning its cover (5:2), the
 * 12 px gap under it and the text strip, so the whole card bends as one
 * piece of paper. The fragment shader tells the three regions apart by
 * where the fragment sits on the sheet.
 *
 * Positions come from the sheet's rest rect (the DOM frame, in viewport CSS
 * px) straight into world space, where one unit is one CSS px on the z = 0
 * plane. Every displacement is keyed on where a vertex would rest on
 * screen, which is what makes the list a river:
 *
 * - The swell: a slow diagonal wave travels across every card all the time,
 *   lifting a crest of about 24 px toward the camera (paper floating on
 *   water).
 * - The fold: above a line just under the fixed head, vertices are pushed
 *   back into the depth (up to 2400 px), wobble sideways and are pulled
 *   down onto the fold line by one to two cover heights, by amounts that
 *   differ across the card so the sheet twists as it goes. Perspective then
 *   draws the receding part toward the vanishing point: each card rolls
 *   over an invisible weir and slides away upstream into the fog, while the
 *   next row arrives flat from below.
 * - Hover: the sheet lifts and leans toward the cursor, and a small ring of
 *   ripples follows the cursor across it. A press squashes it into the
 *   water and sends a ripple burst out from the press point.
 *
 * The normal is taken from two neighbouring evaluations of the same
 * displacement, so the paper catches the light where it curls (the swell,
 * the ripples, the fold) and stays exactly as printed where it is flat.
 *
 * Card uniforms carry a `uCard` prefix so they can never collide with the
 * world's shared uniforms (WORLD_COMMON).
 */

export const CARD_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec2 uViewport;
  /** The sheet's rest rect in viewport CSS px: left, top, width, height. */
  uniform vec4 uCardRect;
  /** Fold zones in CSS px above the viewport centre: push (x..y) and pull (z..w). */
  uniform vec4 uCardFold;
  /** How far the fold pulls the sheet down: the cover's height, CSS px. */
  uniform float uCardPull;
  /** The swell's crest height, CSS px. */
  uniform float uCardSwell;
  /** Depth toward (+) or away from (-) the camera, CSS px (hover, filters, the intro). */
  uniform float uCardLift;
  /** Screen offset of the whole sheet, CSS px (the intro's rise). */
  uniform vec2 uCardShift;
  /** Lean toward the cursor, radians about x and y. */
  uniform vec2 uCardTilt;
  /** The cursor's ripple: sheet-local px (x, y) and amplitude (CSS px). */
  uniform vec3 uCardPoint;
  /** The press burst: sheet-local px (x, y), age (s) and amplitude (CSS px). */
  uniform vec4 uCardBurst;
  /** The press squash, 0..1. */
  uniform float uCardSquash;
  /** Extra quad around the sheet, CSS px: room for antialiased edges and the rule. */
  uniform float uCardPad;

  varying vec2 vSheet;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  varying float vFold;
  varying float vCrest;

  vec3 displace(vec2 local, out float crest, out float fold) {
    vec2 screen = uCardRect.xy + local + uCardShift;
    vec3 rest = vec3(screen.x - uViewport.x * 0.5, uViewport.y * 0.5 - screen.y, 0.0);
    vec3 p = rest;

    // Lean about the sheet's centre.
    vec2 c = uCardRect.xy + uCardRect.zw * 0.5 + uCardShift;
    vec3 centre = vec3(c.x - uViewport.x * 0.5, uViewport.y * 0.5 - c.y, 0.0);
    vec3 q = p - centre;
    float cy = cos(uCardTilt.y), sy = sin(uCardTilt.y);
    q = vec3(cy * q.x + sy * q.z, q.y, -sy * q.x + cy * q.z);
    float cx = cos(uCardTilt.x), sx = sin(uCardTilt.x);
    q = vec3(q.x, cx * q.y - sx * q.z, sx * q.y + cx * q.z);
    // The press squashes the sheet a little toward the press point.
    vec2 toPress = local - uCardBurst.xy;
    q.xy -= vec2(toPress.x, -toPress.y) * 0.025 * uCardSquash;
    p = q + centre;

    float swell = sin((rest.x - rest.y) * 0.01 - uTime * 2.0);
    crest = uCardSwell * swell;

    // The cursor's ring of ripples, strongest just around the cursor.
    float d = distance(local, uCardPoint.xy);
    float ring = uCardPoint.z * exp(-d * d / 26000.0) * sin(d * 0.075 - uTime * 7.5);

    // The press burst: one ring that races outward and dies away.
    float b = distance(local, uCardBurst.xy);
    float front = b - uCardBurst.z * 520.0;
    float burst = uCardBurst.w * exp(-front * front / 1800.0) * exp(-uCardBurst.z * 2.2)
                * sin(front * 0.11);

    p.z += crest + ring + burst + uCardLift - uCardSquash * 26.0;

    float up = rest.y;
    float push = smoothstep(uCardFold.x, uCardFold.y, up);
    float pull = smoothstep(uCardFold.z, uCardFold.w, up);
    float wobble = 100.0 * sin((rest.x - rest.y * 0.1) * 0.015 - uTime * 1.1 + 1.7);
    float twist = 0.5 * sin((rest.x + rest.y * 0.1) * 0.005 - uTime * 0.4);
    p.z -= (2400.0 + wobble) * push;
    p.y -= (1.5 - twist) * pull * uCardPull;
    fold = push;
    return p;
  }

  void main() {
    vec2 uv = vec2(position.x + 0.5, 0.5 - position.y);
    vec2 local = uv * (uCardRect.zw + 2.0 * uCardPad) - uCardPad;
    vSheet = local;
    float crest;
    float fold;
    float unused;
    vec3 p = displace(local, crest, fold);
    vec3 px = displace(local + vec2(3.0, 0.0), unused, unused);
    vec3 py = displace(local + vec2(0.0, 3.0), unused, unused);
    // Local y runs down the screen, world y up: this order faces +z when flat.
    vNormal = normalize(cross(py - p, px - p));
    vCrest = crest;
    vFold = fold;
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const CARD_FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  uniform vec4 uCardRect;
  uniform sampler2D uCardCover;
  uniform float uCardHasCover;
  /** Cover fit: texture uv = offset + frame uv * scale. */
  uniform vec4 uCardCoverUv;
  /** The text atlas (see card-textures.ts): alpha coverage only. */
  uniform sampler2D uCardText;
  uniform float uCardHasText;
  /** Atlas size in CSS px, and the title row's top in it. */
  uniform vec3 uCardAtlas;
  /** Sheet layout, CSS px: cover height, text strip top, text strip height. */
  uniform vec3 uCardLayout;
  /** In the strip (CSS px): the title line, the arrow's box, the rule's top. */
  uniform vec4 uCardTitle;
  uniform vec4 uCardArrow;
  uniform float uCardRuleY;
  /** Arrow glyph's left in the atlas's title row. */
  uniform float uCardArrowAtlasX;

  uniform float uCardInner;
  uniform float uCardOpacity;
  uniform float uCardReveal;
  uniform float uCardTextReveal;
  uniform float uCardHover;
  uniform float uCardSweep;
  uniform float uCardRule;
  uniform float uCardRoll;
  uniform float uCardArrowShift;
  uniform float uCardPlaceholder;
  /** The fixed head's bottom (viewport CSS px) and the band over which cards fade out under it. */
  uniform vec2 uCardHead;

  uniform vec3 uCardPaperLight;
  uniform vec3 uCardPaperDark;
  uniform vec3 uCardInkLight;
  uniform vec3 uCardInkDark;
  uniform vec3 uCardSoftLight;
  uniform vec3 uCardSoftDark;
  uniform vec3 uCardAccentLight;
  uniform vec3 uCardAccentDark;

  varying vec2 vSheet;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  varying float vFold;
  varying float vCrest;

  const vec3 LIGHT = vec3(-0.34, 0.52, 0.78);

  float atlasAlpha(vec2 css) {
    return texture2D(uCardText, css / uCardAtlas.xy).a;
  }

  /** The arrow glyph at a point of its own box (0..size), transparent outside it. */
  float arrowGlyph(vec2 q, float size) {
    if (q.x < 0.0 || q.y < 0.0 || q.x > size || q.y > size) return 0.0;
    return atlasAlpha(vec2(uCardArrowAtlasX + q.x, uCardAtlas.z + q.y));
  }

  void main() {
    float dark = darkAt();
    vec2 sheet = vSheet;
    // Edges are antialiased by coverage (the canvas has no MSAA): the quad
    // reaches a few px past the sheet and fades out over one pixel.
    vec2 fw = max(fwidth(sheet), vec2(1e-3));
    float sides = clamp(min(sheet.x, uCardRect.z - sheet.x) / fw.x + 0.5, 0.0, 1.0);
    vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
    vec3 light = normalize(LIGHT);
    // Only the curl lights or shades the paper: a flat sheet shows as printed.
    float shade = dot(n, light) - light.z;
    vec3 view = normalize(cameraPosition - vWorld);
    float sheen = pow(max(dot(n, normalize(light + view)), 0.0), 70.0);

    vec3 paper = mix(uCardPaperLight, uCardPaperDark, dark);
    vec3 ink = mix(uCardInkLight, uCardInkDark, dark);
    vec3 soft = mix(uCardSoftLight, uCardSoftDark, dark);
    vec3 accent = mix(uCardAccentLight, uCardAccentDark, dark);
    vec4 color;

    if (sheet.y < (uCardLayout.x + uCardLayout.y) * 0.5) {
      // The cover.
      float edge = sides
        * clamp(sheet.y / fw.y + 0.5, 0.0, 1.0)
        * clamp((uCardLayout.x - sheet.y) / fw.y + 0.5, 0.0, 1.0);
      vec2 uv = vec2(sheet.x / uCardRect.z, sheet.y / uCardLayout.x);
      vec2 inner = (uv - 0.5) / uCardInner + 0.5;
      vec3 picture = texture2D(uCardCover, uCardCoverUv.xy + inner * uCardCoverUv.zw).rgb;
      vec3 rgb = mix(paper, picture, uCardHasCover * uCardReveal);

      // A sheet waiting for its picture (or a placeholder for a batch in
      // flight) is bare paper with a slow shimmer crossing it.
      float waiting = max(uCardPlaceholder, 1.0 - uCardHasCover * uCardReveal);
      float band = fract((uv.x * 0.7 + uv.y * 0.3) * 0.6 - uTime * 0.28);
      float shimmer = smoothstep(0.0, 0.18, band) * smoothstep(0.42, 0.18, band);
      rgb += waiting * shimmer * mix(0.05, 0.035, dark);

      rgb *= 1.0 + shade * mix(0.42, 0.6, dark);
      rgb += sheen * mix(0.16, 0.1, dark);
      rgb += smoothstep(0.0, 10.0, vCrest * 0.3) * mix(0.12, 0.05, dark);

      // Hover: a soft band of light sweeps once across the picture.
      float s = mix(-0.35, 1.35, uCardSweep);
      float across = uv.x * 0.82 + uv.y * 0.3 - s;
      float glint = exp(-across * across / 0.006) * sin(3.14159 * uCardSweep);
      rgb += glint * mix(0.2, 0.13, dark) * mix(vec3(1.0, 0.98, 0.94), vec3(0.72, 0.82, 1.0), dark);
      rgb += uCardHover * mix(0.03, 0.025, dark);

      // The back of the sheet (seen as it flips over the fold) is paper
      // with the picture showing through.
      if (!gl_FrontFacing) rgb = mix(rgb, paper, 0.6) * 0.94;
      color = vec4(rgb, edge);
    } else {
      // The text strip: the description and the rule in the atlas's first
      // row, the title from its own row (rolled on hover), the arrow from
      // its glyph (slipping out to the southeast as a new one arrives).
      vec2 m = vec2(sheet.x, sheet.y - uCardLayout.y);
      float alpha = 0.0;
      vec3 rgb = soft;

      float base = m.y < -0.5 ? 0.0 : atlasAlpha(m);
      if (m.y >= uCardRuleY - 0.5) {
        float drawn = smoothstep(0.0, 6.0, uCardRule * (uCardRect.z + 12.0) - m.x);
        rgb = mix(ink, accent, drawn);
        // The accent rule is a touch thicker than the resting hairline.
        alpha = max(base, drawn * step(m.y, uCardRuleY + 1.5));
      } else {
        alpha = base;
      }

      vec4 t = uCardTitle;
      if (m.x >= t.x && m.x <= t.x + t.z && m.y >= t.y && m.y <= t.y + t.w) {
        float row = fract((m.y - t.y) / t.w + uCardRoll);
        float a = atlasAlpha(vec2(m.x - t.x, uCardAtlas.z + row * t.w));
        rgb = mix(rgb, ink, a);
        alpha = max(alpha, a);
      }

      vec4 box = uCardArrow;
      if (m.x >= box.x && m.x <= box.x + box.z && m.y >= box.y && m.y <= box.y + box.w) {
        float size = box.z;
        vec2 q = m - box.xy;
        float travel = size * 1.15;
        float away = arrowGlyph(q - vec2(uCardArrowShift * travel), size);
        float incoming = arrowGlyph(q - vec2((uCardArrowShift - 1.0) * travel), size);
        float a = max(away, incoming);
        rgb = mix(rgb, mix(ink, accent, uCardHover * 0.85), a);
        alpha = max(alpha, a);
      }

      // Placeholders carry two soft bars where their lines will be.
      if (uCardPlaceholder > 0.5) {
        float bar1 = step(abs(m.y - (t.y + t.w * 0.5)), t.w * 0.22) * step(m.x, uCardRect.z * 0.58);
        vec4 sub = vec4(0.0, t.y + t.w, uCardRect.z * 0.82, t.w * 0.8);
        float bar2 = step(abs(m.y - (sub.y + sub.w * 0.5)), t.w * 0.18) * step(m.x, sub.z);
        float pulse = 0.5 + 0.5 * sin(uTime * 2.4 - m.x * 0.01);
        rgb = soft;
        alpha = max(bar1, bar2) * mix(0.1, 0.2, pulse);
      }

      alpha *= uCardHasText * uCardTextReveal * sides;
      // Text on the back of the sheet would read mirrored: it fades instead.
      if (!gl_FrontFacing) alpha *= 0.25;
      color = vec4(rgb, alpha);
    }

    // What is thrown back dissolves into the fog, never into the far plane.
    color.a *= smoothstep(4000.0, 3000.0, vDepth);
    float fog = smoothstep(1000.0, 9000.0, vDepth);
    color.rgb = mix(color.rgb, worldFogColor(dark), fog);

    // Sheets rolling up under the fixed head fade out as they pass behind
    // it, so the title, the search and the pills always read.
    float y = worldFragCss().y;
    color.a *= smoothstep(uCardHead.x - uCardHead.y, uCardHead.x, y);

    color.a *= uCardOpacity;
    if (color.a < 0.002) discard;
    gl_FragColor = color;
  }
`;
