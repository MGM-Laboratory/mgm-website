import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import {
  FORM_FILE_CATEGORY_TYPES,
  FORM_SLUG_MAX,
  formSlugSchema,
  type FormSettings,
  type FormStatus,
  type FormUnavailableReason,
} from "@repo/shared";

/**
 * Pure helpers of the forms module: slugs, unlock tokens, storage keys,
 * upload sniffing, availability and spam hints. Nothing here touches the
 * database or the network, so all of it is unit-tested directly.
 */

// --- Slugs ---

// Lowercase only (form slugs are lowercase), without 0/o, 1/l/i: minted
// slugs get read aloud and typed from posters.
export const FORM_SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const FORM_SLUG_LENGTH = 8;

export function randomFormSlug(length = FORM_SLUG_LENGTH): string {
  let slug = "";
  for (let i = 0; i < length; i += 1) {
    slug += FORM_SLUG_ALPHABET[randomInt(FORM_SLUG_ALPHABET.length)];
  }
  return slug;
}

/** The normalized slug, or the first validation message. */
export function parseFormSlug(
  value: string,
): { ok: true; slug: string } | { ok: false; message: string } {
  const parsed = formSlugSchema.safeParse(value);
  if (parsed.success) return { ok: true, slug: parsed.data };
  return { ok: false, message: parsed.error.issues[0]?.message ?? "That URL is not valid." };
}

/** Turns free text ("My Survey 2026!") into slug material ("my-survey-2026"). */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, FORM_SLUG_MAX)
    .replace(/-+$/g, "");
}

/** Alternatives offered when a slug is taken: `base-2` … `base-9`, each within the length cap. */
export function slugCandidates(base: string): string[] {
  const candidates: string[] = [];
  for (let n = 2; n <= 9; n += 1) {
    const suffix = `-${n}`;
    const head = base.slice(0, FORM_SLUG_MAX - suffix.length).replace(/-+$/g, "");
    if (head) candidates.push(`${head}${suffix}`);
  }
  return candidates;
}

// --- Unlock tokens ---

export const FORM_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/** The token secret: derived from the admin passphrase with a fixed, forms-only prefix. */
export function formTokenSecret(adminPassphrase: string): Buffer {
  return createHash("sha256").update(`mgm-forms-unlock:v1:${adminPassphrase}`).digest();
}

function tokenSignature(secret: Buffer, formId: string, expiresAt: number, passphraseHash: string) {
  // The stored passphrase hash is part of the message, so changing or
  // removing a form's passphrase invalidates every token issued for it.
  return createHmac("sha256", secret)
    .update(`${formId}.${expiresAt}.${passphraseHash}`)
    .digest("base64url");
}

/** `<expiresAt>.<signature>`, valid for one form and one passphrase. */
export function signFormToken(
  secret: Buffer,
  formId: string,
  passphraseHash: string,
  now = Date.now(),
  ttlMs = FORM_TOKEN_TTL_MS,
): string {
  const expiresAt = now + ttlMs;
  return `${expiresAt}.${tokenSignature(secret, formId, expiresAt, passphraseHash)}`;
}

export function verifyFormToken(
  secret: Buffer,
  formId: string,
  passphraseHash: string,
  token: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!token || typeof token !== "string" || token.length > 200) return false;
  const match = /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const expected = Buffer.from(tokenSignature(secret, formId, expiresAt, passphraseHash));
  const actual = Buffer.from(match[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// --- Storage keys ---

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Respondent uploads: `formfile-<formId>-<uuid>.<ext>`. */
export const FORM_UPLOAD_KEY_PATTERN = new RegExp(
  `^formfile-([a-z0-9]{1,40})-${UUID}\\.[a-z0-9]{1,10}$`,
);

/** Design media of a form: `form-<formId>-<uuid>.<ext>`. */
export const FORM_MEDIA_KEY_PATTERN = new RegExp(
  `^form-([a-z0-9]{1,40})-${UUID}\\.(?:png|jpg|webp|gif|mp4|webm)$`,
);

export function formUploadKey(formId: string, extension: string) {
  return `formfile-${formId}-${randomUUID()}.${extension}`;
}

export function formMediaKey(formId: string, extension: string) {
  return `form-${formId}-${randomUUID()}.${extension}`;
}

/** The form id a respondent upload key belongs to, or null for any other key. */
export function uploadKeyFormId(key: string): string | null {
  return FORM_UPLOAD_KEY_PATTERN.exec(key)?.[1] ?? null;
}

export function mediaKeyFormId(key: string): string | null {
  return FORM_MEDIA_KEY_PATTERN.exec(key)?.[1] ?? null;
}

/** Every design media key (`key`, `posterKey`) referenced anywhere in a form document. */
export function documentMediaKeys(document: unknown): string[] {
  const keys = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
      if (
        (name === "key" || name === "posterKey") &&
        typeof child === "string" &&
        FORM_MEDIA_KEY_PATTERN.test(child)
      ) {
        keys.add(child);
      } else {
        visit(child);
      }
    }
  };
  visit(document);
  return [...keys];
}

// --- Uploads ---

export type SniffedImage = {
  type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  extension: "png" | "jpg" | "webp" | "gif";
};

/** The image format by magic bytes (PNG, JPEG, WebP, GIF), or null. */
export function sniffImage(buffer: Buffer): SniffedImage | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return { type: "image/png", extension: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { type: "image/jpeg", extension: "jpg" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { type: "image/webp", extension: "webp" };
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString("ascii"))) {
    return { type: "image/gif", extension: "gif" };
  }
  return null;
}

