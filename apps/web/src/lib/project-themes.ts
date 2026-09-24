import type { ProjectThemeId } from "@repo/shared";

/**
 * The 20 preset palettes a project detail page can wear (picked per project
 * in the admin editor). Every theme has a light and a dark variant, and the
 * page follows the site's own light/dark mode, so a project keeps its
 * identity in both. The colour roles mirror lusion.co's per-project data
 * (background, text, highlight, button, button hover, icon).
 *
 * Contrast is checked for every variant: text on background at least 7:1,
 * button and hover labels at least 4.5:1, muted text (70% text) at least
 * 4.5:1, highlight and icon at least 3:1
 * (non-text UI). Re-check if you edit a colour.
 */

export type ProjectPalette = {
  bg: string;
  text: string;
  /** Accent: the CTA dot, progress bars, focus rings, selection. */
  highlight: string;
  buttonBg: string;
  buttonText: string;
  buttonBgHover: string;
  buttonTextHover: string;
  /** Small round icon chips (the CTA arrow, the back button). */
  iconBg: string;
  iconColor: string;
};

export type ProjectTheme = {
  id: ProjectThemeId;
  name: string;
  light: ProjectPalette;
  dark: ProjectPalette;
};

export const PROJECT_THEMES: Record<ProjectThemeId, ProjectTheme> = {
  graphite: {
    id: "graphite",
    name: "Graphite",
    light: {
      bg: "#EDF3F1",
      text: "#0E1413",
      highlight: "#0B7F71",
      buttonBg: "#0E1413",
      buttonText: "#FFFFFF",
      buttonBgHover: "#0B7F71",
      buttonTextHover: "#FFFFFF",
      iconBg: "#0E1413",
      iconColor: "#EDF3F1",
    },
    dark: {
      bg: "#121414",
      text: "#FFFFFF",
      highlight: "#64E1CE",
      buttonBg: "#FFFFFF",
      buttonText: "#121414",
      buttonBgHover: "#64E1CE",
      buttonTextHover: "#0B1413",
      iconBg: "#FFFFFF",
      iconColor: "#121414",
    },
  },
  grove: {
    id: "grove",
    name: "Grove",
    light: {
      bg: "#E6F0E8",
      text: "#0F1A12",
      highlight: "#0B7A22",
      buttonBg: "#0F1A12",
      buttonText: "#E6F0E8",
      buttonBgHover: "#0B7A22",
      buttonTextHover: "#FFFFFF",
      iconBg: "#0F1A12",
      iconColor: "#E6F0E8",
    },
    dark: {
      bg: "#111A13",
      text: "#D9F3DE",
      highlight: "#2FC24F",
      buttonBg: "#D9F3DE",
      buttonText: "#111A13",
      buttonBgHover: "#2FC24F",
      buttonTextHover: "#0B120C",
      iconBg: "#D9F3DE",
      iconColor: "#111A13",
    },
  },
  ember: {
    id: "ember",
    name: "Ember",
    light: {
      bg: "#F7ECDF",
      text: "#1A120C",
      highlight: "#B44200",
      buttonBg: "#1A120C",
      buttonText: "#FFEDD7",
      buttonBgHover: "#B44200",
      buttonTextHover: "#FFFFFF",
      iconBg: "#1A120C",
      iconColor: "#FFEDD7",
    },
    dark: {
      bg: "#1A1411",
      text: "#FFEDD7",
      highlight: "#FF6A1F",
      buttonBg: "#FFEDD7",
      buttonText: "#1A1411",
      buttonBgHover: "#FF6A1F",
      buttonTextHover: "#1A0C04",
      iconBg: "#FFEDD7",
      iconColor: "#1A1411",
    },
  },
  nebula: {
    id: "nebula",
    name: "Nebula",
    light: {
      bg: "#EBF0F7",
      text: "#010A16",
      highlight: "#C94F0A",
      buttonBg: "#010A16",
      buttonText: "#FFECE2",
      buttonBgHover: "#C94F0A",
      buttonTextHover: "#FFFFFF",
      iconBg: "#010A16",
      iconColor: "#FFECE2",
    },
    dark: {
      bg: "#010A16",
      text: "#FFECE2",
      highlight: "#FF7225",
      buttonBg: "#FFECE2",
      buttonText: "#010A16",
      buttonBgHover: "#FF7225",
      buttonTextHover: "#130600",
      iconBg: "#FFECE2",
      iconColor: "#010A16",
    },
  },
  sky: {
    id: "sky",
    name: "Sky",
    light: {
      bg: "#E8EEF8",
      text: "#000000",
      highlight: "#0567C0",
      buttonBg: "#FFFFFF",
      buttonText: "#0567C0",
      buttonBgHover: "#0567C0",
      buttonTextHover: "#FFFFFF",
      iconBg: "#FFFFFF",
      iconColor: "#0567C0",
    },
    dark: {
      bg: "#0A1422",
      text: "#EAF3FF",
      highlight: "#3AA8FF",
      buttonBg: "#EAF3FF",
      buttonText: "#0A1422",
      buttonBgHover: "#3AA8FF",
      buttonTextHover: "#021020",
      iconBg: "#EAF3FF",
      iconColor: "#0A1422",
    },
  },
  lavender: {
    id: "lavender",
    name: "Lavender",
    light: {
      bg: "#E3E3F8",
      text: "#000000",
      highlight: "#5646BE",
      buttonBg: "#000000",
      buttonText: "#FFFFFF",
      buttonBgHover: "#5646BE",
      buttonTextHover: "#FFFFFF",
      iconBg: "#000000",
      iconColor: "#E3E3F8",
    },
    dark: {
      bg: "#14132A",
      text: "#ECEBFF",
      highlight: "#A097F4",
      buttonBg: "#ECEBFF",
      buttonText: "#14132A",
      buttonBgHover: "#A097F4",
      buttonTextHover: "#0E0C22",
      iconBg: "#ECEBFF",
      iconColor: "#14132A",
    },
  },
  blush: {
    id: "blush",
    name: "Blush",
    light: {
      bg: "#EFD5D3",
      text: "#000000",
      highlight: "#621422",
      buttonBg: "#FFFFFF",
      buttonText: "#621422",
      buttonBgHover: "#621422",
      buttonTextHover: "#EFD5D3",
      iconBg: "#FFFFFF",
      iconColor: "#621422",
    },
    dark: {
      bg: "#1D0B0E",
      text: "#F8E4E2",
      highlight: "#EE8595",
      buttonBg: "#F8E4E2",
      buttonText: "#1D0B0E",
      buttonBgHover: "#EE8595",
      buttonTextHover: "#1D0B0E",
      iconBg: "#F8E4E2",
      iconColor: "#1D0B0E",
    },
  },
  signal: {
    id: "signal",
    name: "Signal",
    light: {
      bg: "#E1E2E4",
      text: "#000000",
      highlight: "#C4000A",
      buttonBg: "#FFFFFF",
      buttonText: "#C4000A",
      buttonBgHover: "#C4000A",
      buttonTextHover: "#FFFFFF",
      iconBg: "#FFFFFF",
      iconColor: "#C4000A",
    },
    dark: {
      bg: "#131315",
      text: "#F2F2F4",
      highlight: "#FF4A4F",
      buttonBg: "#F2F2F4",
      buttonText: "#131315",
      buttonBgHover: "#FF4A4F",
      buttonTextHover: "#140002",
      iconBg: "#F2F2F4",
      iconColor: "#131315",
    },
  },
  violet: {
    id: "violet",
    name: "Violet",
    light: {
      bg: "#D6C8ED",
      text: "#000000",
      highlight: "#5B1CC9",
      buttonBg: "#000000",
      buttonText: "#FFFFFF",
      buttonBgHover: "#5B1CC9",
      buttonTextHover: "#FFFFFF",
      iconBg: "#FFFFFF",
      iconColor: "#5B1CC9",
    },
    dark: {
      bg: "#140C25",
      text: "#EDE3FF",
      highlight: "#AE86FF",
      buttonBg: "#EDE3FF",
      buttonText: "#140C25",
      buttonBgHover: "#AE86FF",
      buttonTextHover: "#12082A",
      iconBg: "#EDE3FF",
      iconColor: "#140C25",
    },
  },
  iris: {
    id: "iris",
    name: "Iris",
    light: {
      bg: "#DCD5FF",
      text: "#15103A",
      highlight: "#4B34D6",
      buttonBg: "#15103A",
      buttonText: "#FFFFFF",
      buttonBgHover: "#4B34D6",
      buttonTextHover: "#FFFFFF",
      iconBg: "#FFFFFF",
      iconColor: "#15103A",
    },
    dark: {
      bg: "#1B1540",
      text: "#ECE8FF",
      highlight: "#B6AAFF",
      buttonBg: "#FFFFFF",
      buttonText: "#1B1540",
      buttonBgHover: "#B6AAFF",
      buttonTextHover: "#1B1540",
      iconBg: "#FFFFFF",
      iconColor: "#1B1540",
    },
  },
  slate: {
    id: "slate",
    name: "Slate",
    light: {
      bg: "#ECEAF0",
      text: "#22262C",
      highlight: "#654A94",
      buttonBg: "#22262C",
      buttonText: "#FFFFFF",
      buttonBgHover: "#654A94",
      buttonTextHover: "#FFFFFF",
      iconBg: "#22262C",
      iconColor: "#ECEAF0",
    },
    dark: {
      bg: "#2B3037",
      text: "#FFFFFF",
      highlight: "#D5BFEF",
      buttonBg: "#FFFFFF",
      buttonText: "#2B3037",
      buttonBgHover: "#D5BFEF",
      buttonTextHover: "#2B3037",
      iconBg: "#FFFFFF",
      iconColor: "#2B3037",
    },
  },
  mono: {
    id: "mono",
    name: "Mono",
    light: {
      bg: "#F3F4F9",
      text: "#000000",
      highlight: "#000000",
      buttonBg: "#FFFFFF",
      buttonText: "#000000",
      buttonBgHover: "#000000",
      buttonTextHover: "#FFFFFF",
      iconBg: "#FFFFFF",
      iconColor: "#000000",
    },
    dark: {
      bg: "#0B0C0F",
      text: "#FFFFFF",
      highlight: "#FFFFFF",
      buttonBg: "#FFFFFF",
      buttonText: "#000000",
      buttonBgHover: "#2A2C33",
      buttonTextHover: "#FFFFFF",
      iconBg: "#FFFFFF",
      iconColor: "#000000",
    },
  },
  abyss: {
    id: "abyss",
    name: "Abyss",
    light: {
      bg: "#E5F1F7",
      text: "#0F1B30",
      highlight: "#00778F",
      buttonBg: "#FFFFFF",
      buttonText: "#0F1B30",
      buttonBgHover: "#00778F",
      buttonTextHover: "#FFFFFF",
      iconBg: "#FFFFFF",
      iconColor: "#0F1B30",
    },
    dark: {
      bg: "#192743",
      text: "#FFFFFF",
      highlight: "#15E2FE",
      buttonBg: "#FFFFFF",
      buttonText: "#192743",
      buttonBgHover: "#15E2FE",
      buttonTextHover: "#192743",
      iconBg: "#FFFFFF",
      iconColor: "#192743",
    },
  },
  atlas: {
    id: "atlas",
    name: "Atlas",
    light: {
      bg: "#FFFBEA",
      text: "#181818",
      highlight: "#C22D69",
      buttonBg: "#181818",
      buttonText: "#FFFDE0",
      buttonBgHover: "#C22D69",
      buttonTextHover: "#FFFFFF",
      iconBg: "#181818",
      iconColor: "#FFFDE0",
    },
    dark: {
      bg: "#181818",
      text: "#FFFDE0",
      highlight: "#F65893",
      buttonBg: "#FFFDE0",
      buttonText: "#181818",
      buttonBgHover: "#F65893",
      buttonTextHover: "#1A0510",
      iconBg: "#FFFDE0",
      iconColor: "#181818",
    },
  },
  rose: {
    id: "rose",
    name: "Rose",
    light: {
      bg: "#F8EDED",
      text: "#28262B",
      highlight: "#A8424A",
      buttonBg: "#28262B",
      buttonText: "#FFFFFF",
      buttonBgHover: "#A8424A",
      buttonTextHover: "#FFFFFF",
      iconBg: "#28262B",
      iconColor: "#F8EDED",
    },
    dark: {
      bg: "#28262B",
      text: "#FFFFFF",
      highlight: "#FFB9B9",
      buttonBg: "#FFB9B9",
      buttonText: "#28262B",
      buttonBgHover: "#FFFFFF",
      buttonTextHover: "#28262B",
      iconBg: "#FFFFFF",
      iconColor: "#28262B",
    },
  },
  lagoon: {
    id: "lagoon",
    name: "Lagoon",
    light: {
      bg: "#ECE9F7",
      text: "#1E1638",
      highlight: "#0A7F75",
      buttonBg: "#1E1638",
      buttonText: "#FFFFFF",
      buttonBgHover: "#0A7F75",
      buttonTextHover: "#FFFFFF",
      iconBg: "#1E1638",
      iconColor: "#ECE9F7",
    },
    dark: {
      bg: "#261C46",
      text: "#FFFFFF",
      highlight: "#4EF0E1",
      buttonBg: "#4EF0E1",
      buttonText: "#261C46",
      buttonBgHover: "#FFFFFF",
      buttonTextHover: "#261C46",
      iconBg: "#4EF0E1",
      iconColor: "#261C46",
    },
  },
  storybook: {
    id: "storybook",
    name: "Storybook",
    light: {
      bg: "#D1DDF2",
      text: "#000000",
      highlight: "#3F5A7E",
      buttonBg: "#FFFFFF",
      buttonText: "#3F5A7E",
      buttonBgHover: "#3F5A7E",
      buttonTextHover: "#FFFFFF",
      iconBg: "#FFFFFF",
      iconColor: "#3F5A7E",
    },
    dark: {
      bg: "#0F141E",
      text: "#E3EAF7",
      highlight: "#93ADD2",
      buttonBg: "#E3EAF7",
      buttonText: "#0F141E",
      buttonBgHover: "#93ADD2",
      buttonTextHover: "#0F141E",
      iconBg: "#E3EAF7",
      iconColor: "#0F141E",
    },
  },
  sand: {
    id: "sand",
    name: "Sand",
    light: {
      bg: "#D8CDBA",
      text: "#000000",
      highlight: "#6B5232",
      buttonBg: "#FFFFFF",
      buttonText: "#6B5232",
      buttonBgHover: "#6B5232",
      buttonTextHover: "#FFFFFF",
      iconBg: "#FFFFFF",
      iconColor: "#6B5232",
    },
    dark: {
      bg: "#1B1713",
      text: "#EFE6D8",
      highlight: "#D2AE7C",
      buttonBg: "#EFE6D8",
      buttonText: "#1B1713",
      buttonBgHover: "#D2AE7C",
      buttonTextHover: "#1B1713",
      iconBg: "#EFE6D8",
      iconColor: "#1B1713",
    },
  },
  laboratory: {
    id: "laboratory",
    name: "Laboratory",
    light: {
      bg: "#ECF1FA",
      text: "#0E1116",
      highlight: "#2F5DB0",
      buttonBg: "#0E1116",
      buttonText: "#FFFFFF",
      buttonBgHover: "#3A6DC5",
      buttonTextHover: "#FFFFFF",
      iconBg: "#FFFFFF",
      iconColor: "#2F5DB0",
    },
    dark: {
      bg: "#0D1320",
      text: "#EEF3FC",
      highlight: "#7EA4EA",
      buttonBg: "#EEF3FC",
      buttonText: "#0D1320",
      buttonBgHover: "#7EA4EA",
      buttonTextHover: "#0D1320",
      iconBg: "#EEF3FC",
      iconColor: "#0D1320",
    },
  },
  sunburst: {
    id: "sunburst",
    name: "Sunburst",
    light: {
      bg: "#FEF6E0",
      text: "#0E1116",
      highlight: "#8A6100",
      buttonBg: "#0E1116",
      buttonText: "#FEF6E0",
      buttonBgHover: "#F7BF33",
      buttonTextHover: "#0E1116",
      iconBg: "#0E1116",
      iconColor: "#F7BF33",
    },
    dark: {
      bg: "#16130A",
      text: "#FFF4D6",
      highlight: "#F7BF33",
      buttonBg: "#F7BF33",
      buttonText: "#16130A",
      buttonBgHover: "#FFF4D6",
      buttonTextHover: "#16130A",
      iconBg: "#F7BF33",
      iconColor: "#16130A",
    },
  },
};

