import { Injectable } from "@nestjs/common";
import { DEFAULT_CONTACT_SETTINGS, type ContactSettings } from "@repo/shared";

import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

// Singleton row — always read/written under this fixed slug.
const CONTACT_SETTINGS_SLUG = "contact";
const CONTACT_SETTINGS_CACHE_KEY = "cms:contact-settings:v1";
const CONTACT_SETTINGS_CACHE_TTL_SECONDS = 60 * 10;

@Injectable()
export class CmsContactSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async get(): Promise<ContactSettings> {
    const cached = await this.cache.getJson<ContactSettings>(CONTACT_SETTINGS_CACHE_KEY);
    if (cached) return cached;

    const record = await this.prisma.cmsContactSettings.findUnique({
      where: { slug: CONTACT_SETTINGS_SLUG },
    });
    const settings = record ? (record.data as ContactSettings) : DEFAULT_CONTACT_SETTINGS;
    await this.cache.setJson(
      CONTACT_SETTINGS_CACHE_KEY,
      settings,
      CONTACT_SETTINGS_CACHE_TTL_SECONDS,
    );
    return settings;
  }

  async save(data: ContactSettings): Promise<ContactSettings> {
    await this.prisma.cmsContactSettings.upsert({
      where: { slug: CONTACT_SETTINGS_SLUG },
      create: { slug: CONTACT_SETTINGS_SLUG, data },
      update: { data },
    });
    await this.cache.remove(CONTACT_SETTINGS_CACHE_KEY);
    return data;
  }
}
