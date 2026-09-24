/**
 * Adaptive ink for the glass site header and the glass nav menu panel.
 *
 * The header and the open menu panel are translucent: whatever scrolls
 * behind them shows through, blurred and tinted. This module decides, per
 * zone of the bar (the logo, the centre, the right-hand controls) and for
 * the open panel, which tint and ink keep the text readable over what is
 * actually behind it. The sampling lives in `header-tone-probe.ts` and the
 * scheduling in `hooks/use-header-tone.ts`. This file holds the shared
 * parts: the colour maths, the decision rule, the provider registry and the
 * resample requests. It stays free of DOM work so pages can import it
 * cheaply.
 *
 * The decision rule (see `decideTone`):
 * 1. The zone's backdrop is the blend of its samples (the blur averages
 *    them in sRGB), passed through the glass's `saturate()`.
 * 2. Its tone is light or dark by that blend's luminance, split where black
 *    and white text contrast equally, with some hysteresis.
 * 3. The glass tint is the preferred surface (the project's background on a
 *    project page, the site background elsewhere) when that surface has the
 *    same tone, otherwise the neutral surface of that tone. The tint follows
 *    the backdrop, so text never sits on a washed-out mismatch.
 * 4. The preferred ink stays while the weakest text in the zone keeps
 *    4.5:1 against every sample seen through the glass. Otherwise the ink
 *    becomes the neutral ink of the zone's tone (near-white or near-black,
 *    whichever contrasts more).
 * 5. If even that ink misses 4.5:1 somewhere, the tint's alpha rises until
 *    it doesn't (a fully opaque tint always passes).
 */

export type Rgb = readonly [number, number, number];
export type Rgba = { rgb: Rgb; alpha: number };
export type Tone = "light" | "dark";

export type HeaderToneZoneId = "logo" | "centre" | "controls" | "panel";
export type HeaderTonePoint = { readonly x: number; readonly y: number };
export type HeaderToneZone = {
  readonly id: HeaderToneZoneId;
  /** Viewport points behind the zone, in CSS pixels. */
  readonly points: readonly HeaderTonePoint[];
};

/** What one point behind the glass shows. `media`: an image, a video or a canvas drew it. */
export type HeaderToneSample = { color: Rgb; media: boolean };

/**
 * A page that knows better than DOM probing what shows behind the header
 * (a WebGL stage that draws its media while the DOM copies are hidden).
 * Returns, per zone, one sample per point, where an undefined entry (or an
 * undefined zone, or an undefined result) leaves those points to the DOM
 * probe.
 */
export type HeaderToneProvider = (
  zones: readonly HeaderToneZone[],
) => ReadonlyArray<ReadonlyArray<HeaderToneSample | undefined> | undefined> | undefined;

const providers: HeaderToneProvider[] = [];
const requestListeners = new Set<() => void>();

/** Registers a tone provider; the latest one answers first. Returns the unregister function. */
export function registerHeaderToneProvider(provider: HeaderToneProvider) {
  providers.unshift(provider);
  return () => {
    const index = providers.indexOf(provider);
    if (index >= 0) providers.splice(index, 1);
  };
}

export function headerToneProviders(): readonly HeaderToneProvider[] {
  return providers;
}

/**
 * Asks the header to sample again soon (throttled, and never while a page
 * transition runs): something behind it changed without a scroll.
 */
export function requestHeaderToneSample() {
  for (const listener of [...requestListeners]) listener();
}

/** The header's scheduler listens here. Returns the unsubscribe. */
export function onHeaderToneRequest(listener: () => void) {
  requestListeners.add(listener);
  return () => {
    requestListeners.delete(listener);
  };
}

// ------------------------------------------------------------- colour maths

