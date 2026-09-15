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

// The lab's public contact details — CMS-editable (unlike the credentials in
// apps/api/.env), since these are ordinary business info, not secrets.
export const contactSettingsSchema = z.object({
  email: z.string().trim().min(1, "Please enter an email.").email("Enter a valid email address."),
  address: z.string().trim().min(1, "Please enter an address."),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type ContactSettings = z.infer<typeof contactSettingsSchema>;

// Used both as the API's fallback when no CMS record has been saved yet, and
// as the web's fallback if the API is unreachable — so the site never shows
// a broken contact page just because nobody has opened the CMS editor yet.
export const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  email: "hi@labmgm.org",
  address:
    "Faculty of Computer Science, Building F Room F10.5 and F10.6\nVeteran Street No. 8, Malang, 65145, Indonesia",
  lat: -7.9543,
  lng: 112.6146,
};
