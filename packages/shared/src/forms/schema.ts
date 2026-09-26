import { z } from "zod";

import { PROJECT_THEME_IDS } from "../schemas/project-detail.js";
import { sanitizeRichText, type RichTextDoc } from "./rich-text.js";

/**
 * The form builder's document: everything an admin designs in the editor
 * (questions, content blocks, logic, the welcome and ending screens, the
 * look and the settings). The API validates it with `formDocumentSchema`,
 * stores it as JSON on the form row, and serves a public copy without the
 * admin-only settings (see `toPublicFormDocument`).
 *
 * Field ids are the answer keys, so they must stay stable once a form has
 * responses: the editor mints them once and never rewrites them.
 */

// ---------------------------------------------------------------------------
// Field types
// ---------------------------------------------------------------------------

/** Question types: each one collects an answer. */
export const FORM_INPUT_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "url",
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "multiselect",
  "picture_choice",
  "yes_no",
  "rating",
  "opinion_scale",
  "nps",
  "slider",
  "ranking",
  "matrix",
  "date",
  "time",
  "datetime",
  "file_upload",
  "image_upload",
  "signature",
  "name",
  "address",
  "country",
  "color",
  "consent",
  "hidden",
] as const;
export type FormInputType = (typeof FORM_INPUT_TYPES)[number];

/** Content blocks: shown to the respondent, never answered. */
export const FORM_CONTENT_TYPES = [
  "heading",
  "paragraph",
  "image",
  "video",
  "divider",
  "callout",
  "quote",
  "spacer",
  "page_break",
] as const;
export type FormContentType = (typeof FORM_CONTENT_TYPES)[number];

export const FORM_FIELD_TYPES = [...FORM_INPUT_TYPES, ...FORM_CONTENT_TYPES] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

const INPUT_TYPE_SET = new Set<string>(FORM_INPUT_TYPES);
export function isInputType(type: FormFieldType): type is FormInputType {
  return INPUT_TYPE_SET.has(type);
}

/** Types whose answer is one or more of the field's `options` (by option id). */
export const CHOICE_TYPES = [
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "multiselect",
  "picture_choice",
  "ranking",
] as const satisfies readonly FormInputType[];
const CHOICE_TYPE_SET = new Set<string>(CHOICE_TYPES);
export function isChoiceType(type: FormFieldType) {
  return CHOICE_TYPE_SET.has(type);
}

/** Choice types that accept several options (string[] answers). */
export function isMultiChoiceType(type: FormFieldType, field?: { maxSelections?: number }) {
  if (type === "checkboxes" || type === "multiselect" || type === "ranking") return true;
  if (type === "picture_choice") return (field?.maxSelections ?? 1) > 1;
  return false;
}

/** Types whose answer is a number. */
export const NUMERIC_TYPES = [
  "number",
  "rating",
  "opinion_scale",
  "nps",
  "slider",
] as const satisfies readonly FormInputType[];
const NUMERIC_TYPE_SET = new Set<string>(NUMERIC_TYPES);
export function isNumericType(type: FormFieldType) {
  return NUMERIC_TYPE_SET.has(type);
}

/** Types whose answer is a list of uploaded files. */
export const FILE_TYPES = [
  "file_upload",
  "image_upload",
  "signature",
] as const satisfies readonly FormInputType[];
const FILE_TYPE_SET = new Set<string>(FILE_TYPES);
export function isFileType(type: FormFieldType) {
  return FILE_TYPE_SET.has(type);
}

/**
 * File categories an upload field can accept. The API maps each one to its
 * MIME types and extensions (`FORM_FILE_CATEGORY_TYPES`).
 */
export const FORM_FILE_CATEGORIES = [
  "image",
  "pdf",
  "document",
  "spreadsheet",
  "presentation",
  "audio",
  "video",
  "archive",
  "text",
] as const;
export type FormFileCategory = (typeof FORM_FILE_CATEGORIES)[number];

export const FORM_FILE_CATEGORY_TYPES: Record<
  FormFileCategory,
  { mimes: readonly string[]; extensions: readonly string[] }