function channelToLinear(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToChannel(value: number) {
  const v = Math.min(1, Math.max(0, value));
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return c * 255;
}

/** WCAG relative luminance, 0..1. */
export function luminance(color: Rgb) {
  return (
    0.2126 * channelToLinear(color[0]) +
    0.7152 * channelToLinear(color[1]) +
    0.0722 * channelToLinear(color[2])
  );
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: Rgb, b: Rgb) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `a` blended towards `b` by `t` (0..1), in sRGB like the browser composites. */
export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The CSS `saturate(amount)` colour matrix, applied in sRGB and clamped. */
export function saturateRgb(color: Rgb, amount: number): Rgb {
  const [r, g, b] = color;
  const s = amount;
  const clamp = (value: number) => Math.min(255, Math.max(0, value));
  return [
    clamp((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
    clamp((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
    clamp((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b),
  ];
}

export function rgbCss(color: Rgb) {
  return `rgb(${Math.round(color[0])} ${Math.round(color[1])} ${Math.round(color[2])})`;
}

export function rgbaCss(color: Rgb, alpha: number) {
  return `rgb(${Math.round(color[0])} ${Math.round(color[1])} ${Math.round(color[2])} / ${alpha.toFixed(3)})`;
}

function sameColor(a: Rgb, b: Rgb) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 6;
}

function parseNumber(token: string, percentScale: number) {
  if (token === "none") return 0;
  return token.endsWith("%") ? (Number(token.slice(0, -1)) / 100) * percentScale : Number(token);
}

function parseAlphaToken(token: string | undefined) {
  if (token === undefined) return 1;
  return Math.min(1, Math.max(0, parseNumber(token, 1)));
}

function oklabToRgb(l: number, a: number, b: number): Rgb {
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToChannel(4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1),
    linearToChannel(-1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1),
    linearToChannel(-0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1),
  ];
}

let colorCanvas: CanvasRenderingContext2D | null | undefined;

/** Anything else CSS can express, resolved by the canvas (browser only). */
function parseThroughCanvas(value: string): Rgba | null {
  if (typeof document === "undefined") return null;
  if (colorCanvas === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorCanvas = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = colorCanvas;
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return { rgb: [r, g, b], alpha: a / 255 };
}

/**
 * Parses a CSS colour as computed styles serialise it: `rgb()`/`rgba()`,
 * `color(srgb ...)`, `oklab()`/`oklch()` (what Tailwind's `/NN` opacity
 * utilities compute to), hex, `transparent`, with the canvas as the last
 * resort.
 */
export function parseCssColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (value === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    const number = Number.parseInt(hex.slice(0, 6), 16);
    if (Number.isNaN(number)) return null;
    const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1;
    return { rgb: [(number >> 16) & 255, (number >> 8) & 255, number & 255], alpha };
  }
  const fn = /^([a-z-]+)\((.*)\)$/.exec(value);
  if (!fn) return parseThroughCanvas(input);
  const [, name, body] = fn;
  const [main, alphaPart] = body.split("/").map((part) => part.trim());
  const tokens = main.split(/[\s,]+/).filter(Boolean);
  const alphaToken = alphaPart ?? (tokens.length === 4 ? tokens[3] : undefined);
  if (name === "rgb" || name === "rgba") {
    if (tokens.length < 3) return null;
    return {
      rgb: [parseNumber(tokens[0], 255), parseNumber(tokens[1], 255), parseNumber(tokens[2], 255)],
      alpha: parseAlphaToken(alphaToken),
    };
  }
  if (name === "color" && tokens[0] === "srgb" && tokens.length >= 4) {
    return {
      rgb: [
        parseNumber(tokens[1], 1) * 255,
        parseNumber(tokens[2], 1) * 255,
        parseNumber(tokens[3], 1) * 255,
      ],
      alpha: parseAlphaToken(alphaPart),
    };
  }
  if (name === "oklab" && tokens.length >= 3) {
    return {
      rgb: oklabToRgb(
        parseNumber(tokens[0], 1),
        parseNumber(tokens[1], 0.4),
        parseNumber(tokens[2], 0.4),
      ),
      alpha: parseAlphaToken(alphaPart),
    };
  }
  if (name === "oklch" && tokens.length >= 3) {
    const chroma = parseNumber(tokens[1], 0.4);
    const hue = (parseNumber(tokens[2].replace("deg", ""), 1) * Math.PI) / 180;
    return {
      rgb: oklabToRgb(parseNumber(tokens[0], 1), chroma * Math.cos(hue), chroma * Math.sin(hue)),
      alpha: parseAlphaToken(alphaPart),
    };
  }
  return parseThroughCanvas(input);
}

/** Composites translucent layers (listed top first) over an opaque base. */
export function compositeLayers(base: Rgb, layersTopFirst: readonly Rgba[]): Rgb {
  let color = base;
  for (let index = layersTopFirst.length - 1; index >= 0; index -= 1) {
    const layer = layersTopFirst[index];
    color = mixRgb(color, layer.rgb, layer.alpha);
  }
  return color;
}

// ------------------------------------------------------------- the decision

/** Luminance at which black and white text contrast equally (about 4.58:1 each). */
const CROSSOVER = Math.sqrt(1.05 * 0.05) - 0.05;
/** A backdrop this close to the crossover keeps the tone it already had. */
const HYSTERESIS = 0.04;
/** WCAG AA for text. */
export const TEXT_CONTRAST = 4.5;
/**
 * Extra headroom over imagery: the samples are a downscaled estimate, and
 * a busy picture has bright or dark spots between them. Measured against
 * screenshots, the model ran up to 0.45 optimistic over photographs.
 */
const MEDIA_MARGIN = 0.8;

export type TonePalette = { ink: Rgb; surface: Rgb };

export type TonePreferences = {
  /** The ink and surface the zone wears when they read (theme or site colours). */
  preferred: TonePalette;
  light: TonePalette;
  dark: TonePalette;
  /** The glass tint's base alpha, 0..1. */
  alpha: number;
  /** The glass's `saturate()` amount. */
  saturate: number;
};

export type ToneChoice = {
  tone: Tone;
  ink: Rgb;
  /** The glass tint's colour (at `alpha`), and the opaque surface of this zone. */
  surface: Rgb;
  alpha: number;
  /** The ink differs from the preferred ink. */
  flip: boolean;
  /** Imagery shows behind the zone (the halo turns on). */
  media: boolean;
  /** The weakest text's worst contrast at the chosen alpha (verification). */
  contrast: number;
};

export function toneOf(color: Rgb): Tone {
  return luminance(color) >= CROSSOVER ? "light" : "dark";
}

function meanColor(colors: readonly Rgb[]): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const color of colors) {
    r += color[0];
    g += color[1];
    b += color[2];
  }
  const n = Math.max(1, colors.length);
  return [r / n, g / n, b / n];
}

/**
 * The worst contrast, over every backdrop sample, of text in `ink` at
 * `textMix` opacity on the glass (the tint `surface` at `alpha` over the
 * sample).
 */
export function worstContrast(
  backdrops: readonly Rgb[],
  ink: Rgb,
  surface: Rgb,
  alpha: number,
  textMix: number,
) {
  let worst = Infinity;
  for (const backdrop of backdrops) {
    const glass = mixRgb(backdrop, surface, alpha);
    const text = mixRgb(glass, ink, textMix);
    worst = Math.min(worst, contrastRatio(text, glass));
  }
  return worst;
}

/**
 * Picks the tint, ink and alpha for one zone (see the module comment).
 * `textMix` is the weakest text's opacity in the zone (0.7 for the logo's
 * caption, 1 for full-ink labels). `previous` is the zone's last tone.
 */
export function decideTone(
  samples: readonly HeaderToneSample[],
  preferences: TonePreferences,
  options: { textMix: number; previous?: Tone },
): ToneChoice {
  const { preferred, alpha: baseAlpha, saturate } = preferences;
  const media = samples.some((sample) => sample.media);
  if (!samples.length) {
    return {
      tone: toneOf(preferred.surface),
      ink: preferred.ink,
      surface: preferred.surface,
      alpha: baseAlpha,
      flip: false,
      media,
      contrast: contrastRatio(preferred.ink, preferred.surface),
    };
  }
  const backdrops = samples.map((sample) => saturateRgb(sample.color, saturate));
  const blend = luminance(meanColor(backdrops));
  let tone: Tone = blend >= CROSSOVER ? "light" : "dark";
  if (options.previous && Math.abs(blend - CROSSOVER) < HYSTERESIS) tone = options.previous;

  const surface =
    toneOf(preferred.surface) === tone ? preferred.surface : preferences[tone].surface;
  const required = TEXT_CONTRAST + (media ? MEDIA_MARGIN : 0);

  const keep = worstContrast(backdrops, preferred.ink, surface, baseAlpha, options.textMix);
  if (keep >= required) {
    return {
      tone,
      ink: preferred.ink,
      surface,
      alpha: baseAlpha,
      flip: false,
      media,
      contrast: keep,
    };
  }

  const ink = preferences[tone].ink;
  let alpha = baseAlpha;
  let contrast = worstContrast(backdrops, ink, surface, alpha, options.textMix);
  if (contrast < required) {
    // Raise the tint until the weakest text passes everywhere.
    let low = baseAlpha;
    let high = 1;
    for (let step = 0; step < 12; step += 1) {
      const mid = (low + high) / 2;
      if (worstContrast(backdrops, ink, surface, mid, options.textMix) >= required) high = mid;
      else low = mid;
    }
    alpha = high;
    contrast = worstContrast(backdrops, ink, surface, alpha, options.textMix);
  }
  return { tone, ink, surface, alpha, flip: !sameColor(ink, preferred.ink), media, contrast };
}
