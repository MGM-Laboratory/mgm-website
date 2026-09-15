import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";

import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const JOBS_RECORDS_CACHE_KEY = "cms:jobs:v1";
const JOBS_ADMIN_CACHE_KEY = "cms:jobs:admin:v1";
const JOBS_RECORDS_CACHE_TTL_SECONDS = 60 * 10;

type PublicJobRecord = Record<string, unknown> & { slug: string; updatedAt: string };

/** Feed entries carry everything except the BlockNote document. */
function toFeedEntry(record: PublicJobRecord) {
  return { ...record, content: [] };
}

/** Today in UTC as YYYY-MM-DD; deadlines compare against this string. */
export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Open roles: published and the deadline (YYYY-MM-DD) has not passed.
 * The deadline day is inclusive — a role stays open through its listed day.
 */
export function isOpenJob(record: Record<string, unknown>) {
  const job = record.job as { status?: unknown; deadline?: unknown } | undefined;
  if (job?.status !== "published" || typeof job.deadline !== "string") return false;
  return job.deadline >= todayUtc();
}

@Injectable()
export class CmsJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** The public listing: open roles only, without BlockNote documents. */
  async all() {
    const cached = await this.cache.getJson<PublicJobRecord[]>(JOBS_RECORDS_CACHE_KEY);
    if (cached) return cached;

    const records = (await this.readAll()).filter(isOpenJob).map(toFeedEntry);
    await this.cache.setJson(JOBS_RECORDS_CACHE_KEY, records, JOBS_RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  /**
   * One role with its full document. Drafts are invisible to the public;
   * closed roles still resolve so direct links show the closed state.
   */
  async bySlug(slug: string) {
    const record = await this.prisma.cmsJobPosting.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Job record not found");
    const publicRecord: PublicJobRecord = {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
    const job = publicRecord.job as { status?: unknown } | undefined;
    if (job?.status === "draft") throw new NotFoundException("Job record not found");
    return publicRecord;
  }

  /** The admin workspace: every role, including drafts, with full documents. */
  async allIncludingDrafts() {
    const cached = await this.cache.getJson<PublicJobRecord[]>(JOBS_ADMIN_CACHE_KEY);
    if (cached) return cached;

    const records = await this.readAll();
    await this.cache.setJson(JOBS_ADMIN_CACHE_KEY, records, JOBS_RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  async save(currentSlug: string, nextSlug: string, data: Prisma.InputJsonValue) {
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.cmsJobPosting.findUnique({ where: { slug: currentSlug } });

      if (!current) {
        if (currentSlug !== nextSlug) throw new NotFoundException("Job record not found");
        return transaction.cmsJobPosting.create({ data: { slug: nextSlug, data } });
      }

      if (currentSlug !== nextSlug) {
        const destination = await transaction.cmsJobPosting.findUnique({
          where: { slug: nextSlug },
        });
        if (destination) throw new Error("CMS_JOB_SLUG_CONFLICT");
      }

      return transaction.cmsJobPosting.update({
        where: { slug: currentSlug },
        data: { data, slug: nextSlug },
      });
    });
    await this.invalidateRecords();
    return {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async remove(slug: string) {
    try {
      await this.prisma.cmsJobPosting.delete({ where: { slug } });
    } catch {
      throw new NotFoundException("Job record not found");
    }
    await this.invalidateRecords();
  }

  private async readAll(): Promise<PublicJobRecord[]> {
    const records = await this.prisma.cmsJobPosting.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  private async invalidateRecords() {
    await Promise.all([
      this.cache.remove(JOBS_RECORDS_CACHE_KEY),
      this.cache.remove(JOBS_ADMIN_CACHE_KEY),
    ]);
  }
}