> = {
  image: {
    mimes: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/heic"],
    extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif", "heic"],
  },
  pdf: { mimes: ["application/pdf"], extensions: ["pdf"] },
  document: {
    mimes: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text",
      "application/rtf",
    ],
    extensions: ["doc", "docx", "odt", "rtf"],
  },
  spreadsheet: {
    mimes: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.oasis.opendocument.spreadsheet",
      "text/csv",
    ],
    extensions: ["xls", "xlsx", "ods", "csv"],
  },
  presentation: {
    mimes: [
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.oasis.opendocument.presentation",
    ],
    extensions: ["ppt", "pptx", "odp"],
  },
  audio: {
    mimes: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/webm"],
    extensions: ["mp3", "wav", "ogg", "m4a", "weba"],
  },
  video: {
    mimes: ["video/mp4", "video/webm", "video/quicktime"],
    extensions: ["mp4", "webm", "mov"],
  },
  archive: {
    mimes: ["application/zip", "application/x-zip-compressed", "application/x-7z-compressed"],
    extensions: ["zip", "7z"],
  },
  text: { mimes: ["text/plain", "text/markdown"], extensions: ["txt", "md"] },
};

export const FORM_LIMITS = {
  titleMax: 200,
  labelMax: 500,
  placeholderMax: 200,
  helpMax: 500,
  fieldsMax: 250,
  optionsMax: 200,
  optionLabelMax: 300,
  matrixRowsMax: 40,
  matrixColumnsMax: 12,
  conditionsMax: 20,
  jumpsMax: 20,
  endingsMax: 12,
  tagsMax: 20,
  notifyEmailsMax: 10,
  /** Hard cap for a single respondent upload, whatever the field allows. */
  fileMbMax: 100,
  filesPerFieldMax: 20,
  textAnswerMax: 20_000,
} as const;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const idSchema = z.string().regex(ID_PATTERN, "Use letters, numbers, - and _ only.");

// Site paths (a single leading slash, never protocol-relative) and http(s)
// URLs only; javascript:, data:, and every other scheme are refused.
export const SAFE_URL_PATTERN = /^(\/(?!\/)|https?:\/\/)/i;
const safeUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .regex(SAFE_URL_PATTERN, "Use a full http(s) URL or a site path.");

/** Rich text, sanitized to the whitelisted tiptap subset on parse. */
export const richTextSchema = z
  .unknown()
  .transform((value): RichTextDoc | undefined => sanitizeRichText(value));

/**
 * A picture or video placed in the form: an admin upload (`key`, minted by
 * the form media endpoint), a YouTube or Vimeo link, or an external image
 * or video URL.
 */
export const FORM_MEDIA_KINDS = ["image", "video", "youtube", "vimeo"] as const;
export type FormMediaKind = (typeof FORM_MEDIA_KINDS)[number];

export const formMediaSchema = z
  .object({
    kind: z.enum(FORM_MEDIA_KINDS),
    key: z.string().min(1).max(300).optional(),
    url: safeUrlSchema.optional(),
    alt: z.string().trim().max(300).optional(),
    width: z.number().int().min(0).max(20_000).optional(),
    height: z.number().int().min(0).max(20_000).optional(),
    posterKey: z.string().min(1).max(300).optional(),
    fit: z.enum(["cover", "contain"]).optional(),
    /** Focal point in percent, used when a cover crops. */
    focalX: z.number().min(0).max(100).optional(),
    focalY: z.number().min(0).max(100).optional(),
    autoplay: z.boolean().optional(),
    loop: z.boolean().optional(),
    muted: z.boolean().optional(),
    caption: z.string().trim().max(300).optional(),
  })
  .refine((media) => Boolean(media.key || media.url), {
    message: "Upload a file or paste a link.",
  });
export type FormMedia = z.infer<typeof formMediaSchema>;

export const formOptionSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(FORM_LIMITS.optionLabelMax),
  /** Optional description line under the label. */
  description: z.string().trim().max(300).optional(),
  /** Picture choice image (a form media key or URL). */
  image: formMediaSchema.optional(),
  /** Quiz and scoring points for choosing this option. */
  points: z.number().min(-10_000).max(10_000).optional(),
});
export type FormOption = z.infer<typeof formOptionSchema>;

export const formMatrixItemSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(200),
});
export type FormMatrixItem = z.infer<typeof formMatrixItemSchema>;

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

