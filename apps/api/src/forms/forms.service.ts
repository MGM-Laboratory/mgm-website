import { Injectable, Logger } from "@nestjs/common";

import {
  isInputType,
  type FormDocument,
  type FormRecord,
  type FormStatus,
  type FormSummary,
} from "@repo/shared";

import type { Form, Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import { hashPassphrase } from "../shortlinks/shortlinks.utils.js";
import { FormsError, parseDocumentInput, storedDocument } from "./forms.common.js";
import { ScanBudget } from "./scan-budget.js";
import type { UpdateFormBody } from "./forms.schemas.js";
import {
  FORM_SLUG_LENGTH,
  documentMediaKeys,
  mediaKeyFormId,
  parseFormSlug,
  randomFormSlug,
  slugCandidates,
  slugify,
} from "./forms.utils.js";

type FormStats = FormRecord["stats"];

// How long and how many keys a copy remembers as used by some form.
const REFERENCED_KEYS_TTL_MS = 5 * 60 * 1000;
const REFERENCED_KEYS_MAX = 500;
const EMPTY_STATS: FormStats = { responses: 0, views: 0, starts: 0, lastResponseAt: null };

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}

/** The form rows and their admin-facing shapes: CRUD, slugs, stats, design media. */
@Injectable()
export class FormsService {
  private readonly logger = new Logger(FormsService.name);
  // The scan of every form document is the one expensive step of the public
  // media route, and a made up key whose form does not exist reaches it.
  private readonly referenceScans = new ScanBudget(5, 2);
  // A form that was duplicated keeps pointing at the media of its original, so
  // once the original is deleted every image of the copy needs the scan. A
  // key that a scan found is remembered for a while, which leaves the budget
  // to the keys that are made up.
  private readonly referencedKeys = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // --- Shapes ---

