import { z } from "zod";

/**
 * The project detail page's editorial fields, shared by the API (which
 * validates and stores them inside each project's JSON record) and the web
 * app (the admin editor and the public page). Everything here is optional on
 * a stored record: projects saved before these fields existed render from
 * their cover, gallery and demo video instead.
 */

/** Preset palettes a project can pick. Each has a light and a dark variant. */
export const PROJECT_THEME_IDS = [
  "graphite",
  "grove",
  "ember",
  "nebula",
  "sky",
  "lavender",
  "blush",
  "signal",
  "violet",
  "iris",
  "slate",
  "mono",
  "abyss",
  "atlas",
  "rose",
  "lagoon",
  "storybook",
  "sand",
  "laboratory",
  "sunburst",
] as const;
export type ProjectThemeId = (typeof PROJECT_THEME_IDS)[number];

export const PROJECT_MEDIA_KINDS = ["image", "video"] as const;
export type ProjectMediaKind = (typeof PROJECT_MEDIA_KINDS)[number];

/** "normal" sits inside the page's vertical padding with rounded corners;
 *  "full" runs edge to edge, the full height of the viewport. */
export const PROJECT_MEDIA_SIZES = ["normal", "full"] as const;
export type ProjectMediaSize = (typeof PROJECT_MEDIA_SIZES)[number];

export const PROJECT_DETAIL_LIMITS = {
  /** Two short paragraphs. Longer copy crowds the title panel on a laptop screen. */
  descriptionMax: 520,
  /** Where the editor starts nudging towards a tighter description. */
  descriptionSoftMax: 450,
  ctaLabelMax: 28,
  servicesMax: 8,
  serviceMax: 32,
  mediaMax: 40,
  mediaAltMax: 200,
} as const;

// Site paths (a single leading slash, never protocol-relative) and http(s)
// URLs only; javascript:, data:, and every other scheme are refused.
const SAFE_URL_PATTERN = /^(\/(?!\/)|https?:\/\/)/i;

export const projectCtaSchema = z.object({
  label: z.string().trim().min(1).max(PROJECT_DETAIL_LIMITS.ctaLabelMax),
  url: z.string().trim().min(1).max(500).regex(SAFE_URL_PATTERN, "Use a URL or a site path."),
});
export type ProjectCta = z.infer<typeof projectCtaSchema>;

export const projectMediaItemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  kind: z.enum(PROJECT_MEDIA_KINDS),
  size: z.enum(PROJECT_MEDIA_SIZES),
  /** An uploaded image or video key, or a `static/<public-path>` key for bundled art. */
  key: z.string().min(1).max(500),
  /** Intrinsic pixel size, recorded at upload so the page lays out before the file loads.
   *  0 means unknown (older uploads); the page then assumes 16:9 until it loads. */
  width: z.number().int().min(0).max(20_000),
  height: z.number().int().min(0).max(20_000),
  alt: z.string().trim().max(PROJECT_DETAIL_LIMITS.mediaAltMax).optional(),
  /** A video's still frame (an image key), shown until playback starts. */
  posterKey: z.string().min(1).max(500).optional(),
});
export type ProjectMediaItem = z.infer<typeof projectMediaItemSchema>;

export const projectDetailFieldsSchema = z.object({
  theme: z.enum(PROJECT_THEME_IDS).optional(),
  description: z.string().trim().max(PROJECT_DETAIL_LIMITS.descriptionMax).optional(),
  cta: projectCtaSchema.optional(),
  services: z
    .array(z.string().trim().min(1).max(PROJECT_DETAIL_LIMITS.serviceMax))
    .max(PROJECT_DETAIL_LIMITS.servicesMax)
    .optional(),
  media: z.array(projectMediaItemSchema).max(PROJECT_DETAIL_LIMITS.mediaMax).optional(),
});
export type ProjectDetailFields = z.infer<typeof projectDetailFieldsSchema>;
