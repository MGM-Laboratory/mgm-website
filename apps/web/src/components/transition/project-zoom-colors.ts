/**
 * Colour plumbing for the project zoom: resolving any CSS colour (hex,
 * `var()` chains, `color-mix()`) to sRGB through a hidden probe element,
 * and the header tint, which walks the header's `--project-*` palette from
 * one theme to another while a transition plays.
 *
 * The header (site-header.tsx and its CSS) reads `--project-bg`,
 * `--project-text`, `--project-highlight` and the `--project-button-*`
 * variables, each falling back to a site token when unset. A detail page
 * puts its own values on `:root` from a stylesheet the moment it commits,
 * which lands mid-zoom and would snap the header. So for the length of a
 * transition the tint writes every variable inline on `<html>` (inline
 * wins over the page's `:root` rule), one property at a time (the scroll
 * lock owns other inline properties on the same element), and removes them
 * again once the page underneath carries the values it ended on.
 */

export type Rgb = readonly [number, number, number];

/** Each tinted variable, with the site token the header falls back to. */
const TINT_VARIABLES = [
  ["--project-bg", "var(--background)"],
  ["--project-text", "var(--foreground)"],
  ["--project-highlight", "var(--focus)"],
  ["--project-button-bg", "var(--foreground)"],
  ["--project-button-text", "var(--background)"],
  ["--project-button-bg-hover", "var(--brand-blue)"],
  ["--project-button-text-hover", "#fff"],
  ["--project-icon-bg", "var(--foreground)"],
  ["--project-icon-color", "var(--background)"],
] as const;

type TintVariable = (typeof TINT_VARIABLES)[number][0];
export type TintPalette = Record<TintVariable, Rgb>;

/** The theme palette fields that feed the tint (project-themes.ts). */
export type ThemeColors = {
  bg: string;
  text: string;
  highlight: string;
  buttonBg: string;
  buttonText: string;
  buttonBgHover: string;
  buttonTextHover: string;
  iconBg: string;
  iconColor: string;
};

// Derived like projectPaletteVars() derives them.
const DERIVED = ["--project-muted", "--project-line"] as const;

const BLACK: Rgb = [0, 0, 0];

let probe: HTMLElement | null = null;

function probeElement() {
  if (probe?.isConnected) return probe;
  probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  Object.assign(probe.style, {
    position: "fixed",
    width: "0",
    height: "0",
    visibility: "hidden",
    pointerEvents: "none",
  });
  document.body.appendChild(probe);
  return probe;
}

/** Parses a computed colour (`rgb()`, `rgba()` or `color(srgb ...)`), 0-255 per channel. */
export function parseColor(value: string): { rgb: Rgb; alpha: number } | null {
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(
    value.trim(),
  );
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : parseAlpha(rgb[4]);
    return { rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])], alpha };
  }
  const srgb =
    /^color\(\s*srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(
      value.trim(),
    );
  if (srgb) {
    const alpha = srgb[4] === undefined ? 1 : parseAlpha(srgb[4]);
    return {
      rgb: [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255],
      alpha,
    };
  }
  return null;
}

function parseAlpha(value: string) {
  return value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
}

/** Resolves any CSS colour expression in the document's context. */
export function resolveColor(value: string, fallback: Rgb = BLACK): Rgb {
  const element = probeElement();
  element.style.color = "";
  element.style.color = value;
  return parseColor(getComputedStyle(element).color)?.rgb ?? fallback;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function toCss(color: Rgb) {
  return `rgb(${Math.round(color[0])} ${Math.round(color[1])} ${Math.round(color[2])})`;
}

/** Normalised 0..1 channels (WebGL uniforms). */
export function toUnit(color: Rgb): [number, number, number] {
  return [color[0] / 255, color[1] / 255, color[2] / 255];
}

/**
 * The colour an element's box shows: its own background composited over
 * its ancestors' until an opaque one (the body as the last resort).
 */
export function backgroundBehind(element: Element | null): Rgb {
  const layers: Array<{ rgb: Rgb; alpha: number }> = [];
  for (let node = element; node; node = node.parentElement) {
    const parsed = parseColor(getComputedStyle(node).backgroundColor);
    if (!parsed || parsed.alpha <= 0) continue;
    layers.push(parsed);
    if (parsed.alpha >= 1) break;
  }
  let color: Rgb = resolveColor("var(--background)", [255, 255, 255]);
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    color = mixRgb(color, layers[i].rgb, layers[i].alpha);
  }
  return color;
}

/** Walks the header palette between two themes; see the module comment. */
export class HeaderTint {
  private from: TintPalette | null = null;
  private to: TintPalette | null = null;
  private readonly written = new Map<string, string>();

  /** What the header shows right now (the page's values, or the site's). */
  current(): TintPalette {
    return this.resolve((name, fallback) => `var(${name}, ${fallback})`);
  }

  /** The site tokens the header falls back to with no project theme. */
  site(): TintPalette {
    return this.resolve((_, fallback) => fallback);
  }

  /** A theme palette, as the tint's colours. */
  theme(colors: ThemeColors): TintPalette {
    const hex = (value: string) => resolveColor(value);
    return {
      "--project-bg": hex(colors.bg),
      "--project-text": hex(colors.text),
      "--project-highlight": hex(colors.highlight),
      "--project-button-bg": hex(colors.buttonBg),
      "--project-button-text": hex(colors.buttonText),
      "--project-button-bg-hover": hex(colors.buttonBgHover),
      "--project-button-text-hover": hex(colors.buttonTextHover),
      "--project-icon-bg": hex(colors.iconBg),
      "--project-icon-color": hex(colors.iconColor),
    };
  }

  /** Starts a walk (and writes its first step). */
  start(from: TintPalette, to: TintPalette) {
    this.from = from;
    this.to = to;
    this.set(0);
  }

  /** Writes the palette at `t` of the way from `from` to `to`. */
  set(t: number) {
    const { from, to } = this;
    if (!from || !to) return;
    const values: Partial<Record<TintVariable, Rgb>> = {};
    for (const [name] of TINT_VARIABLES) {
      values[name] = mixRgb(from[name], to[name], t);
      this.write(name, toCss(values[name]));
    }
    const text = toCss(values["--project-text"] ?? BLACK);
    const bg = toCss(values["--project-bg"] ?? BLACK);
    this.write(DERIVED[0], `color-mix(in srgb, ${text} 70%, ${bg})`);
    this.write(DERIVED[1], `color-mix(in srgb, ${text} 16%, ${bg})`);
  }

  /** Removes every inline value: the page's own (or the site's) apply again. */
  release() {
    const style = document.documentElement.style;
    for (const name of this.written.keys()) style.removeProperty(name);
    this.written.clear();
    this.from = null;
    this.to = null;
  }

  /** How many variables are written inline right now (verification). */
  get size() {
    return this.written.size;
  }

  private write(name: string, value: string) {
    if (this.written.get(name) === value) return;
    this.written.set(name, value);
    document.documentElement.style.setProperty(name, value);
  }

  private resolve(expression: (name: string, fallback: string) => string): TintPalette {
    const palette = {} as Record<TintVariable, Rgb>;
    for (const [name, fallback] of TINT_VARIABLES) {
      palette[name] = resolveColor(expression(name, fallback));
    }
    return palette;
  }
}