  /** Responses, views, starts and the latest response per form, in two grouped queries. */
  async statsFor(ids: readonly string[]): Promise<Map<string, FormStats>> {
    const stats = new Map<string, FormStats>(ids.map((id) => [id, { ...EMPTY_STATS }]));
    if (!ids.length) return stats;
    const [responses, events] = await Promise.all([
      this.prisma.formResponse.groupBy({
        by: ["formId"],
        where: { formId: { in: [...ids] } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.formEvent.groupBy({
        by: ["formId", "type"],
        where: { formId: { in: [...ids] }, type: { in: ["view", "start"] } },
        _count: { _all: true },
      }),
    ]);
    for (const row of responses) {
      const entry = stats.get(row.formId);
      if (!entry) continue;
      entry.responses = row._count._all;
      entry.lastResponseAt = row._max.createdAt?.toISOString() ?? null;
    }
    for (const row of events) {
      const entry = stats.get(row.formId);
      if (!entry) continue;
      if (row.type === "view") entry.views = row._count._all;
      if (row.type === "start") entry.starts = row._count._all;
    }
    return stats;
  }

  toRecord(row: Form, stats: FormStats = EMPTY_STATS): FormRecord {
    return {
      id: row.id,
      slug: row.slug,
      status: row.status as FormStatus,
      document: storedDocument(row.data),
      hasPassphrase: Boolean(row.passphraseHash),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      stats,
    };
  }

  toSummary(row: Form, stats: FormStats = EMPTY_STATS): FormSummary {
    const { document, ...record } = this.toRecord(row, stats);
    return {
      ...record,
      title: document.title,
      questionCount: document.fields.filter(
        (field) => isInputType(field.type) && field.type !== "hidden",
      ).length,
      theme: document.design.theme,
    };
  }

  private async recordWithStats(row: Form): Promise<FormRecord> {
    const stats = await this.statsFor([row.id]);
    return this.toRecord(row, stats.get(row.id));
  }

  // --- Slugs ---

  private async slugFree(slug: string, excludeId?: string) {
    const owner = await this.prisma.form.findUnique({ where: { slug }, select: { id: true } });
    return !owner || owner.id === excludeId;
  }

  /** A random slug no form uses, lengthening only if the short space looks crowded. */
  async mintSlug(): Promise<string> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const length = FORM_SLUG_LENGTH + Math.floor(attempt / 4) * 2;
      const slug = randomFormSlug(length);
      if (await this.slugFree(slug)) return slug;
    }
    throw new FormsError("Could not find a free form URL, try again.", 503);
  }

  /** `base` when it's valid and free, else the first free numbered variant, else a random one. */
  async suggestSlug(base: string, excludeId?: string): Promise<string> {
    const material = slugify(base);
    if (material) {
      const direct = parseFormSlug(material);
      if (direct.ok && (await this.slugFree(direct.slug, excludeId))) return direct.slug;
      for (const candidate of slugCandidates(material)) {
        const parsed = parseFormSlug(candidate);
        if (parsed.ok && (await this.slugFree(parsed.slug, excludeId))) return parsed.slug;
      }
    }
    return this.mintSlug();
  }

  async slugAvailable(value: string, excludeId?: string) {
    const parsed = parseFormSlug(value);
    if (parsed.ok && (await this.slugFree(parsed.slug, excludeId))) {
      return { available: true, suggestion: parsed.slug };
    }
    return { available: false, suggestion: await this.suggestSlug(value, excludeId) };
  }

  /** A requested slug, validated and free; empty or missing mints one. */
  private async claimSlug(value: string | undefined, excludeId?: string): Promise<string> {
    if (value === undefined || value.trim() === "") return this.mintSlug();
    const parsed = parseFormSlug(value);
    if (!parsed.ok) throw new FormsError(`slug: ${parsed.message}`, 400);
    if (!(await this.slugFree(parsed.slug, excludeId))) {
      throw new FormsError("That form URL is already in use.", 409);
    }
    return parsed.slug;
  }

  // --- CRUD ---

  async list(): Promise<FormSummary[]> {
    const rows = await this.prisma.form.findMany({ orderBy: { updatedAt: "desc" } });
    const stats = await this.statsFor(rows.map((row) => row.id));
    return rows.map((row) => this.toSummary(row, stats.get(row.id)));
  }

  async get(id: string): Promise<FormRecord> {
    return this.recordWithStats(await this.require(id));
  }

  async require(id: string): Promise<Form> {
    const row = await this.prisma.form.findUnique({ where: { id } });
    if (!row) throw new FormsError("That form does not exist.", 404);
    return row;
  }

  async create(input: {
    document: unknown;
    slug?: string;
    status?: FormStatus;
  }): Promise<FormRecord> {
    const document = parseDocumentInput(input.document);
    const slug = await this.claimSlug(input.slug);
    const status = input.status ?? "draft";
    try {
      const row = await this.prisma.form.create({
        data: {
          slug,
          status,
          data: document as unknown as Prisma.InputJsonValue,
          publishedAt: status === "published" ? new Date() : null,
        },
      });
      return this.toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new FormsError("That form URL is already in use.", 409);
      throw error;
    }
  }

  async update(id: string, input: UpdateFormBody): Promise<FormRecord> {
    const row = await this.require(id);
    const data: Prisma.FormUpdateInput = {};
    if (input.document !== undefined) {
      data.data = parseDocumentInput(input.document) as unknown as Prisma.InputJsonValue;
    }
    if (input.slug !== undefined && input.slug.trim().toLowerCase() !== row.slug) {
      data.slug = await this.claimSlug(input.slug, id);
    }
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === "published" && !row.publishedAt) data.publishedAt = new Date();
    }
    if (input.passphraseAction === "set") {
      const passphrase = input.passphrase?.trim();
      if (!passphrase) throw new FormsError("passphrase: Enter a passphrase.", 400);
      const { salt, hash } = await hashPassphrase(passphrase);
      data.passphraseSalt = salt;
      data.passphraseHash = hash;
    } else if (input.passphraseAction === "remove") {
      data.passphraseSalt = null;
      data.passphraseHash = null;
    }
    try {
      const updated = await this.prisma.form.update({ where: { id }, data });
      return this.recordWithStats(updated);
    } catch (error) {
      if (isUniqueViolation(error)) throw new FormsError("That form URL is already in use.", 409);
      throw error;
    }
  }

  /** A draft copy: same document with " (copy)" on the title, a new slug, no passphrase or data. */
  async duplicate(id: string): Promise<FormRecord> {
    const row = await this.require(id);
    const document = storedDocument(row.data);
    const copy: FormDocument = {
      ...document,
      title: `${document.title} (copy)`.slice(0, 200),
    };
    const slug = await this.suggestSlug(`${row.slug}-copy`);
    const created = await this.prisma.form.create({
      data: {
        slug,
        status: "draft",
        data: copy as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toRecord(created);
  }

  /** Deletes the form (responses, events and uploads cascade) and its stored files. */
  async remove(id: string): Promise<void> {
    const row = await this.require(id);
    const uploads = await this.prisma.formUpload.findMany({
      where: { formId: id },
      select: { key: true },
    });
    const mediaKeys = documentMediaKeys(row.data);
    await this.prisma.form.delete({ where: { id } });

    const keys = uploads.map((upload) => upload.key);
    for (const key of mediaKeys) {
      // A duplicated form keeps pointing at its original's media: those
      // objects stay while any remaining form still uses them.
      if (!(await this.mediaReferenced(key))) keys.push(key);
    }
    await this.deleteObjects(keys);
  }

  /** Best-effort storage cleanup: a missing object or bucket never fails the caller. */
  async deleteObjects(keys: readonly string[]) {
    let failed = 0;
    for (const key of keys) {
      await this.storage.deleteFile(key).catch(() => {
        failed += 1;
      });
    }
    if (failed) this.logger.warn(`Could not delete ${failed} of ${keys.length} form files`);
  }

  /** Whether any form's document mentions this media key. */
  async mediaReferenced(key: string): Promise<boolean> {
    // Keys are `[a-z0-9.-]` only (checked by the caller's pattern), so they
    // carry no LIKE wildcard.
    const rows = await this.prisma.$queryRaw<{ found: number }[]>`
      SELECT 1::int AS "found" FROM "Form" WHERE "data"::text LIKE ${`%"${key}"%`} LIMIT 1
    `;
    return rows.length > 0;
  }

  private rememberReferenced(key: string) {
    const now = Date.now();
    if (this.referencedKeys.size >= REFERENCED_KEYS_MAX) {
      for (const [stored, expires] of this.referencedKeys) {
        if (expires <= now) this.referencedKeys.delete(stored);
      }
      if (this.referencedKeys.size >= REFERENCED_KEYS_MAX) {
        const oldest = this.referencedKeys.keys().next().value;
        if (oldest !== undefined) this.referencedKeys.delete(oldest);
      }
    }
    this.referencedKeys.set(key, now + REFERENCED_KEYS_TTL_MS);
  }

  /**
   * A design media key may be served when its form exists or any form still
   * uses it. The second check is limited to a few scans, and a key that it found is remembered for a few minutes.
   */
  async mediaServable(key: string): Promise<boolean> {
    const formId = mediaKeyFormId(key);
    if (!formId) return false;
    const owner = await this.prisma.form.findUnique({
      where: { id: formId },
      select: { id: true },
    });
    if (owner) return true;
    const known = this.referencedKeys.get(key);
    if (known !== undefined && known > Date.now()) return true;
    // Over the budget the key is not served.
    const found = await this.referenceScans.run(() => this.mediaReferenced(key));
    if (found !== true) return false;
    this.rememberReferenced(key);
    return true;
  }
}
