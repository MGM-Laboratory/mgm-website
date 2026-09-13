import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const ARTICLE_RECORDS_CACHE_KEY = "cms:articles:v1";
const ARTICLE_RECORDS_CACHE_TTL_SECONDS = 60 * 10;
type PublicArticleRecord = Record<string, unknown> & { slug: string; updatedAt: string };

@Injectable()
export class CmsArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async all() {
    const cached = await this.cache.getJson<PublicArticleRecord[]>(ARTICLE_RECORDS_CACHE_KEY);
    if (cached) return cached;

    const records = await this.prisma.cmsArticle.findMany({ orderBy: { updatedAt: "desc" } });
    const publicRecords = records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    }));
    await this.cache.setJson(
      ARTICLE_RECORDS_CACHE_KEY,
      publicRecords,
      ARTICLE_RECORDS_CACHE_TTL_SECONDS,
    );
    return publicRecords;
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
    await this.cache.remove(ARTICLE_RECORDS_CACHE_KEY);
  }
}
