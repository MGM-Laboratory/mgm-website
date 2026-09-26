import { Injectable } from "@nestjs/common";

import {
  isAnswered,
  isFileAnswer,
  isFileType,
  isInputType,
  otherKey,
  validateFieldAnswer,
  type FieldError,
  type FormAnswers,
  type FormDocument,
  type FormField,
  type FormFileAnswer,
  type FormResponseRecord,
} from "@repo/shared";

import type { FormResponse, Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import { FormsError, storedDocument } from "./forms.common.js";
import type { ApplyBody, BulkBody, ResponsePatchBody } from "./forms.schemas.js";
import { FormsService } from "./forms.service.js";
import { TAG_LENGTH_MAX, TAGS_MAX, normalizeTags, uploadKeyFormId } from "./forms.utils.js";

export const RESPONSES_LIST_MAX = 20_000;

export function toResponseRecord(row: FormResponse): FormResponseRecord {
  return {
    id: row.id,
    formId: row.formId,
    answers: row.answers as FormAnswers,
    score: row.score,
    endingId: row.endingId,
    sessionId: row.sessionId,
    spam: row.spam,
    meta: {
      ip: row.ip,
      userAgent: row.userAgent,
      referer: row.referer,
      country: row.country,
      region: row.region,
      city: row.city,
      latitude: row.latitude,
      longitude: row.longitude,
      timezone: row.timezone,
      device: row.device,
      browser: row.browser,
      os: row.os,
      language: row.language,
      screen: row.screen,
      deviceId: row.deviceId,
      utm: (row.utm as FormResponseRecord["meta"]["utm"]) ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      durationMs: row.durationMs,
    },
    admin: {
      starred: row.starred,
      flagged: row.flagged,
      reviewed: row.reviewed,
      tags: row.tags ?? [],
      note: row.note,
      editedAt: row.editedAt?.toISOString() ?? null,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Cleans an admin's answer edits against the form: every value is checked
 * like a respondent's (required ignored, an admin may clear anything),
 * unknown keys are dropped, "Other" texts are kept beside their question,
 * and file answers may only keep or drop the response's own files.
 * `merge` edits the existing answers (a blank value clears that question),
 * `replace` builds the answers from the edit alone.
 */
export function cleanAdminAnswers(
  document: Pick<FormDocument, "fields">,
  incoming: Record<string, unknown>,
  existing: FormAnswers,
  mode: "merge" | "replace",
): { answers: FormAnswers; errors: Record<string, FieldError> } {
  const fields = new Map<string, FormField>();
  const otherOwners = new Map<string, FormField>();
  for (const field of document.fields) {
    if (!isInputType(field.type)) continue;
    fields.set(field.id, field);
    if (field.allowOther) otherOwners.set(otherKey(field.id), field);
  }

  const answers: FormAnswers = mode === "merge" ? { ...existing } : {};
  const errors: Record<string, FieldError> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (otherOwners.has(key)) {
      if (typeof value === "string" && value.trim()) answers[key] = value.trim().slice(0, 2000);
      else delete answers[key];
      continue;
    }
    const field = fields.get(key);
    if (!field) continue;
    if (!isAnswered(value)) {
      delete answers[key];
      continue;
    }
    if (field.type === "hidden") {
      if (typeof value !== "string") errors[key] = { code: "invalid" };
      else answers[key] = value.trim().slice(0, 2000);
      continue;
    }
    if (isFileType(field.type)) {
      const own = existing[key];
      const ownFiles = new Map(
        (isFileAnswer(own) ? own : []).map((file: FormFileAnswer) => [file.key, file]),
      );
      if (!isFileAnswer(value) || value.some((file) => !ownFiles.has(file.key))) {
        errors[key] = { code: "files" };
        continue;
      }
      answers[key] = value.map((file) => ownFiles.get(file.key)!);
      continue;
    }
    const error = validateFieldAnswer({ ...field, required: false }, value as never);
    if (error) {
      errors[key] = error;
      continue;
    }
    answers[key] = typeof value === "string" ? value.trim() : (value as FormAnswers[string]);
  }
  return { answers, errors };
}

/** The responses admin: list, edit, bulk actions, data cleaning and file links. */
@Injectable()
export class FormsResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly forms: FormsService,
  ) {}

  async list(formId: string): Promise<FormResponseRecord[]> {
    await this.forms.require(formId);
    const rows = await this.prisma.formResponse.findMany({
      where: { formId },
      orderBy: { createdAt: "desc" },
      take: RESPONSES_LIST_MAX,
    });
    return rows.map(toResponseRecord);
  }

  async patch(
    formId: string,
    responseId: string,
    patch: ResponsePatchBody,
  ): Promise<FormResponseRecord> {
    const form = await this.forms.require(formId);
    const row = await this.prisma.formResponse.findFirst({ where: { id: responseId, formId } });
    if (!row) throw new FormsError("That response does not exist.", 404);

    const data: Prisma.FormResponseUpdateInput = {};
    if (patch.answers) {
      const { answers, errors } = cleanAdminAnswers(
        storedDocument(form.data),
        patch.answers,
        row.answers as FormAnswers,
        "merge",
      );
      if (Object.keys(errors).length) {
        throw new FormsError("Some answers are not valid for their question.", 400, errors);
      }
      data.answers = answers as unknown as Prisma.InputJsonValue;
      data.editedAt = new Date();
    }
    if (patch.starred !== undefined) data.starred = patch.starred;
    if (patch.flagged !== undefined) data.flagged = patch.flagged;
    if (patch.reviewed !== undefined) data.reviewed = patch.reviewed;
    if (patch.spam !== undefined) data.spam = patch.spam;
    if (patch.tags !== undefined) data.tags = normalizeTags(patch.tags);
    if (patch.note !== undefined) data.note = patch.note?.trim() ? patch.note.trim() : null;

    const updated = await this.prisma.formResponse.update({ where: { id: row.id }, data });
    return toResponseRecord(updated);
  }

  async bulk(formId: string, input: BulkBody): Promise<{ ok: true; count: number }> {
    await this.forms.require(formId);
    const ids = [...new Set(input.ids)];
    const where = { formId, id: { in: ids } };
    const flags: Partial<Record<BulkBody["action"], Prisma.FormResponseUpdateManyMutationInput>> = {
      star: { starred: true },
      unstar: { starred: false },
      flag: { flagged: true },
      unflag: { flagged: false },
      review: { reviewed: true },
      unreview: { reviewed: false },
      spam: { spam: true },
      unspam: { spam: false },
    };

    if (input.action === "delete") {
      const uploads = await this.prisma.formUpload.findMany({
        where: { formId, responseId: { in: ids } },
        select: { key: true },
      });
      const deleted = await this.prisma.formResponse.deleteMany({ where });
      const keys = uploads.map((upload) => upload.key);
      if (keys.length) {
        await this.prisma.formUpload.deleteMany({ where: { key: { in: keys } } });
        await this.forms.deleteObjects(keys);
      }
      return { ok: true, count: deleted.count };
    }

    if (input.action === "tag" || input.action === "untag") {
      const tag = (input.tag ?? "").trim().slice(0, TAG_LENGTH_MAX).trim();
      if (!tag) throw new FormsError("tag: Name the tag.", 400);
      const count =
        input.action === "tag"
          ? await this.prisma.$executeRaw`
              UPDATE "FormResponse"
              SET "tags" = array_append(COALESCE("tags", ARRAY[]::TEXT[]), ${tag})
              WHERE "formId" = ${formId} AND "id" = ANY(${ids}::text[])
                AND NOT (${tag} = ANY(COALESCE("tags", ARRAY[]::TEXT[])))
                AND cardinality(COALESCE("tags", ARRAY[]::TEXT[])) < ${TAGS_MAX}
            `
          : await this.prisma.$executeRaw`
              UPDATE "FormResponse"
              SET "tags" = array_remove("tags", ${tag})
              WHERE "formId" = ${formId} AND "id" = ANY(${ids}::text[])
                AND ${tag} = ANY(COALESCE("tags", ARRAY[]::TEXT[]))
            `;
      return { ok: true, count };
    }

    const data = flags[input.action];
    if (!data) throw new FormsError("Unknown action.", 400);
    const updated = await this.prisma.formResponse.updateMany({ where, data });
    return { ok: true, count: updated.count };
  }

  /** Replaces the answers of many responses at once (data cleaning), all or nothing. */
  async apply(formId: string, input: ApplyBody): Promise<{ ok: true; count: number }> {
    const form = await this.forms.require(formId);
    const document = storedDocument(form.data);
    const ids = input.updates.map((update) => update.id);
    const rows = await this.prisma.formResponse.findMany({
      where: { formId, id: { in: ids } },
      select: { id: true, answers: true },
    });
    const existing = new Map(rows.map((row) => [row.id, row.answers as FormAnswers]));
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length) {
      throw new FormsError(`Response ${missing[0]} does not exist in this form.`, 404);
    }

    const cleaned = input.updates.map((update) => {
      const { answers, errors } = cleanAdminAnswers(
        document,
        update.answers,
        existing.get(update.id)!,
        "replace",
      );
      if (Object.keys(errors).length) {
        const [fieldId] = Object.keys(errors);
        throw new FormsError(`Response ${update.id}: ${fieldId} is not valid.`, 400, errors);
      }
      return { id: update.id, answers };
    });

    const editedAt = new Date();
    await this.prisma.$transaction(
      cleaned.map((update) =>
        this.prisma.formResponse.update({
          where: { id: update.id },
          data: { answers: update.answers as unknown as Prisma.InputJsonValue, editedAt },
        }),
      ),
    );
    return { ok: true, count: cleaned.length };
  }

  private async requireUpload(formId: string, key: string) {
    if (uploadKeyFormId(key) !== formId) throw new FormsError("File not found.", 404);
    const upload = await this.prisma.formUpload.findFirst({ where: { key, formId } });
    if (!upload) throw new FormsError("File not found.", 404);
    return upload;
  }

  /** A signed, 15-minute link to a respondent's upload. */
  async fileLink(formId: string, key: string) {
    const upload = await this.requireUpload(formId, key);
    let url: string;
    try {
      url = await this.storage.getSignedDownloadUrl(upload.key, 60 * 15);
    } catch {
      throw new FormsError("File storage is not configured in this environment.", 503);
    }
    return { url, name: upload.name, type: upload.type, size: upload.size };
  }

  /** The upload's bytes, for downloads streamed through the web app. */
  async fileBytes(formId: string, key: string, maxBytes: number) {
    const upload = await this.requireUpload(formId, key);
    let body: Buffer;
    try {
      body = await this.storage.readFile(upload.key, maxBytes, 60_000);
    } catch {
      throw new FormsError("The file could not be read from storage.", 502);
    }
    return { body, name: upload.name, type: upload.type };
  }
}
