import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  computeScore,
  fieldMaxFileBytes,
  fileAccepted,
  isFileAnswer,
  isFileType,
  isInputType,
  pickEnding,
  resolvePath,
  toPublicFormDocument,
  validateSubmission,
  type FieldError,
  type FormAnswers,
  type FormDocument,
  type FormFileAnswer,
  type FormSubmissionResult,
  type FormUnavailableReason,
  type FormUploadResult,
  type PublicFormPayload,
} from "@repo/shared";

import type { Env } from "../config/env.validation.js";
import type { Form, Prisma } from "../generated/prisma/client.js";
import { Prisma as PrismaNamespace } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { lookupGeo } from "../shortlinks/shortlinks.geo.js";
import { parseUserAgent, verifyPassphrase } from "../shortlinks/shortlinks.utils.js";
import { StorageService } from "../storage/storage.service.js";
import { FormsError, storedDocument, type VisitMeta } from "./forms.common.js";
import { FormsMailer } from "./forms.mailer.js";
import type { ClientContext, EventBody, SubmissionBody } from "./forms.schemas.js";
import {
  clip,
  formAvailability,
  formTokenSecret,
  formUploadKey,
  imageDimensions,
  sanitizeFileName,
  signFormToken,
  sniffImage,
  storedUploadType,
  submissionTiming,
  uploadExtension,
  verifyFormToken,
  type Availability,
} from "./forms.utils.js";

const UNAVAILABLE_MESSAGES: Record<FormUnavailableReason, string> = {
  closed: "This form is closed.",
  not_open_yet: "This form is not open yet.",
  limit_reached: "This form has reached its response limit.",
};

/** A file answer as the client may send it: items carrying at least a key. */
function keyedItems(value: unknown): FormFileAnswer[] | null {
  if (!Array.isArray(value)) return null;
  const items = value as unknown[];
  return items.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { key?: unknown }).key === "string",
  )
    ? (items as FormFileAnswer[])
    : null;
}

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
const ORPHAN_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

type LoadedForm = { row: Form; document: FormDocument };