/**
 * Comparison operators. Which ones make sense depends on the compared
 * field (the editor offers `operatorsFor(type)`), the evaluator accepts any
 * of them against any answer and treats a mismatch as false.
 */
export const FORM_OPERATORS = [
  "is_answered",
  "is_not_answered",
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "gt",
  "gte",
  "lt",
  "lte",
  "includes_any",
  "includes_all",
  "includes_none",
  "before",
  "after",
] as const;
export type FormOperator = (typeof FORM_OPERATORS)[number];

/** The compared value is the running quiz score instead of an answer. */
export const SCORE_SUBJECT = "$score";

export const formConditionSchema = z.object({
  /** A field id, or `$score`. */
  subject: z.string().min(1).max(64),
  operator: z.enum(FORM_OPERATORS),
  /** Option ids for choice fields; text, number or ISO date otherwise. */
  value: z
    .union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(300)).max(200)])
    .optional(),
});
export type FormCondition = z.infer<typeof formConditionSchema>;

export const formConditionGroupSchema = z.object({
  match: z.enum(["all", "any"]).default("all"),
  rules: z.array(formConditionSchema).max(FORM_LIMITS.conditionsMax).default([]),
});
export type FormConditionGroup = z.infer<typeof formConditionGroupSchema>;

/** The end of a page can jump elsewhere: a later page, or straight to an ending. */
export const formJumpSchema = z.object({
  id: idSchema,
  when: formConditionGroupSchema,
  /** A page_break field id (that page), `end` (submit), or `ending:<id>`. */
  to: z.string().min(1).max(80),
});
export type FormJump = z.infer<typeof formJumpSchema>;

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const RATING_ICONS = ["star", "heart", "circle", "thumb", "bolt", "smile"] as const;
export type RatingIcon = (typeof RATING_ICONS)[number];

