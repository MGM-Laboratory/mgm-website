import { Injectable } from "@nestjs/common";
import { DEFAULT_HOME_CONTENT, homeContentSchema, type HomeContent } from "@repo/shared";

import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

// Singleton row — always read/written under this fixed slug.
const HOME_CONTENT_SLUG = "home";
const HOME_CONTENT_CACHE_KEY = "cms:home-content:v1";
const HOME_CONTENT_CACHE_TTL_SECONDS = 60 * 10;

/**
 * Revalidates stored content so current schema defaults fill missing fields.
 * Invalid records fall back to the complete default content.
 */
function normalize(data: unknown): HomeContent {
  const parsed = homeContentSchema.safeParse(data);
  return parsed.success ? parsed.data : DEFAULT_HOME_CONTENT;
}

@Injectable()
export class CmsHomeContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Returns normalized content from the cache or singleton database record. */
  async get(): Promise<HomeContent> {
    const cached = await this.cache.getJson<HomeContent>(HOME_CONTENT_CACHE_KEY);
    if (cached) return normalize(cached);

    const record = await this.prisma.cmsHomeContent.findUnique({
      where: { slug: HOME_CONTENT_SLUG },
    });
    const content = normalize(record?.data ?? DEFAULT_HOME_CONTENT);
    await this.cache.setJson(HOME_CONTENT_CACHE_KEY, content, HOME_CONTENT_CACHE_TTL_SECONDS);
    return content;
  }

  /** Upserts the singleton content record and invalidates its cached value. */
  async save(data: HomeContent): Promise<HomeContent> {
    await this.prisma.cmsHomeContent.upsert({
      where: { slug: HOME_CONTENT_SLUG },
      create: { slug: HOME_CONTENT_SLUG, data },
      update: { data },
    });
    await this.cache.remove(HOME_CONTENT_CACHE_KEY);
    return data;
  }

  /** Whether `key` is the currently-saved video — guards playback after a replace. */
  async videoKeyMatches(key: string): Promise<boolean> {
    const content = await this.get();
    return content.videoMode === "upload" && content.videoKey === key;
  }
}