/** The respondent side: reading a form, unlocking it, events, uploads and submissions. */
@Injectable()
export class FormsPublicService {
  private readonly logger = new Logger(FormsPublicService.name);
  private readonly lastSweep = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
    private readonly mailer: FormsMailer,
  ) {}

  private get tokenSecret() {
    return formTokenSecret(this.config.getOrThrow<string>("ADMIN_PASSPHRASE"));
  }

  /** A form respondents may see: unknown slugs and drafts are 404s. */
  private async load(slug: string): Promise<LoadedForm> {
    const row = await this.prisma.form.findUnique({ where: { slug: String(slug).toLowerCase() } });
    if (!row || row.status === "draft") throw new FormsError("That form does not exist.", 404);
    return { row, document: storedDocument(row.data) };
  }

  private unlocked(row: Form, token: string | undefined): boolean {
    if (!row.passphraseHash) return true;
    return verifyFormToken(this.tokenSecret, row.id, row.passphraseHash, token);
  }

  private requireUnlocked(row: Form, token: string | undefined) {
    if (!this.unlocked(row, token)) throw new FormsError("This form is locked.", 401);
  }

  private async availability({ row, document }: LoadedForm): Promise<Availability> {
    const count = document.settings.responseLimit
      ? await this.prisma.formResponse.count({ where: { formId: row.id, spam: false } })
      : 0;
    return formAvailability(row.status, document.settings, count);
  }

  private async requireOpen(form: LoadedForm) {
    const availability = await this.availability(form);
    if (!availability.open) throw new FormsError(UNAVAILABLE_MESSAGES[availability.reason], 409);
  }

  private payload(
    { row, document }: LoadedForm,
    availability: Availability,
    unlocked: boolean,
    token?: string,
  ): PublicFormPayload {
    const common = {
      slug: row.slug,
      design: document.design,
      language: document.settings.language,
    };
    if (!availability.open) {
      return {
        state: "unavailable",
        ...common,
        reason: availability.reason,
        title: document.title,
        closedTitle: document.settings.closedTitle,
        closedMessage: document.settings.closedMessage,
        opensAt: availability.reason === "not_open_yet" ? document.settings.opensAt : undefined,
      };
    }
    if (!unlocked) return { state: "locked", ...common, title: document.title };
    return {
      state: "open",
      slug: row.slug,
      document: toPublicFormDocument(document),
      ...(token && row.passphraseHash ? { token } : {}),
    };
  }

  // --- Reading and unlocking ---

  async publicForm(slug: string, token?: string): Promise<PublicFormPayload> {
    const form = await this.load(slug);
    const unlocked = this.unlocked(form.row, token);
    return this.payload(
      form,
      await this.availability(form),
      unlocked,
      unlocked ? token : undefined,
    );
  }

  async unlock(slug: string, passphrase: string): Promise<PublicFormPayload> {
    const form = await this.load(slug);
    const { row } = form;
    const availability = await this.availability(form);
    if (!row.passphraseHash || !row.passphraseSalt) return this.payload(form, availability, true);
    const ok = await verifyPassphrase(passphrase, row.passphraseSalt, row.passphraseHash);
    if (!ok) throw new FormsError("That passphrase is not right.", 401);
    const token = signFormToken(this.tokenSecret, row.id, row.passphraseHash);
    return this.payload(form, availability, true, token);
  }

  // --- Visitor meta ---

  /**
   * The row fields every event and response records. Calls come from the
   * form page, so the forwarded referer is the form's own URL: the page's
   * `document.referrer` (in `context`) is the one that says where the
   * visitor came from, and the header is only a fallback for callers that
   * send no context.
   */
  private visitorFields(meta: VisitMeta, context: ClientContext, collectLocation: boolean) {
    const client = parseUserAgent(meta.userAgent ?? "");
    const referer = context ? (context.referrer ?? null) : meta.referer;
    return {
      ip: collectLocation ? clip(meta.ip, 45) : null,
      userAgent: clip(meta.userAgent, 500),
      referer: clip(referer, 500),
      device: client.device,
      browser: client.browser,
      os: client.os,
      language: clip(context?.language, 35),
    };
  }

  private geolocationOn() {
    return this.config.get("SHORTLINKS_GEOLOCATE") !== false;
  }

  /** Fire-and-forget geolocation of freshly written rows; never delays or fails the request. */
  private enrich(ip: string | null, events: string[], responseId?: string) {
    if (!ip || !this.geolocationOn() || (!events.length && !responseId)) return;
    void lookupGeo(ip)
      .then(async (geo) => {
        if (!geo) return;
        const { timezone, ...place } = geo;
        if (events.length) {
          await this.prisma.formEvent.updateMany({ where: { id: { in: events } }, data: place });
        }
        if (responseId) {
          await this.prisma.formResponse.updateMany({ where: { id: responseId }, data: place });
          if (timezone) {
            await this.prisma.formResponse.updateMany({
              where: { id: responseId, timezone: null },
              data: { timezone },
            });
          }
        }
      })
      .catch(() => {
        // Rows can vanish (form deleted) between the write and here.
      });
  }

  // --- Events ---

  async recordEvent(slug: string, input: EventBody, meta: VisitMeta, headerToken?: string) {
    const form = await this.load(slug);
    const { row, document } = form;
    this.requireUnlocked(row, headerToken ?? input.token);

    let fieldId: string | null = null;
    if (input.type === "progress") {
      const field = document.fields.find((candidate) => candidate.id === input.fieldId);
      // A question removed while someone was mid-form is simply not counted.
      if (!field || !isInputType(field.type)) return { ok: true as const };
      fieldId = field.id;
    }

    const collect = document.settings.collectLocation;
    const created = await this.prisma.formEvent.createManyAndReturn({
      data: [
        {
          formId: row.id,
          sessionId: input.sessionId,
          type: input.type,
          fieldId,
          dedupeKey: `${input.sessionId}:${input.type}:${fieldId ?? ""}`,
          ...this.visitorFields(meta, input.context, collect),
        },
      ],
      skipDuplicates: true,
      select: { id: true, ip: true },
    });
    if (created.length) {
      this.enrich(
        created[0].ip,
        created.map((event) => event.id),
      );
    }
    return { ok: true as const };
  }

  // --- Uploads ---

  async upload(
    slug: string,
    query: { fieldId: string; sessionId: string },
    file: { body: unknown; contentType: string; fileName: string | undefined },
    token: string | undefined,
  ): Promise<FormUploadResult> {
    const form = await this.load(slug);
    const { row, document } = form;
    this.requireUnlocked(row, token);
    await this.requireOpen(form);

    const field = document.fields.find((candidate) => candidate.id === query.fieldId);
    if (!field || !isFileType(field.type)) {
      throw new FormsError("That question does not take files.", 400);
    }
    // The route's own raw parser hands over a Buffer; anything else is not a file.
    // A fresh view over the raw bytes (no copy): from here on the body is a
    // Buffer this service made, never the request's own parameter value.
    const raw: unknown = file.body;
    const body = Buffer.isBuffer(raw)
      ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
      : null;
    if (!body?.length) throw new FormsError("The file is empty.", 400);

    const limit = Math.min(
      fieldMaxFileBytes(field),
      this.config.getOrThrow<number>("FORMS_MAX_UPLOAD_BYTES"),
    );
    if (body.length > limit) {
      const megabytes = Math.round((limit / 1024 / 1024) * 10) / 10;
      throw new FormsError(`The file must be under ${megabytes} MB.`, 413);
    }

    const name = sanitizeFileName(file.fileName);
    const claimed = file.contentType.split(";")[0].trim().toLowerCase();
    let type: string;
    let extension: string;
    let size: { width: number; height: number } | null = null;

    if (field.type === "image_upload" || field.type === "signature") {
      // Pictures are checked by their bytes, whatever the name or type claims.
      const sniffed = sniffImage(body);
      if (!sniffed) {
        throw new FormsError("That file is not a PNG, JPEG, WebP or GIF image.", 400);
      }
      type = sniffed.type;
      extension = sniffed.extension;
      size = imageDimensions(body, sniffed.type);
    } else {
      if (!fileAccepted(field, { name, type: claimed })) {
        throw new FormsError("That file type is not accepted here.", 400);
      }
      type = storedUploadType(name, claimed);
      extension = uploadExtension(name, type);
      const sniffed = sniffImage(body);
      if (sniffed) size = imageDimensions(body, sniffed.type);
    }

    const key = formUploadKey(row.id, extension);
    try {
      await this.storage.uploadFile({ body, contentType: type, key });
    } catch {
      throw new FormsError("File storage is not available right now. Try again later.", 503);
    }
    await this.prisma.formUpload.create({
      data: {
        key,
        formId: row.id,
        fieldId: field.id,
        sessionId: query.sessionId,
        name,
        size: body.length,
        type,
        width: size?.width ?? null,
        height: size?.height ?? null,
      },
    });
    this.sweepOrphans(row.id);
    return { file: { key, name, size: body.length, type } };
  }

  /**
   * Uploads nobody submitted within a day (abandoned forms, replaced files)
   * are deleted with their objects, at most every ten minutes per form.
   */
  private sweepOrphans(formId: string) {
    const now = Date.now();
    if (now - (this.lastSweep.get(formId) ?? 0) < ORPHAN_SWEEP_INTERVAL_MS) return;
    this.lastSweep.set(formId, now);
    if (this.lastSweep.size > 5000) this.lastSweep.clear();
    void (async () => {
      const orphans = await this.prisma.formUpload.findMany({
        where: {
          formId,
          responseId: null,
          createdAt: { lt: new Date(now - ORPHAN_AGE_MS) },
        },
        select: { key: true },
        take: 200,
      });
      for (const { key } of orphans) {
        await this.storage.deleteFile(key).catch(() => undefined);
      }
      if (orphans.length) {
        await this.prisma.formUpload.deleteMany({
          where: { key: { in: orphans.map((orphan) => orphan.key) }, responseId: null },
        });
      }
    })().catch((error: unknown) => {
      this.logger.warn("Orphaned form upload sweep failed", String(error));
    });
  }

  // --- Submissions ---

  /**
   * Replaces the client's file metadata with what the upload endpoint
   * stored. Keys that don't exist, belong to another form or question, or
   * were already submitted mark that question as invalid (reported only if
   * the respondent actually met the question).
   */
  private async rewriteFileAnswers(formId: string, document: FormDocument, answers: FormAnswers) {
    const invalid = new Set<string>();
    const fileFields = document.fields.filter((field) => isFileType(field.type));
    const keys = new Set<string>();
    for (const field of fileFields) {
      const value = keyedItems(answers[field.id]);
      if (!value) continue;
      for (const item of value) {
        if (keys.has(item.key)) invalid.add(field.id);
        keys.add(item.key);
      }
    }
    if (!keys.size) return { answers, invalid };

    const uploads = await this.prisma.formUpload.findMany({ where: { key: { in: [...keys] } } });
    const byKey = new Map(uploads.map((upload) => [upload.key, upload]));
    const rewritten: FormAnswers = { ...answers };
    for (const field of fileFields) {
      const value = keyedItems(answers[field.id]);
      if (!value) continue;
      const files: FormFileAnswer[] = [];
      for (const item of value) {
        const upload = byKey.get(item.key);
        if (
          !upload ||
          upload.formId !== formId ||
          upload.fieldId !== field.id ||
          upload.responseId !== null
        ) {
          // Kept as sent so the question still counts as answered and
          // its error is reported when the respondent met it.
          invalid.add(field.id);
          files.push(item);
          continue;
        }
        files.push({
          key: upload.key,
          name: upload.name,
          size: upload.size,
          type: upload.type,
          ...(upload.width !== null ? { width: upload.width } : {}),
          ...(upload.height !== null ? { height: upload.height } : {}),
        });
      }
      rewritten[field.id] = files;
    }
    return { answers: rewritten, invalid };
  }

  async submit(
    slug: string,
    input: SubmissionBody,
    meta: VisitMeta,
    headerToken?: string,
  ): Promise<FormSubmissionResult> {
    const form = await this.load(slug);
    const { row, document } = form;
    const settings = document.settings;
    this.requireUnlocked(row, headerToken ?? input.token);
    await this.requireOpen(form);

    if (settings.onePerDevice && input.deviceId) {
      const existing = await this.prisma.formResponse.findFirst({
        where: { formId: row.id, deviceId: input.deviceId },
        select: { id: true },
      });
      if (existing) throw new FormsError("You have already responded to this form.", 409);
    }

    const { answers, invalid } = await this.rewriteFileAnswers(
      row.id,
      document,
      input.answers as FormAnswers,
    );
    const result = validateSubmission(document, answers);
    const errors = new Map<string, FieldError>(Object.entries(result.errors));
    for (const fieldId of invalid) {
      if (fieldId in result.answers) errors.set(fieldId, { code: "files" });
    }
    if (errors.size) {
      throw new FormsError("Some answers need another look.", 400, Object.fromEntries(errors));
    }
    const kept = result.answers;

    const timing = submissionTiming(input, settings.minSeconds);
    const score = settings.scoring.enabled ? computeScore(document, kept) : null;
    // A stored document always has an ending; without one the response keeps none.
    const ending = document.endings.length
      ? pickEnding(document, kept, resolvePath(document, kept).forcedEndingId)
      : null;
    const claimedKeys = document.fields
      .filter((field) => isFileType(field.type))
      .flatMap((field) => {
        const value = kept[field.id];
        return isFileAnswer(value) ? value.map((file) => file.key) : [];
      });

    const context = input.context;
    const visitor = this.visitorFields(meta, context, settings.collectLocation);
    const utm = context?.utm
      ? Object.fromEntries(Object.entries(context.utm).filter(([, value]) => Boolean(value)))
      : null;

    const response = await this.prisma.$transaction(async (tx) => {
      const created = await tx.formResponse.create({
        data: {
          formId: row.id,
          answers: kept as unknown as Prisma.InputJsonValue,
          score,
          endingId: ending?.id ?? null,
          sessionId: input.sessionId,
          deviceId: clip(input.deviceId, 100),
          spam: timing.spam,
          ...visitor,
          timezone: clip(context?.timezone, 64),
          screen: clip(context?.screen, 20),
          utm:
            utm && Object.keys(utm).length
              ? (utm as Prisma.InputJsonValue)
              : PrismaNamespace.DbNull,
          startedAt: timing.startedAt,
          durationMs: timing.durationMs,
        },
      });
      if (claimedKeys.length) {
        const claimed = await tx.formUpload.updateMany({
          where: { key: { in: claimedKeys }, formId: row.id, responseId: null },
          data: { responseId: created.id },
        });
        // Two submissions racing for the same upload: only one keeps it.
        if (claimed.count !== claimedKeys.length) {
          throw new FormsError("One of the files was already submitted.", 409);
        }
      }
      return created;
    });

    const events = await this.prisma.formEvent.createManyAndReturn({
      data: [
        {
          formId: row.id,
          sessionId: input.sessionId,
          type: "submit",
          fieldId: null,
          dedupeKey: `${input.sessionId}:submit:${response.id}`,
          ...visitor,
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    this.enrich(
      response.ip,
      events.map((event) => event.id),
      response.id,
    );

    if (!response.spam) {
      this.mailer.responseReceived(document, response);
    }

    return { ok: true, responseId: response.id, endingId: ending?.id ?? "", score };
  }
}
