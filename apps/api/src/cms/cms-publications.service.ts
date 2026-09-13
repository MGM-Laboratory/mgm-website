import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";

const RECORDS_CACHE_KEY = "cms:publications:v1";
const DRAFTS_CACHE_KEY = "cms:publications:drafts:v1";
const FEED_CACHE_KEY = "cms:publications:feed:v1";
const RECORDS_CACHE_TTL_SECONDS = 60 * 10;
const PAPER_ALLOWED_TTL_SECONDS = 60 * 10;
type PublicPublicationRecord = Record<string, unknown> & { slug: string; updatedAt: string };

// Only keys minted by the paper upload endpoint may be cleaned up here; seed
// media under `static/...` and any other namespace object is left alone.
const PAPER_KEY_PATTERN =
  /^paper-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

// Non-residence author portraits are minted by the photo upload endpoint.
const AUTHOR_PHOTO_KEY_PATTERN =
  /^author-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|webp)$/;

function isDraft(record: Record<string, unknown>) {
  const publication = record.publication as { draft?: unknown } | undefined;
  return publication?.draft === true;
}

function paperKeyOf(record: Record<string, unknown>) {
  const publication = record.publication as { paperKey?: unknown } | undefined;
  return typeof publication?.paperKey === "string" ? publication.paperKey : undefined;
}

function authorPhotoKeysOf(record: Record<string, unknown>) {
  const publication = record.publication as { authors?: unknown } | undefined;
  if (!Array.isArray(publication?.authors)) return [];
  return publication.authors.flatMap((author) => {
    const photoKey = (author as { photoKey?: unknown } | undefined)?.photoKey;
    return typeof photoKey === "string" ? [photoKey] : [];
  });
}

@Injectable()
export class CmsPublicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  /** The public feed: published publications only. Drafts never leave this service. */
  async all() {
    const cached = await this.cache.getJson<PublicPublicationRecord[]>(RECORDS_CACHE_KEY);
    if (cached) return cached;

    const records = (await this.readAll()).filter((record) => !isDraft(record));
    await this.cache.setJson(RECORDS_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  /**
   * The public list for feed-sized payloads. Publication records carry no
   * heavy document — the paper itself lives in storage — so this is the same
   * set as `all` today, but callers stay safe if records grow later.
   */
  async feed() {
    const cached = await this.cache.getJson<PublicPublicationRecord[]>(FEED_CACHE_KEY);
    if (cached) return cached;

    const records = (await this.readAll()).filter((record) => !isDraft(record));
    await this.cache.setJson(FEED_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  /** Whether a paper key belongs to a published (non-draft) publication. */
  async paperIsPublished(key: string) {
    const cacheKey = `cms:publications:paper-allowed:${key}`;
    const cached = await this.cache.getJson<boolean>(cacheKey);
    if (cached !== undefined) return cached;

    const records = await this.prisma.cmsPublication.findMany({
      where: { data: { path: ["publication", "paperKey"], equals: key } },
    });
    const allowed = records.some((record) => !isDraft(record.data as Record<string, unknown>));
    await this.cache.setJson(cacheKey, allowed, PAPER_ALLOWED_TTL_SECONDS);
    return allowed;
  }

  /** One published publication, or nothing. */
  async bySlug(slug: string) {
    const record = await this.prisma.cmsPublication.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Publication record not found");
    const publicRecord = {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
    if (isDraft(publicRecord)) throw new NotFoundException("Publication record not found");
    return publicRecord;
  }

  /** The admin workspace: every publication, including unpublished drafts. */
  async allIncludingDrafts() {
    const cached = await this.cache.getJson<PublicPublicationRecord[]>(DRAFTS_CACHE_KEY);
    if (cached) return cached;

    const records = await this.readAll();
    await this.cache.setJson(DRAFTS_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  private async readAll() {
    const records = await this.prisma.cmsPublication.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  async save(currentSlug: string, nextSlug: string, data: Prisma.InputJsonValue) {
    let previousPaperKey: string | undefined;
    let previousPhotoKeys: string[] = [];
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.cmsPublication.findUnique({ where: { slug: currentSlug } });

      if (!current) {
        if (currentSlug !== nextSlug) throw new NotFoundException("Publication record not found");
        return transaction.cmsPublication.create({ data: { slug: nextSlug, data } });
      }

      if (currentSlug !== nextSlug) {
        const destination = await transaction.cmsPublication.findUnique({
          where: { slug: nextSlug },
        });
        if (destination) throw new Error("CMS_PUBLICATION_SLUG_CONFLICT");
      }

      previousPaperKey = paperKeyOf(current.data as Record<string, unknown>);
      previousPhotoKeys = authorPhotoKeysOf(current.data as Record<string, unknown>);
      return transaction.cmsPublication.update({
        where: { slug: currentSlug },
        data: { data, slug: nextSlug },
      });
    });

    // Replacing or removing a paper orphans its predecessor in storage; a
    // paper can be large, so the old object is cleaned up on a best effort.
    const nextPaperKey = paperKeyOf(data as Record<string, unknown>);
    if (
      previousPaperKey &&
      previousPaperKey !== nextPaperKey &&
      PAPER_KEY_PATTERN.test(previousPaperKey)
    ) {
      await this.storage.deleteFile(previousPaperKey).catch(() => undefined);
    }
    // Same for replaced or removed author portraits.
    const nextPhotoKeys = authorPhotoKeysOf(data as Record<string, unknown>);
    for (const photoKey of previousPhotoKeys) {
      if (!nextPhotoKeys.includes(photoKey) && AUTHOR_PHOTO_KEY_PATTERN.test(photoKey)) {
        await this.storage.deleteFile(photoKey).catch(() => undefined);
      }
    }

    await Promise.all([
      this.invalidateRecords(),
      this.invalidatePaperAllowed(previousPaperKey),
      this.invalidatePaperAllowed(nextPaperKey),
    ]);
    return {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async bootstrap(records: { data: Prisma.InputJsonValue; slug: string }[]) {
    const existingCount = await this.prisma.cmsPublication.count();
    if (existingCount) return this.all();

    await this.prisma.$transaction(
      records.map((record) =>
        this.prisma.cmsPublication.upsert({
          where: { slug: record.slug },
          create: record,
          update: { data: record.data },
        }),
      ),
    );
    await this.invalidateRecords();
    return this.all();
  }

  async remove(slug: string) {
    let record;
    try {
      record = await this.prisma.cmsPublication.delete({ where: { slug } });
    } catch {
      throw new NotFoundException("Publication record not found");
    }
    const key = paperKeyOf(record.data as Record<string, unknown>);
    if (key && PAPER_KEY_PATTERN.test(key)) {
      await this.storage.deleteFile(key).catch(() => undefined);
    }
    for (const photoKey of authorPhotoKeysOf(record.data as Record<string, unknown>)) {
      if (AUTHOR_PHOTO_KEY_PATTERN.test(photoKey)) {
        await this.storage.deleteFile(photoKey).catch(() => undefined);
      }
    }
    await Promise.all([this.invalidateRecords(), this.invalidatePaperAllowed(key)]);
  }

  private async invalidateRecords() {
    await Promise.all([
      this.cache.remove(RECORDS_CACHE_KEY),
      this.cache.remove(DRAFTS_CACHE_KEY),
      this.cache.remove(FEED_CACHE_KEY),
    ]);
  }

  private async invalidatePaperAllowed(key?: string) {
    if (!key) return;
    await this.cache.remove(`cms:publications:paper-allowed:${key}`);
  }
}