export const CALLOUT_TONES = ["info", "success", "warning", "note"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

export const formFieldSchema = z.object({
  id: idSchema,
  type: z.enum(FORM_FIELD_TYPES),
  /** The question (or heading text). `{{fieldId}}` pipes in an earlier answer. */
  label: z.string().trim().max(FORM_LIMITS.labelMax).default(""),
  description: richTextSchema.optional(),
  placeholder: z.string().trim().max(FORM_LIMITS.placeholderMax).optional(),
  help: z.string().trim().max(FORM_LIMITS.helpMax).optional(),
  required: z.boolean().default(false),
  /** An image or video shown with the question (or the block's media). */
  media: formMediaSchema.optional(),
  /** Classic layout: half-width fields sit two to a row on wide screens. */
  width: z.enum(["full", "half"]).default("full"),
  /** Shown only while these rules match. */
  visibleIf: formConditionGroupSchema.optional(),
  /** Fill from this URL query parameter (always for `hidden` fields). */
  prefillParam: z
    .string()
    .regex(/^[A-Za-z0-9_.-]{1,64}$/)
    .optional(),
  defaultValue: z.union([z.string().max(2000), z.number(), z.boolean()]).optional(),

  // Choices
  options: z.array(formOptionSchema).max(FORM_LIMITS.optionsMax).optional(),
  allowOther: z.boolean().optional(),
  otherLabel: z.string().trim().max(100).optional(),
  randomize: z.boolean().optional(),
  optionLayout: z.enum(["list", "grid", "inline"]).optional(),
  minSelections: z.number().int().min(0).max(FORM_LIMITS.optionsMax).optional(),
  maxSelections: z.number().int().min(1).max(FORM_LIMITS.optionsMax).optional(),

  // Text
  minLength: z.number().int().min(0).max(FORM_LIMITS.textAnswerMax).optional(),
  maxLength: z.number().int().min(1).max(FORM_LIMITS.textAnswerMax).optional(),
  /**
   * A format mask the answer must match (short text only), see
   * `matchesFormatMask`: `#` a digit, `A` a letter, `*` a letter or digit,
   * `?` any character, `\\` escapes the next one, everything else is literal.
   * Alternatives are separated by ` | `. Never a regular expression, so an
   * admin can't make the API run a catastrophic pattern on respondent input.
   */
  pattern: z.string().max(120).optional(),
  patternMessage: z.string().trim().max(200).optional(),
  rows: z.number().int().min(2).max(20).optional(),

  // Numbers and scales
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  decimals: z.number().int().min(0).max(6).optional(),
  prefix: z.string().max(12).optional(),
  suffix: z.string().max(12).optional(),
  minLabel: z.string().trim().max(60).optional(),
  midLabel: z.string().trim().max(60).optional(),
  maxLabel: z.string().trim().max(60).optional(),
  ratingIcon: z.enum(RATING_ICONS).optional(),

  // Matrix
  rowsList: z.array(formMatrixItemSchema).max(FORM_LIMITS.matrixRowsMax).optional(),
  columnsList: z.array(formMatrixItemSchema).max(FORM_LIMITS.matrixColumnsMax).optional(),
  matrixMultiple: z.boolean().optional(),

  // Dates (ISO `YYYY-MM-DD`)
  minDate: z.string().max(40).optional(),
  maxDate: z.string().max(40).optional(),

  // Uploads
  accept: z.array(z.enum(FORM_FILE_CATEGORIES)).max(FORM_FILE_CATEGORIES.length).optional(),
  maxFiles: z.number().int().min(1).max(FORM_LIMITS.filesPerFieldMax).optional(),
  maxFileMb: z.number().min(0.1).max(FORM_LIMITS.fileMbMax).optional(),

  // Phone
  defaultCountry: z.string().max(4).optional(),

  // Consent
  consentText: richTextSchema.optional(),

  // Content blocks
  content: richTextSchema.optional(),
  headingLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  calloutTone: z.enum(CALLOUT_TONES).optional(),
  spacerSize: z.enum(["sm", "md", "lg", "xl"]).optional(),
  align: z.enum(["left", "center"]).optional(),

  // Page breaks: the page that starts here
  pageTitle: z.string().trim().max(200).optional(),
  pageDescription: richTextSchema.optional(),
  /** Evaluated when the respondent leaves the page that ends at this break. */
  jumps: z.array(formJumpSchema).max(FORM_LIMITS.jumpsMax).optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export const formWelcomeSchema = z.object({
  enabled: z.boolean().default(true),
  eyebrow: z.string().trim().max(80).optional(),
  title: z.string().trim().max(FORM_LIMITS.titleMax).default(""),
  body: richTextSchema.optional(),
  buttonLabel: z.string().trim().max(40).default("Start"),
  media: formMediaSchema.optional(),
  /** "Takes about N minutes", estimated from the questions. */
  showDuration: z.boolean().default(true),
  showQuestionCount: z.boolean().default(true),
});
export type FormWelcome = z.infer<typeof formWelcomeSchema>;

export const formEndingSchema = z.object({
  id: idSchema,
  /** Shown when these rules match; the first ending without rules is the default. */
  when: formConditionGroupSchema.optional(),
  title: z.string().trim().max(FORM_LIMITS.titleMax).default("Thank you"),
  body: richTextSchema.optional(),
  media: formMediaSchema.optional(),
  showScore: z.boolean().default(false),
  buttonLabel: z.string().trim().max(40).optional(),
  buttonUrl: safeUrlSchema.optional(),
  redirectUrl: safeUrlSchema.optional(),
  redirectDelaySeconds: z.number().int().min(0).max(60).optional(),
  allowAnother: z.boolean().default(false),
  showShare: z.boolean().default(true),
});
export type FormEnding = z.infer<typeof formEndingSchema>;

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

export const FORM_LAYOUTS = ["classic", "conversational"] as const;
export type FormLayout = (typeof FORM_LAYOUTS)[number];

export const FORM_SCENES = ["orbit", "constellation", "paper", "blocks", "none"] as const;
export type FormScene = (typeof FORM_SCENES)[number];

export const FORM_FONTS = ["hanken", "geist", "fraunces", "mono"] as const;
export type FormFont = (typeof FORM_FONTS)[number];

export const FORM_ENTRANCES = ["rise", "pop", "slide", "blur", "type"] as const;
export type FormEntrance = (typeof FORM_ENTRANCES)[number];

export const FORM_CELEBRATIONS = ["confetti", "fireworks", "bloom", "assemble", "none"] as const;
export type FormCelebration = (typeof FORM_CELEBRATIONS)[number];

/** Brand pattern tiles (public/patterns/<name>-<colours>.svg) quoted behind the form. */
export const FORM_PATTERNS = [
  "none",
  "arcs",
  "circle",
  "clover",
  "domes",
  "fans",
  "leaves",
  "plus",
  "quads",
  "square",
  "x",
  "mixed",
] as const;
export type FormPattern = (typeof FORM_PATTERNS)[number];

export const formDesignSchema = z.object({
  theme: z.enum(PROJECT_THEME_IDS).default("laboratory"),
  colorMode: z.enum(["auto", "light", "dark"]).default("auto"),
  font: z.enum(FORM_FONTS).default("hanken"),
  layout: z.enum(FORM_LAYOUTS).default("classic"),
  align: z.enum(["left", "center"]).default("left"),
  density: z.enum(["cozy", "comfortable", "airy"]).default("comfortable"),
  fieldStyle: z.enum(["boxed", "underline", "soft"]).default("boxed"),
  buttonShape: z.enum(["pill", "rounded", "square"]).default("pill"),
  progress: z.enum(["bar", "steps", "fraction", "none"]).default("bar"),
  showLogo: z.boolean().default(true),
  cover: z
    .object({
      style: z.enum(["none", "banner", "hero", "split"]).default("none"),
      media: formMediaSchema.optional(),
      /** Darkening over the cover so its title stays readable, in percent. */
      overlay: z.number().int().min(0).max(85).default(35),
    })
    .default({ style: "none", overlay: 35 }),
  background: z
    .object({
      scene: z.enum(FORM_SCENES).default("orbit"),
      intensity: z.enum(["calm", "lively", "wild"]).default("lively"),
      pattern: z.enum(FORM_PATTERNS).default("none"),
      media: formMediaSchema.optional(),
      dim: z.number().int().min(0).max(90).default(40),
    })
    .default({ scene: "orbit", intensity: "lively", pattern: "none", dim: 40 }),
  motion: z
    .object({
      entrance: z.enum(FORM_ENTRANCES).default("rise"),
      speed: z.enum(["slow", "normal", "fast"]).default("normal"),
      celebration: z.enum(FORM_CELEBRATIONS).default("confetti"),
      sound: z.boolean().default(false),
      /** Parallax and pointer-reactive decoration. */
      interactive: z.boolean().default(true),
    })
    .default({
      entrance: "rise",
      speed: "normal",
      celebration: "confetti",
      sound: false,
      interactive: true,
    }),
});
export type FormDesign = z.infer<typeof formDesignSchema>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const FORM_LANGUAGES = ["en", "id"] as const;
export type FormLanguage = (typeof FORM_LANGUAGES)[number];

/** The built-in interface words, overridable per form. */
export const FORM_LABEL_KEYS = [
  "start",
  "next",
  "back",
  "submit",
  "required",
  "optional",
  "other",
  "pressEnter",
  "chooseFile",
  "dropFiles",
  "uploading",
  "selectPlaceholder",
  "searchPlaceholder",
  "clear",
  "closed",
  "resume",
  "startOver",
] as const;
export type FormLabelKey = (typeof FORM_LABEL_KEYS)[number];

export const formSettingsSchema = z.object({
  language: z.enum(FORM_LANGUAGES).default("en"),
  labels: z.partialRecord(z.enum(FORM_LABEL_KEYS), z.string().trim().max(80)).default({}),
  /** ISO instants; outside the window the form shows its closed screen. */
  opensAt: z.string().max(40).optional(),
  closesAt: z.string().max(40).optional(),
  responseLimit: z.number().int().positive().max(1_000_000).optional(),
  closedTitle: z.string().trim().max(200).optional(),
  closedMessage: z.string().trim().max(1000).optional(),
  /** One submission per browser (a device cookie and local storage mark). */
  onePerDevice: z.boolean().default(false),
  /** Record the respondent's IP address and its geolocation. */
  collectLocation: z.boolean().default(true),
  /** Keep a respondent's unfinished answers in their browser. */
  autosave: z.boolean().default(true),
  showQuestionNumbers: z.boolean().default(true),
  /** Admin-only: addresses told about every new response. */
  notifyEmails: z.array(z.email().max(254)).max(FORM_LIMITS.notifyEmailsMax).default([]),
  /** Email the respondent a copy of their answers, to the chosen email field. */
  receipt: z
    .object({
      enabled: z.boolean().default(false),
      emailFieldId: z.string().max(64).optional(),
      subject: z.string().trim().max(200).optional(),
      message: z.string().trim().max(2000).optional(),
    })
    .default({ enabled: false }),
  scoring: z
    .object({
      enabled: z.boolean().default(false),
      /** Shown as "score / max" when the ending shows the score. */
      maxScore: z.number().positive().max(1_000_000).optional(),
    })
    .default({ enabled: false }),
  seo: z
    .object({
      title: z.string().trim().max(120).optional(),
      description: z.string().trim().max(300).optional(),
      image: formMediaSchema.optional(),
      noindex: z.boolean().default(true),
    })
    .default({ noindex: true }),
  /** Seconds a real person needs at least; faster submissions are flagged as spam. */
  minSeconds: z.number().int().min(0).max(600).default(3),
});
export type FormSettings = z.infer<typeof formSettingsSchema>;

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export const FORM_DOCUMENT_VERSION = 1;

export const formDocumentSchema = z
  .object({
    version: z.literal(FORM_DOCUMENT_VERSION).default(FORM_DOCUMENT_VERSION),
    title: z.string().trim().min(1, "Give the form a title.").max(FORM_LIMITS.titleMax),
    description: richTextSchema.optional(),
    /** Admin-only notes about the form (never public). */
    internalNote: z.string().trim().max(2000).optional(),
    fields: z.array(formFieldSchema).max(FORM_LIMITS.fieldsMax).default([]),
    welcome: formWelcomeSchema.default({
      enabled: true,
      title: "",
      buttonLabel: "Start",
      showDuration: true,
      showQuestionCount: true,
    }),
    endings: z
      .array(formEndingSchema)
      .min(1)
      .max(FORM_LIMITS.endingsMax)
      .default([
        {
          id: "default",
          title: "Thank you",
          showScore: false,
          allowAnother: false,
          showShare: true,
        },
      ]),
    design: formDesignSchema.default(formDesignSchema.parse({})),
    settings: formSettingsSchema.default(formSettingsSchema.parse({})),
  })
  .superRefine((document, context) => {
    const ids = new Set<string>();
    document.fields.forEach((field, index) => {
      if (ids.has(field.id)) {
        context.addIssue({
          code: "custom",
          message: "Two fields share this id.",
          path: ["fields", index, "id"],
        });
      }
      ids.add(field.id);
      if (isChoiceType(field.type) && !(field.options && field.options.length)) {
        context.addIssue({
          code: "custom",
          message: "Add at least one option.",
          path: ["fields", index, "options"],
        });
      }
    });
    const endingIds = new Set<string>();
    document.endings.forEach((ending, index) => {
      if (endingIds.has(ending.id)) {
        context.addIssue({
          code: "custom",
          message: "Two endings share this id.",
          path: ["endings", index, "id"],
        });
      }
      endingIds.add(ending.id);
    });
  });
export type FormDocument = z.infer<typeof formDocumentSchema>;
export type FormDocumentInput = z.input<typeof formDocumentSchema>;

/** The document a public visitor receives: admin-only settings removed. */
export type PublicFormDocument = Omit<FormDocument, "internalNote" | "settings"> & {
  settings: Omit<FormSettings, "notifyEmails" | "receipt"> & {
    receipt: { enabled: boolean; emailFieldId?: string };
  };
};

export function toPublicFormDocument(document: FormDocument): PublicFormDocument {
  const { internalNote: _note, settings, ...rest } = document;
  const { notifyEmails: _emails, receipt, ...publicSettings } = settings;
  return {
    ...rest,
    settings: {
      ...publicSettings,
      receipt: { enabled: receipt.enabled, emailFieldId: receipt.emailFieldId },
    },
  };
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

export const FORM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FORM_SLUG_MAX = 80;
/** Paths under /forms that a form can never claim. */
export const RESERVED_FORM_SLUGS = new Set(["admin", "api", "media", "preview", "new", "public"]);

export const formSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(FORM_SLUG_MAX)
  .regex(FORM_SLUG_PATTERN, "Use lowercase letters, numbers and hyphens.")
  .refine((value) => !RESERVED_FORM_SLUGS.has(value), "That URL is reserved.");

export const FORM_STATUSES = ["draft", "published", "closed"] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];