export type ProjectColorScheme = "light" | "dark";

/** The palette CSS custom properties, prefixed `--project-`. */
export function projectPaletteVars(palette: ProjectPalette): Record<string, string> {
  return {
    "--project-bg": palette.bg,
    "--project-text": palette.text,
    "--project-muted": `color-mix(in srgb, ${palette.text} 70%, ${palette.bg})`,
    "--project-line": `color-mix(in srgb, ${palette.text} 16%, ${palette.bg})`,
    "--project-highlight": palette.highlight,
    "--project-button-bg": palette.buttonBg,
    "--project-button-text": palette.buttonText,
    "--project-button-bg-hover": palette.buttonBgHover,
    "--project-button-text-hover": palette.buttonTextHover,
    "--project-icon-bg": palette.iconBg,
    "--project-icon-color": palette.iconColor,
  };
}

function declarations(palette: ProjectPalette) {
  return Object.entries(projectPaletteVars(palette))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

/**
 * A stylesheet that puts one theme's variables on `selector`, the light
 * variant by default and the dark one under the site's `.dark` class.
 */
export function projectThemeCss(id: ProjectThemeId, selector = ":root") {
  const theme = PROJECT_THEMES[id];
  const darkSelector = selector === ":root" ? ":root.dark" : `.dark ${selector}`;
  return `${selector}{${declarations(theme.light)}}${darkSelector}{${declarations(theme.dark)}}`;
}

/** Parses `#rgb`/`#rrggbb` into 0..1 floats (for WebGL uniforms). */
export function hexToRgb(hex: string): [number, number, number] {
  let value = hex.replace("#", "");
  if (value.length === 3) value = [...value].map((char) => char + char).join("");
  const number = Number.parseInt(value, 16);
  return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
}
