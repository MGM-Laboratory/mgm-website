import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import { FORM_BULK_ACTIONS, FORM_STATUSES } from "@repo/shared";

/**
 * Request bodies of the forms routes. Form documents themselves are
 * validated with the shared `formDocumentSchema`; these cover everything
 * around them.
 */

/**
 * Zod failures become readable 400s naming the first invalid path, so the
 * editor can show the message next to the field it came from.
 */
export function parseSafe<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException(
      issue
        ? `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`
        : "Invalid request",
    );
  }
  return parsed.data;
}

// Session and device ids are minted by the public page (UUIDs in practice).
export const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/, "Invalid session id.");
const fieldIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid field id.");

export const formStatusSchema = z.enum(FORM_STATUSES);

export const createFormSchema = z.object({
  document: z.unknown(),
  slug: z.string().max(200).optional(),
  status: formStatusSchema.optional(),
});

export const updateFormSchema = z.object({
  document: z.unknown().optional(),
  slug: z.string().max(200).optional(),
  status: formStatusSchema.optional(),
  passphraseAction: z.enum(["keep", "set", "remove"]).default("keep"),
  passphrase: z.string().max(200).optional(),
});
export type UpdateFormBody = z.infer<typeof updateFormSchema>;

export const unlockSchema = z.object({ passphrase: z.string().min(1).max(200) });

const utmValue = z.string().max(200).optional();

export const clientContextSchema = z
  .object({
    language: z.string().max(35).optional(),
    timezone: z.string().max(64).optional(),
    screen: z.string().max(20).optional(),
    utm: z
      .object({
        source: utmValue,
        medium: utmValue,
        campaign: utmValue,
        term: utmValue,
        content: utmValue,
      })
      .optional(),
    referrer: z.string().max(2000).optional(),
  })
  .optional();
export type ClientContext = z.infer<typeof clientContextSchema>;

export const eventSchema = z
  .object({
    sessionId: sessionIdSchema,
    type: z.enum(["view", "start", "progress"]),
    fieldId: fieldIdSchema.optional(),
    context: clientContextSchema,
    token: z.string().max(200).optional(),
  })
  .refine((event) => event.type !== "progress" || Boolean(event.fieldId), {
    message: "A progress event names its question.",
    path: ["fieldId"],
  });
export type EventBody = z.infer<typeof eventSchema>;

export const uploadQuerySchema = z.object({
  fieldId: fieldIdSchema,
  sessionId: sessionIdSchema,
});

export const submissionSchema = z.object({
  sessionId: sessionIdSchema,
  // Every value is checked against its field by the shared validator.
  answers: z
    .record(z.string().max(200), z.unknown())
    .refine((answers) => Object.keys(answers).length <= 1000, "Too many answers."),
  startedAt: z.string().max(40).optional(),
  context: clientContextSchema,
  deviceId: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,100}$/, "Invalid device id.")
    .optional(),
  website: z.string().max(2000).optional(),
  token: z.string().max(200).optional(),
});
export type SubmissionBody = z.infer<typeof submissionSchema>;

export const responsePatchSchema = z
  .object({
    answers: z.record(z.string().max(200), z.unknown()).optional(),
    starred: z.boolean().optional(),
    flagged: z.boolean().optional(),
    reviewed: z.boolean().optional(),
    spam: z.boolean().optional(),
    tags: z.array(z.string().max(200)).max(100).optional(),
    note: z.string().max(5000).nullable().optional(),
  })
  .strict();
export type ResponsePatchBody = z.infer<typeof responsePatchSchema>;

export const BULK_IDS_MAX = 20_000;

export const bulkSchema = z
  .object({
    ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_IDS_MAX),
    action: z.enum(FORM_BULK_ACTIONS),
    tag: z.string().max(200).optional(),
  })
  .refine(
    (input) => (input.action !== "tag" && input.action !== "untag") || Boolean(input.tag?.trim()),
    { message: "Name the tag.", path: ["tag"] },
  );
export type BulkBody = z.infer<typeof bulkSchema>;

export const APPLY_UPDATES_MAX = 2000;

export const applySchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        answers: z.record(z.string().max(200), z.unknown()),
      }),
    )
    .min(1)
    .max(APPLY_UPDATES_MAX)
    .refine(
      (updates) => new Set(updates.map((update) => update.id)).size === updates.length,
      "Each response can appear once.",
    ),
});
export type ApplyBody = z.infer<typeof applySchema>;

export const mediaImageSchema = z.object({ image: z.string().startsWith("data:image/") });
