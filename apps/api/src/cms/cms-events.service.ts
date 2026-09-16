import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const RECORDS_CACHE_KEY = "cms:events:v1";
const DRAFTS_CACHE_KEY = "cms:events:drafts:v1";
const RECORDS_CACHE_TTL_SECONDS = 60 * 10;
type PublicEventRecord = Record<string, unknown> & { slug: string; updatedAt: string };

function isDraft(record: Record<string, unknown>) {
  return record.draft === true;
}

@Injectable()
export class CmsEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** The public list: published events only, drafts never leave this service. */
  async all() {
    const cached = await this.cache.getJson<PublicEventRecord[]>(RECORDS_CACHE_KEY);
    if (cached) return cached;
    const records = (await this.readAll()).filter((record) => !isDraft(record));
    await this.cache.setJson(RECORDS_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  async bySlug(slug: string) {
    const record = await this.prisma.cmsEvent.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Event not found");
    const publicRecord = {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
    if (isDraft(publicRecord)) throw new NotFoundException("Event not found");
    return publicRecord;
  }

  /** The admin workspace: every event, including unpublished drafts. */
  async allIncludingDrafts() {
    const cached = await this.cache.getJson<PublicEventRecord[]>(DRAFTS_CACHE_KEY);
    if (cached) return cached;
    const records = await this.readAll();
    await this.cache.setJson(DRAFTS_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  private async readAll() {
    const records = await this.prisma.cmsEvent.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  async save(currentSlug: string, nextSlug: string, data: Prisma.InputJsonValue) {
    const record = await this.prisma.$transaction(async (tx) => {
      const current = await tx.cmsEvent.findUnique({ where: { slug: currentSlug } });
      if (!current) {
        if (currentSlug !== nextSlug) throw new NotFoundException("Event not found");
        return tx.cmsEvent.create({ data: { slug: nextSlug, data } });
      }
      if (currentSlug !== nextSlug) {
        const destination = await tx.cmsEvent.findUnique({ where: { slug: nextSlug } });
        if (destination) throw new Error("CMS_EVENT_SLUG_CONFLICT");
      }
      return tx.cmsEvent.update({ where: { slug: currentSlug }, data: { data, slug: nextSlug } });
    });
    await this.invalidateRecords();
    return {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async bootstrap(records: { data: Prisma.InputJsonValue; slug: string }[]) {
    const existingCount = await this.prisma.cmsEvent.count();
    if (existingCount) return this.all();

    await this.prisma.$transaction(
      records.map((record) =>
        this.prisma.cmsEvent.upsert({
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
    try {
      await this.prisma.cmsEvent.delete({ where: { slug } });
    } catch {
      throw new NotFoundException("Event not found");
    }
    await this.invalidateRecords();
  }

  private async invalidateRecords() {
    await Promise.all([this.cache.remove(RECORDS_CACHE_KEY), this.cache.remove(DRAFTS_CACHE_KEY)]);
  }
}
