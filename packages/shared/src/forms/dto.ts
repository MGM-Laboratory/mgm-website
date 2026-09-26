import type { FormAnswers } from "./answers.js";
import type { FormDocument, FormStatus, PublicFormDocument } from "./schema.js";

/**
 * The shapes the forms API sends and receives. Dates travel as ISO strings.
 * See docs/forms.md for the routes.
 */

/** A form as the admin workspace sees it. */
export type FormRecord = {
  id: string;
  slug: string;
  status: FormStatus;
  document: FormDocument;
  hasPassphrase: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: {
    responses: number;
    views: number;
    starts: number;
    lastResponseAt: string | null;
  };
};

/** The list view: the document's heavy parts (fields) summarized. */
export type FormSummary = Omit<FormRecord, "document"> & {
  title: string;
  questionCount: number;
  theme: FormDocument["design"]["theme"];
};

/** Why a public form can't be filled right now. */
export type FormUnavailableReason = "not_open_yet" | "closed" | "limit_reached";

/** What `GET /forms/public/:slug` answers. */
export type PublicFormPayload =
  | {
      state: "open";
      slug: string;
      document: PublicFormDocument;
      /** Present when the visitor unlocked a passphrase form; send it back on writes. */
      token?: string;
    }
  | {
      state: "locked";
      slug: string;
      title: string;
      design: PublicFormDocument["design"];
      language: PublicFormDocument["settings"]["language"];
    }
  | {
      state: "unavailable";
      slug: string;
      reason: FormUnavailableReason;
      title: string;
      closedTitle?: string;
      closedMessage?: string;
      opensAt?: string;
      design: PublicFormDocument["design"];
      language: PublicFormDocument["settings"]["language"];
    };

/** Client context captured by the public page (never trusted for security). */
export type FormClientContext = {
  language?: string;
  timezone?: string;
  screen?: string;
  utm?: Partial<Record<"source" | "medium" | "campaign" | "term" | "content", string>>;
  /** The page's own referrer (document.referrer), when there is one. */
  referrer?: string;
};

export type FormEventType = "view" | "start" | "progress" | "submit";

export type FormEventInput = {
  sessionId: string;
  type: Exclude<FormEventType, "submit">;
  /** The question just answered, for `progress`. */
  fieldId?: string;
  context?: FormClientContext;
  token?: string;
};

export type FormSubmissionInput = {
  sessionId: string;
  answers: FormAnswers;
  /** When the respondent pressed Start (ISO). */
  startedAt?: string;
  context?: FormClientContext;
  /** The honeypot input; a real person leaves it empty. */
  website?: string;
  /** From a passphrase unlock. */
  token?: string;
};

export type FormSubmissionResult = {
  ok: true;
  responseId: string;
  endingId: string;
  score: number | null;
};

export type FormUploadResult = {
  file: { key: string; name: string; size: number; type: string };
};

/** One response as the admin workspace sees it. */
export type FormResponseRecord = {
  id: string;
  formId: string;
  answers: FormAnswers;
  score: number | null;
  endingId: string | null;
  sessionId: string | null;
  /** Automatic spam hints: honeypot filled, faster than `minSeconds`. */
  spam: boolean;
  meta: {
    ip: string | null;
    userAgent: string | null;
    referer: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
    device: string | null;
    browser: string | null;
    os: string | null;
    language: string | null;
    screen: string | null;
    utm: FormClientContext["utm"] | null;
    startedAt: string | null;
    durationMs: number | null;
  };
  admin: {
    starred: boolean;
    flagged: boolean;
    reviewed: boolean;
    tags: string[];
    note: string | null;
    editedAt: string | null;
  };
  createdAt: string;
};

export type FormResponsePatch = {
  answers?: FormAnswers;
  starred?: boolean;
  flagged?: boolean;
  reviewed?: boolean;
  spam?: boolean;
  tags?: string[];
  note?: string | null;
};

export const FORM_BULK_ACTIONS = [
  "delete",
  "star",
  "unstar",
  "flag",
  "unflag",
  "review",
  "unreview",
  "spam",
  "unspam",
  "tag",
  "untag",
] as const;
export type FormBulkAction = (typeof FORM_BULK_ACTIONS)[number];

export type FormBulkInput = { ids: string[]; action: FormBulkAction; tag?: string };

/** Permanent data cleaning: replace the answers of many responses at once. */
export type FormApplyInput = { updates: { id: string; answers: FormAnswers }[] };

export type FormAnalyticsRange = "24h" | "7d" | "30d" | "90d" | "365d" | "all";

type Count<K extends string> = { [P in K]: string } & { count: number };

/** Traffic analytics from the form's events (responses are analyzed in the browser). */
export type FormAnalytics = {
  range: FormAnalyticsRange;
  totals: {
    views: number;
    uniqueVisitors: number;
    starts: number;
    submissions: number;
    /** submissions / views, 0..1 */
    conversion: number;
    /** submissions / starts, 0..1 */
    completion: number;
    medianDurationMs: number | null;
    averageDurationMs: number | null;
  };
  /** Buckets are hours for `24h`, days otherwise (ISO start of the bucket, UTC). */
  series: { bucket: string; views: number; starts: number; submissions: number }[];
  /** Views by weekday (0 = Sunday) and hour (UTC), for a heatmap. */
  heatmap: { weekday: number; hour: number; count: number }[];
  /** How many sessions answered each question (for the drop-off funnel). */
  funnel: { fieldId: string; sessions: number }[];
  countries: Count<"country">[];
  cities: (Count<"city"> & { country: string | null })[];
  referrers: Count<"host">[];
  devices: Count<"device">[];
  browsers: Count<"browser">[];
  oss: Count<"os">[];
  languages: Count<"language">[];
  utmSources: Count<"source">[];
  /** Geolocated visits for the map, at most 2000 points. */
  points: { latitude: number; longitude: number; count: number; kind: "view" | "submit" }[];
};

/** The latest visits, for the visitor log. */
export type FormVisit = {
  id: string;
  sessionId: string;
  type: FormEventType;
  fieldId: string | null;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  referer: string | null;
  createdAt: string;
};

/** Create and update bodies for the admin API. */
export type FormCreateInput = {
  document: FormDocument;
  /** Empty or omitted: a random slug is minted. */
  slug?: string;
  status?: FormStatus;
};

export type FormUpdateInput = {
  document?: FormDocument;
  slug?: string;
  status?: FormStatus;
  passphraseAction?: "keep" | "set" | "remove";
  passphrase?: string;
};
