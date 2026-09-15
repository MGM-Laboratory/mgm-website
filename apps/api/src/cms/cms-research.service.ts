import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";

const RECORDS_CACHE_KEY = "cms:research:v1";
const DRAFTS_CACHE_KEY = "cms:research:drafts:v1";
const FEED_CACHE_KEY = "cms:research:feed:v1";
const RECORDS_CACHE_TTL_SECONDS = 60 * 10;
type PublicResearchRecord = Record<string, unknown> & { slug: string; updatedAt: string };

// Only keys minted by the cover upload endpoint may be cleaned up here; seed
// media under `static/...` and any other namespace object is left alone.
const COVER_KEY_PATTERN =
  /^research-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;

/** Feed entries carry everything except the BlockNote document. */
function toFeedEntry(record: PublicResearchRecord) {
  return { ...record, body: [] };
}

function isDraft(record: Record<string, unknown>) {
  const research = record.research as { draft?: unknown } | undefined;
  return research?.draft === true;
}

function coverKeyOf(record: Record<string, unknown>) {
  const research = record.research as { coverKey?: unknown } | undefined;
  return typeof research?.coverKey === "string" ? research.coverKey : undefined;
}

@Injectable()
export class CmsResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  /** The public feed: published initiatives only. Drafts never leave this service. */
  async all() {
    const cached = await this.cache.getJson<PublicResearchRecord[]>(RECORDS_CACHE_KEY);
    if (cached) return cached;

    const records = (await this.readAll()).filter((record) => !isDraft(record));
    await this.cache.setJson(RECORDS_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  /** The public list without BlockNote documents, for feed-sized payloads. */
  async feed() {
    const cached = await this.cache.getJson<PublicResearchRecord[]>(FEED_CACHE_KEY);
    if (cached) return cached;

    const records = (await this.readAll()).filter((record) => !isDraft(record)).map(toFeedEntry);
    await this.cache.setJson(FEED_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  /** One published initiative with its document, or nothing. */
  async bySlug(slug: string) {
    const record = await this.prisma.cmsResearchInitiative.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Research initiative not found");
    const publicRecord = {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
    if (isDraft(publicRecord)) throw new NotFoundException("Research initiative not found");
    return publicRecord;
  }

  /** The admin workspace: every initiative, including unpublished drafts. */
  async allIncludingDrafts() {
    const cached = await this.cache.getJson<PublicResearchRecord[]>(DRAFTS_CACHE_KEY);
    if (cached) return cached;

    const records = await this.readAll();
    await this.cache.setJson(DRAFTS_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  private async readAll() {
    const records = await this.prisma.cmsResearchInitiative.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  async save(currentSlug: string, nextSlug: string, data: Prisma.InputJsonValue) {
    let previousCoverKey: string | undefined;
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.cmsResearchInitiative.findUnique({
        where: { slug: currentSlug },
      });

      if (!current) {
        if (currentSlug !== nextSlug) throw new NotFoundException("Research initiative not found");
        return transaction.cmsResearchInitiative.create({ data: { slug: nextSlug, data } });
      }

      if (currentSlug !== nextSlug) {
        const destination = await transaction.cmsResearchInitiative.findUnique({
          where: { slug: nextSlug },
        });
        if (destination) throw new Error("CMS_RESEARCH_SLUG_CONFLICT");
      }

      previousCoverKey = coverKeyOf(current.data as Record<string, unknown>);
      return transaction.cmsResearchInitiative.update({
        where: { slug: currentSlug },
        data: { data, slug: nextSlug },
      });
    });

    // Featured is a spotlight for exactly one published initiative at a
    // time. Publishing a new featured record clears the flag on every
    // other published one; drafts keep their flag untouched.
    const savedResearch = (data as { research?: { featured?: boolean; draft?: boolean } }).research;
    if (savedResearch?.featured && !savedResearch?.draft) {
      const others = await this.prisma.cmsResearchInitiative.findMany({
        where: {
          slug: { not: nextSlug },
          data: { path: ["research", "featured"], equals: true },
        },
      });
      for (const other of others) {
        const otherData = other.data as { research?: { featured?: boolean } };
        if (otherData.research) otherData.research.featured = false;
        await this.prisma.cmsResearchInitiative.update({
          where: { slug: other.slug },
          data: { data: otherData as Prisma.InputJsonValue },
        });
      }
    }

    // Replacing or removing a cover orphans its predecessor in storage.
    const nextCoverKey = coverKeyOf(data as Record<string, unknown>);
    if (
      previousCoverKey &&
      previousCoverKey !== nextCoverKey &&
      COVER_KEY_PATTERN.test(previousCoverKey)
    ) {
      await this.storage.deleteFile(previousCoverKey).catch(() => undefined);
    }

    await this.invalidateRecords();
    return {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async bootstrap(records: { data: Prisma.InputJsonValue; slug: string }[]) {
    const existingCount = await this.prisma.cmsResearchInitiative.count();
    if (existingCount) return this.all();

    await this.prisma.$transaction(
      records.map((record) =>
        this.prisma.cmsResearchInitiative.upsert({
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
      record = await this.prisma.cmsResearchInitiative.delete({ where: { slug } });
    } catch {
      throw new NotFoundException("Research initiative not found");
    }
    const key = coverKeyOf(record.data as Record<string, unknown>);
    if (key && COVER_KEY_PATTERN.test(key)) {
      await this.storage.deleteFile(key).catch(() => undefined);
    }
    await this.invalidateRecords();
  }

  private async invalidateRecords() {
    await Promise.all([
      this.cache.remove(RECORDS_CACHE_KEY),
      this.cache.remove(DRAFTS_CACHE_KEY),
      this.cache.remove(FEED_CACHE_KEY),
    ]);
  }
}