/** Pixel size of a sniffed image, best effort (null when the header can't be read). */
export function imageDimensions(
  buffer: Buffer,
  type: SniffedImage["type"],
): { width: number; height: number } | null {
  try {
    if (type === "image/png" && buffer.length >= 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (type === "image/gif" && buffer.length >= 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (type === "image/webp" && buffer.length >= 30) {
      const chunk = buffer.subarray(12, 16).toString("ascii");
      if (chunk === "VP8X") {
        return {
          width: 1 + buffer.readUIntLE(24, 3),
          height: 1 + buffer.readUIntLE(27, 3),
        };
      }
      if (chunk === "VP8 ") {
        return {
          width: buffer.readUInt16LE(26) & 0x3fff,
          height: buffer.readUInt16LE(28) & 0x3fff,
        };
      }
      if (chunk === "VP8L") {
        const bits = buffer.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    if (type === "image/jpeg") {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        // SOF0..SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC).
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7),
          };
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** The extension → MIME map of every file category an upload field can accept. */
const EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odp: "application/vnd.oasis.opendocument.presentation",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  weba: "audio/webm",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  txt: "text/plain",
  md: "text/markdown",
};

const KNOWN_MIMES = new Set(
  Object.values(FORM_FILE_CATEGORY_TYPES).flatMap((category) => [...category.mimes]),
);

export function fileExtensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * The MIME type an upload is stored and later served with: the browser's
 * claim only when it is one of the known category types, else the type the
 * extension implies, else a download-only octet stream. A `.txt` claimed as
 * `text/html` is therefore never served as a page from the bucket.
 */
export function storedUploadType(name: string, claimed: string): string {
  const type = claimed.split(";")[0].trim().toLowerCase();
  if (KNOWN_MIMES.has(type)) return type;
  return EXTENSION_MIME[fileExtensionOf(name)] ?? "application/octet-stream";
}

/** The storage key's extension: the file's own when it is plain, else one from its type. */
export function uploadExtension(name: string, type: string): string {
  const own = fileExtensionOf(name);
  if (/^[a-z0-9]{1,10}$/.test(own)) return own;
  const fromType = Object.entries(EXTENSION_MIME).find(([, mime]) => mime === type)?.[0];
  return fromType ?? "bin";
}

/** The original filename is display-only; strip anything path- or control-shaped. */
export function sanitizeFileName(value: string | undefined): string {
  let decoded = value ?? "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Not URI-encoded after all: keep the raw header value.
  }
  const cleaned = decoded
    // Control characters are intentionally removed from uploaded filenames.
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
  return cleaned || "file";
}

// --- Availability ---

export type Availability = { open: true } | { open: false; reason: FormUnavailableReason };

/**
 * Whether a published form takes responses right now. `responseCount` is
 * only consulted when the form has a response limit (callers may pass 0
 * otherwise and skip the count query).
 */
export function formAvailability(
  status: FormStatus | string,
  settings: Pick<FormSettings, "opensAt" | "closesAt" | "responseLimit">,
  responseCount: number,
  now = Date.now(),
): Availability {
  if (status === "closed") return { open: false, reason: "closed" };
  const opensAt = settings.opensAt ? Date.parse(settings.opensAt) : Number.NaN;
  if (Number.isFinite(opensAt) && now < opensAt) return { open: false, reason: "not_open_yet" };
  const closesAt = settings.closesAt ? Date.parse(settings.closesAt) : Number.NaN;
  if (Number.isFinite(closesAt) && now >= closesAt) return { open: false, reason: "closed" };
  if (settings.responseLimit && responseCount >= settings.responseLimit) {
    return { open: false, reason: "limit_reached" };
  }
  return { open: true };
}

// --- Spam hints and timing ---

/** Longest plausible fill time kept as a duration (the column is a 32-bit integer). */
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function submissionTiming(
  input: { website?: string; startedAt?: string },
  minSeconds: number,
  now = Date.now(),
): { spam: boolean; startedAt: Date | null; durationMs: number | null } {
  const honeypot = typeof input.website === "string" && input.website.trim().length > 0;
  const started = input.startedAt ? Date.parse(input.startedAt) : Number.NaN;
  // A start time in the future (beyond a minute of clock skew) is not a real one.
  const valid = Number.isFinite(started) && started <= now + 60_000;
  const duration = valid ? Math.max(0, now - started) : null;
  const tooFast = duration !== null && duration < minSeconds * 1000;
  return {
    spam: honeypot || tooFast,
    startedAt: valid ? new Date(started) : null,
    durationMs: duration !== null && duration <= MAX_DURATION_MS ? Math.round(duration) : null,
  };
}

// --- Admin tags ---

export const TAGS_MAX = 20;
export const TAG_LENGTH_MAX = 40;

/** Trimmed, de-duplicated, at most 20 tags of at most 40 characters. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().slice(0, TAG_LENGTH_MAX).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= TAGS_MAX) break;
  }
  return result;
}

export function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

/** The host of a referrer URL, `direct` when there is none. */
export function referrerHost(referer: string | null | undefined): string {
  if (!referer || referer === "direct") return "direct";
  try {
    const host = new URL(referer).host;
    return host || "other";
  } catch {
    return "other";
  }
}
