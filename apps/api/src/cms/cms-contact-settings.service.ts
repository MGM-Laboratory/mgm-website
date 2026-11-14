import { Injectable } from "@nestjs/common";
import {
  contactSettingsSchema,
  DEFAULT_CONTACT_SETTINGS,
  type ContactDetails,
  type ContactSettings,
} from "@repo/shared";

import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

// Singleton row — always read/written under this fixed slug.
const CONTACT_SETTINGS_SLUG = "contact";
const CONTACT_SETTINGS_CACHE_KEY = "cms:contact-settings:v1";
const CONTACT_SETTINGS_CACHE_TTL_SECONDS = 60 * 10;

/**
 * Revalidates stored settings so current schema defaults fill missing fields.
 * Invalid records fall back to the complete default settings.
 */
function normalize(data: unknown): ContactSettings {
  const parsed = contactSettingsSchema.safeParse(data);
  return parsed.success ? parsed.data : DEFAULT_CONTACT_SETTINGS;
}

@Injectable()
export class CmsContactSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Returns normalized settings from the cache or singleton database record. */
  async get(): Promise<ContactSettings> {
    const cached = await this.cache.getJson<ContactSettings>(CONTACT_SETTINGS_CACHE_KEY);
    if (cached) return normalize(cached);

    const record = await this.prisma.cmsContactSettings.findUnique({
      where: { slug: CONTACT_SETTINGS_SLUG },
    });
    const settings = normalize(record?.data ?? DEFAULT_CONTACT_SETTINGS);
    await this.cache.setJson(
      CONTACT_SETTINGS_CACHE_KEY,
      settings,
      CONTACT_SETTINGS_CACHE_TTL_SECONDS,
    );
    return settings;
  }

  /**
   * Replaces the singleton settings record and invalidates its cached value.
   * It takes the same lock as `saveDetails`, so a partial save that has read
   * the record cannot write an older routing over the one that this save sets.
   */
  async save(data: ContactSettings): Promise<ContactSettings> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockSettings(tx);
      await tx.cmsContactSettings.upsert({
        where: { slug: CONTACT_SETTINGS_SLUG },
        create: { slug: CONTACT_SETTINGS_SLUG, data },
        update: { data },
      });
    });
    await this.cache.remove(CONTACT_SETTINGS_CACHE_KEY);
    return data;
  }

  // An advisory lock of the transaction works before the row exists, which a
  // row lock does not, and it is released when the transaction ends. Every
  // writer of the record must take it, or it protects nobody.
  private async lockSettings(tx: Pick<PrismaService, "$executeRaw">) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"contact-settings:" + CONTACT_SETTINGS_SLUG}))`;
  }

  /**
   * Changes only the contact details and keeps the stored routing. It holds the
   * lock of `save` while it reads and writes, so two saves queue up and neither
   * one writes back an older copy of what the other changed.
   */
  async saveDetails(details: ContactDetails): Promise<ContactSettings> {
    const defined = Object.fromEntries(
      Object.entries(details).filter(([, value]) => value !== undefined),
    );
    const saved = await this.prisma.$transaction(async (tx) => {
      await this.lockSettings(tx);
      const row = await tx.cmsContactSettings.findUnique({
        where: { slug: CONTACT_SETTINGS_SLUG },
      });
      const next = contactSettingsSchema.parse({
        ...normalize(row?.data ?? DEFAULT_CONTACT_SETTINGS),
        ...defined,
      });
      await tx.cmsContactSettings.upsert({
        where: { slug: CONTACT_SETTINGS_SLUG },
        create: { slug: CONTACT_SETTINGS_SLUG, data: next },
        update: { data: next },
      });
      return next;
    });
    await this.cache.remove(CONTACT_SETTINGS_CACHE_KEY);
    return saved;
  }
}
