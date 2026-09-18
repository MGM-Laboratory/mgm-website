import { z } from "zod";

// Minted by the attachment upload endpoint as
// `contact-<uuid>[-<slugified-filename>][.ext]` — never client-supplied, so
// this only needs to reject anything that isn't one of ours before it's used
// to look up a storage object.
export const CONTACT_ATTACHMENT_KEY_PATTERN =
  /^contact-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-[a-z0-9-]{1,60})?(?:\.[a-z0-9]{1,10})?$/;

export const CONTACT_MAX_ATTACHMENTS = 5;
export const CONTACT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// Shared by the client form (react-hook-form resolver, instant per-field
// errors) and the API (authoritative check on the actual request body) so
// both sides agree on the same rules and messages.
export const contactFormSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(200, "Name is too long."),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email.")
    .email("Enter a valid email address.")
    .max(320, "Email is too long."),
  company: z.string().trim().max(200, "Company name is too long.").optional(),
  message: z
    .string()
    .trim()
    .min(1, "Tell us a bit about your project.")
    .max(5000, "Message is too long."),
  attachmentKeys: z
    .array(z.string().regex(CONTACT_ATTACHMENT_KEY_PATTERN))
    .max(CONTACT_MAX_ATTACHMENTS, `You can attach up to ${CONTACT_MAX_ATTACHMENTS} files.`)
    .optional(),
});

export type ContactFormPayload = z.infer<typeof contactFormSchema>;

export const MAIL_PROVIDER_IDS = ["resend", "smtp", "ses"] as const;
export type MailProviderId = (typeof MAIL_PROVIDER_IDS)[number];

// The single-provider ids force that one provider, failing loudly if it
// isn't configured. The rest route across every configured provider, always
// falling over to the next candidate (per strategy) if one throws.
export const MAIL_STRATEGIES = [
  "resend",
  "smtp",
  "ses",
  "failover",
  "loadBalanceEqual",
  "loadBalanceWeighted",
  "loadBalanceLimit",
] as const;
export type MailStrategy = (typeof MAIL_STRATEGIES)[number];

// "monthly" resets on the 1st of the calendar month; "30day" resets on a
// fixed 30-day cadence from whenever it was last reset — distinct because
// providers commonly define their own quota either way.
export const MAIL_LONG_PERIODS = ["monthly", "30day"] as const;
export type MailLongPeriod = (typeof MAIL_LONG_PERIODS)[number];

// "calendar" limits are stored counters (admin-editable "remaining", so
// usage from outside this app can be accounted for). "rolling" limits are
// always derived from a log of this app's own sends in the trailing window,
// so "remaining" can never be manually offset there.
export const MAIL_LIMIT_WINDOW_MODES = ["calendar", "rolling"] as const;
export type MailLimitWindowMode = (typeof MAIL_LIMIT_WINDOW_MODES)[number];

// Admin-configured limit settings for one provider — not the live counters,
// which live in the API's own tables (MailProviderUsage / MailSendLog) since
// they need atomic, concurrency-safe updates a JSON settings blob can't give.
export const mailProviderLimitConfigSchema = z.object({
  windowMode: z.enum(MAIL_LIMIT_WINDOW_MODES).default("calendar"),
  dailyLimit: z.number().int().positive().optional(),
  dailyRemaining: z.number().int().min(0).optional(),
  longPeriod: z.enum(MAIL_LONG_PERIODS).optional(),
  longLimit: z.number().int().positive().optional(),
  longRemaining: z.number().int().min(0).optional(),
});
export type MailProviderLimitConfig = z.infer<typeof mailProviderLimitConfigSchema>;

// z.record() over a fixed enum requires every key present; these three ids
// are always optional (an unset provider just means "no weight/limit
// configured for it"), so a plain object of optional fields fits better.
const mailProviderWeightsSchema = z
  .object({
    resend: z.number().positive().optional(),
    smtp: z.number().positive().optional(),
    ses: z.number().positive().optional(),
  })
  .default({});
export type MailProviderWeights = z.infer<typeof mailProviderWeightsSchema>;

const mailProviderLimitsSchema = z
  .object({
    resend: mailProviderLimitConfigSchema.optional(),
    smtp: mailProviderLimitConfigSchema.optional(),
    ses: mailProviderLimitConfigSchema.optional(),
  })
  .default({});
export type MailProviderLimits = z.infer<typeof mailProviderLimitsSchema>;

// The lab's public contact details — CMS-editable (unlike the credentials in
// apps/api/.env), since these are ordinary business info, not secrets.
const contactSettingsShape = z.object({
  emails: z
    .array(z.string().trim().min(1).email("Enter a valid email address."))
    .min(1, "Add at least one recipient email."),
  address: z.string().trim().min(1, "Please enter an address."),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  mailStrategy: z.enum(MAIL_STRATEGIES).default("failover"),
  mailProviderOrder: z.array(z.enum(MAIL_PROVIDER_IDS)).default(["resend", "smtp", "ses"]),
  mailProviderWeights: mailProviderWeightsSchema,
  mailProviderLimits: mailProviderLimitsSchema,
});

// A record saved before multi-recipient support shipped still has a single
// `email: string` field in the database instead of `emails: string[]` — this
// lifts that legacy shape into the current one before validating, so an old
// stored row (or an old cached copy) doesn't fail parsing and silently fall
// back to DEFAULT_CONTACT_SETTINGS, wiping out the real configured inbox.
export const contactSettingsSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.emails === undefined && typeof record.email === "string") {
      const { email, ...rest } = record;
      return { ...rest, emails: [email] };
    }
  }
  return value;
}, contactSettingsShape);

export type ContactSettings = z.infer<typeof contactSettingsSchema>;

// Used both as the API's fallback when no CMS record has been saved yet, and
// as the web's fallback if the API is unreachable — so the site never shows
// a broken contact page just because nobody has opened the CMS editor yet.
export const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  emails: ["hi@labmgm.org"],
  address:
    "Faculty of Computer Science, Building F Room F10.5 and F10.6\nVeteran Street No. 8, Malang, 65145, Indonesia",
  lat: -7.9543,
  lng: 112.6146,
  mailStrategy: "failover",
  mailProviderOrder: ["resend", "smtp", "ses"],
  mailProviderWeights: {},
  mailProviderLimits: {},
};
