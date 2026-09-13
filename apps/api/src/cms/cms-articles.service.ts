import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const ARTICLE_RECORDS_CACHE_KEY = "cms:articles:v1";
const ARTICLE_DRAFTS_CACHE_KEY = "cms:articles:drafts:v1";
const ARTICLE_RECORDS_CACHE_TTL_SECONDS = 60 * 10;
type PublicArticleRecord = Record<string, unknown> & { slug: string; updatedAt: string };

function isDraft(record: Record<string, unknown>) {
  const article = record.article as { draft?: unknown } | undefined;
  return article?.draft === true;
}

@Injectable()
export class CmsArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** The public feed: published articles only. Drafts never leave this service. */
  async all() {
    const cached = await this.cache.getJson<PublicArticleRecord[]>(ARTICLE_RECORDS_CACHE_KEY);
    if (cached) return cached;

    const records = (await this.readAll()).filter((record) => !isDraft(record));
    await this.cache.setJson(ARTICLE_RECORDS_CACHE_KEY, records, ARTICLE_RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  /** The admin workspace: every article, including unpublished drafts. */
  async allIncludingDrafts() {
    const cached = await this.cache.getJson<PublicArticleRecord[]>(ARTICLE_DRAFTS_CACHE_KEY);
    if (cached) return cached;

    const records = await this.readAll();
    await this.cache.setJson(ARTICLE_DRAFTS_CACHE_KEY, records, ARTICLE_RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  private async readAll() {
    const records = await this.prisma.cmsArticle.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  async save(currentSlug: string, nextSlug: string, data: Prisma.InputJsonValue) {
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.cmsArticle.findUnique({ where: { slug: currentSlug } });

      if (!current) {
        if (currentSlug !== nextSlug) throw new NotFoundException("Article record not found");
        return transaction.cmsArticle.create({ data: { slug: nextSlug, data } });
      }

      if (currentSlug !== nextSlug) {
        const destination = await transaction.cmsArticle.findUnique({ where: { slug: nextSlug } });
        if (destination) throw new Error("CMS_ARTICLE_SLUG_CONFLICT");
      }

      return transaction.cmsArticle.update({
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

  async bootstrap(records: { data: Prisma.InputJsonValue; slug: string }[]) {
    const existingCount = await this.prisma.cmsArticle.count();
    if (existingCount) return this.all();

    await this.prisma.$transaction(
      records.map((record) =>
        this.prisma.cmsArticle.upsert({
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
      await this.prisma.cmsArticle.delete({ where: { slug } });
    } catch {
      throw new NotFoundException("Article record not found");
    }
    await this.invalidateRecords();
  }

  private async invalidateRecords() {
    await Promise.all([
      this.cache.remove(ARTICLE_RECORDS_CACHE_KEY),
      this.cache.remove(ARTICLE_DRAFTS_CACHE_KEY),
    ]);
  }
}
