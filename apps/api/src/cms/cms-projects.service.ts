import { Injectable, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import type { Prisma } from "../generated/prisma/client.js";
import { CacheService } from "../cache/cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";

const RECORDS_CACHE_KEY = "cms:projects:v1";
const DRAFTS_CACHE_KEY = "cms:projects:drafts:v1";
const FEED_CACHE_KEY = "cms:projects:feed:v1";
const RECORDS_CACHE_TTL_SECONDS = 60 * 10;
const VIDEO_ALLOWED_TTL_SECONDS = 60 * 10;
// Stored image keys are immutable (every upload mints a new uuid), so a
// measured size never goes stale; a failed read is retried after a while.
const MEDIA_SIZE_TTL_SECONDS = 60 * 60 * 24 * 30;
const MEDIA_SIZE_MISS_TTL_SECONDS = 60 * 10;
const MEDIA_SIZE_MAX_BYTES = 12 * 1024 * 1024;
const MEDIA_SIZE_MAX_KEYS = 48;
const MEDIA_SIZE_CONCURRENCY = 4;
// A detail page render waits at most this long for sizes it hasn't cached
// yet; whatever isn't measured by then is measured in the background and
// served from the cache on the next request.
const MEDIA_SIZE_BUDGET_MS = 2500;
type PublicProjectRecord = Record<string, unknown> & { slug: string; updatedAt: string };

const MEDIA_KEY_PATTERN =
  /^project-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;
const CONTRIBUTOR_PHOTO_KEY_PATTERN =
  /^contributor-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
const VIDEO_KEY_PATTERN =
  /^demo-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/;

/** Feed entries carry everything except the BlockNote document. */
function toFeedEntry(record: PublicProjectRecord) {
  return { ...record, body: [] };
}

function isDraft(record: Record<string, unknown>) {
  const project = record.project as { draft?: unknown } | undefined;
  return project?.draft === true;
}

function projectOf(record: Record<string, unknown>) {
  return record.project as
    | {
        coverKey?: unknown;
        galleryKeys?: unknown;
        videoKey?: unknown;
        contributors?: unknown;
        media?: unknown;
      }
    | undefined;
}

/** The detail page's media sections, as loosely typed as the stored JSON. */
function mediaSectionsOf(record: Record<string, unknown>) {
  const media = projectOf(record)?.media;
  if (!Array.isArray(media)) return [];
  return media.flatMap((item) => {
    const section = item as { kind?: unknown; key?: unknown; posterKey?: unknown } | undefined;
    if (typeof section?.key !== "string") return [];
    return [
      {
        kind: section.kind === "video" ? ("video" as const) : ("image" as const),
        key: section.key,
        posterKey: typeof section.posterKey === "string" ? section.posterKey : undefined,
      },
    ];
  });
}

const BODY_MEDIA_URL_PATTERN = /\/api\/projects-cms\/media\/([^/?#"]+)/;

/** Image keys embedded in the record's BlockNote body (image blocks' `props.url`). */
function bodyMediaKeysOf(record: Record<string, unknown>) {
  const keys: string[] = [];
  const visit = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      const node = block as { props?: { url?: unknown }; children?: unknown } | undefined;
      const match =
        typeof node?.props?.url === "string" && BODY_MEDIA_URL_PATTERN.exec(node.props.url);
      if (match) {
        try {
          keys.push(decodeURIComponent(match[1]));
        } catch {
          // A malformed escape can't name a stored object.
        }
      }
      visit(node?.children);
    }
  };
  visit(record.body);
  return keys;
}

/**
 * Every image key a record references: cover, gallery, media sections,
 * posters, and images placed in the body. Save and delete only remove
 * stored objects that no longer appear anywhere in this list, so an image
 * dropped from the gallery or the media sections survives while the body
 * still shows it.
 */
function mediaKeysOf(record: Record<string, unknown>) {
  const project = projectOf(record);
  const keys: string[] = [];
  if (typeof project?.coverKey === "string") keys.push(project.coverKey);
  if (Array.isArray(project?.galleryKeys)) {
    for (const key of project.galleryKeys) if (typeof key === "string") keys.push(key);
  }
  for (const section of mediaSectionsOf(record)) {
    if (section.kind === "image") keys.push(section.key);
    if (section.posterKey) keys.push(section.posterKey);
  }
  keys.push(...bodyMediaKeysOf(record));
  return keys;
}

/** Every video key a record references: the demo video and video media sections. */
function videoKeysOf(record: Record<string, unknown>) {
  const keys: string[] = [];
  const demo = projectOf(record)?.videoKey;
  if (typeof demo === "string") keys.push(demo);
  for (const section of mediaSectionsOf(record)) {
    if (section.kind === "video") keys.push(section.key);
  }
  return keys;
}

function contributorPhotoKeysOf(record: Record<string, unknown>) {
  const contributors = projectOf(record)?.contributors;
  if (!Array.isArray(contributors)) return [];
  return contributors.flatMap((contributor) => {
    const key = (contributor as { photoKey?: unknown } | undefined)?.photoKey;
    return typeof key === "string" ? [key] : [];
  });
}

@Injectable()
export class CmsProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  async all() {
    const cached = await this.cache.getJson<PublicProjectRecord[]>(RECORDS_CACHE_KEY);
    if (cached) return cached;
    const records = (await this.readAll()).filter((record) => !isDraft(record));
    await this.cache.setJson(RECORDS_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  async feed() {
    const cached = await this.cache.getJson<PublicProjectRecord[]>(FEED_CACHE_KEY);
    if (cached) return cached;
    const records = (await this.readAll()).filter((record) => !isDraft(record)).map(toFeedEntry);
    await this.cache.setJson(FEED_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  async videoIsPublished(key: string) {
    const cacheKey = `cms:projects:video-allowed:${key}`;
    const cached = await this.cache.getJson<boolean>(cacheKey);
    if (cached !== undefined) return cached;
    // A video is public when a published record uses it as its demo video
    // or in one of its media sections (jsonb containment on the array).
    const records = await this.prisma.cmsProject.findMany({
      where: {
        OR: [
          { data: { path: ["project", "videoKey"], equals: key } },
          { data: { path: ["project", "media"], array_contains: [{ key }] } },
        ],
      },
    });
    const allowed = records.some((record) => !isDraft(record.data as Record<string, unknown>));
    await this.cache.setJson(cacheKey, allowed, VIDEO_ALLOWED_TTL_SECONDS);
    return allowed;
  }

  async bySlug(slug: string) {
    const record = await this.prisma.cmsProject.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Project record not found");
    const publicRecord = {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
    if (isDraft(publicRecord)) throw new NotFoundException("Project record not found");
    return { ...publicRecord, mediaSizes: await this.mediaSizesOf(publicRecord) };
  }

  /**
   * Pixel sizes of the record's images whose size the record doesn't carry,
   * keyed by media key: image sections saved without one, or, for a record
   * with no sections, the cover and gallery the page derives them from. The detail page lays its horizontal track out from these
   * before any image loads, so older records don't reflow as they arrive.
   */
  private async mediaSizesOf(record: Record<string, unknown>) {
    const project = projectOf(record);
    const keys = new Set<string>();
    const sections = Array.isArray(project?.media) ? project.media : [];
    if (sections.length) {
      // Explicit sections: only images saved without a size.
      for (const item of sections) {
        const section = item as { kind?: unknown; key?: unknown; width?: unknown } | undefined;
        if (section?.kind === "image" && typeof section.key === "string" && !section.width) {
          keys.add(section.key);
        }
      }
    } else {
      // No sections yet: the page derives them from the cover and gallery.
      if (typeof project?.coverKey === "string") keys.add(project.coverKey);
      if (Array.isArray(project?.galleryKeys)) {
        for (const key of project.galleryKeys) if (typeof key === "string") keys.add(key);
      }
    }
    const wanted = [...keys]
      .filter((key) => MEDIA_KEY_PATTERN.test(key))
      .slice(0, MEDIA_SIZE_MAX_KEYS);
    const sizes: Record<string, [number, number]> = {};
    const queue = [...wanted];
    const worker = async () => {
      for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
        const size = await this.imageSize(key);
        if (size) sizes[key] = size;
      }
    };
    const work = Promise.all(Array.from({ length: MEDIA_SIZE_CONCURRENCY }, worker));
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, MEDIA_SIZE_BUDGET_MS);
      }),
    ]);
    clearTimeout(timer);
    return { ...sizes };
  }

  private async imageSize(key: string): Promise<[number, number] | undefined> {
    const cacheKey = `cms:projects:media-size:${key}`;
    const cached = await this.cache.getJson<[number, number] | 0>(cacheKey);
    if (cached !== undefined) return cached || undefined;
    try {
      const metadata = await sharp(await this.storage.readFile(key, MEDIA_SIZE_MAX_BYTES), {
        limitInputPixels: 100_000_000,
      }).metadata();
      if (!metadata.width || !metadata.height) throw new Error("No dimensions");
      // EXIF orientations 5 to 8 display rotated a quarter turn.
      const turned = (metadata.orientation ?? 1) >= 5;
      const size: [number, number] = turned
        ? [metadata.height, metadata.width]
        : [metadata.width, metadata.height];
      await this.cache.setJson(cacheKey, size, MEDIA_SIZE_TTL_SECONDS);
      return size;
    } catch {
      await this.cache.setJson(cacheKey, 0, MEDIA_SIZE_MISS_TTL_SECONDS);
      return undefined;
    }
  }

  async allIncludingDrafts() {
    const cached = await this.cache.getJson<PublicProjectRecord[]>(DRAFTS_CACHE_KEY);
    if (cached) return cached;
    const records = await this.readAll();
    await this.cache.setJson(DRAFTS_CACHE_KEY, records, RECORDS_CACHE_TTL_SECONDS);
    return records;
  }

  private async readAll() {
    const records = await this.prisma.cmsProject.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  async save(currentSlug: string, nextSlug: string, data: Prisma.InputJsonValue) {
    let previousMediaKeys: string[] = [];
    let previousVideoKeys: string[] = [];
    let previousPhotoKeys: string[] = [];
    const record = await this.prisma.$transaction(async (tx) => {
      const current = await tx.cmsProject.findUnique({ where: { slug: currentSlug } });
      if (!current) {
        if (currentSlug !== nextSlug) throw new NotFoundException("Project record not found");
        return tx.cmsProject.create({ data: { slug: nextSlug, data } });
      }
      if (currentSlug !== nextSlug) {
        const destination = await tx.cmsProject.findUnique({ where: { slug: nextSlug } });
        if (destination) throw new Error("CMS_PROJECT_SLUG_CONFLICT");
      }
      previousMediaKeys = mediaKeysOf(current.data as Record<string, unknown>);
      previousVideoKeys = videoKeysOf(current.data as Record<string, unknown>);
      previousPhotoKeys = contributorPhotoKeysOf(current.data as Record<string, unknown>);
      return tx.cmsProject.update({ where: { slug: currentSlug }, data: { data, slug: nextSlug } });
    });

    const nextMediaKeys = mediaKeysOf(data as Record<string, unknown>);
    for (const key of previousMediaKeys) {
      if (!nextMediaKeys.includes(key) && MEDIA_KEY_PATTERN.test(key)) {
        await this.storage.deleteFile(key).catch(() => undefined);
      }
    }
    const nextVideoKeys = videoKeysOf(data as Record<string, unknown>);
    for (const key of previousVideoKeys) {
      if (!nextVideoKeys.includes(key) && VIDEO_KEY_PATTERN.test(key)) {
        await this.storage.deleteFile(key).catch(() => undefined);
      }
    }
    const nextPhotoKeys = contributorPhotoKeysOf(data as Record<string, unknown>);
    for (const key of previousPhotoKeys) {
      if (!nextPhotoKeys.includes(key) && CONTRIBUTOR_PHOTO_KEY_PATTERN.test(key)) {
        await this.storage.deleteFile(key).catch(() => undefined);
      }
    }

    await Promise.all([
      this.invalidateRecords(),
      ...[...new Set([...previousVideoKeys, ...nextVideoKeys])].map((key) =>
        this.invalidateVideoAllowed(key),
      ),
    ]);
    return {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async bootstrap(records: { data: Prisma.InputJsonValue; slug: string }[]) {
    const existingCount = await this.prisma.cmsProject.count();
    if (existingCount) return this.all();

    await this.prisma.$transaction(
      records.map((record) =>
        this.prisma.cmsProject.upsert({
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
      record = await this.prisma.cmsProject.delete({ where: { slug } });
    } catch {
      throw new NotFoundException("Project record not found");
    }
    const data = record.data as Record<string, unknown>;
    for (const key of mediaKeysOf(data)) {
      if (MEDIA_KEY_PATTERN.test(key)) await this.storage.deleteFile(key).catch(() => undefined);
    }
    const videoKeys = videoKeysOf(data);
    for (const key of videoKeys) {
      if (VIDEO_KEY_PATTERN.test(key)) await this.storage.deleteFile(key).catch(() => undefined);
    }
    for (const key of contributorPhotoKeysOf(data)) {
      if (CONTRIBUTOR_PHOTO_KEY_PATTERN.test(key)) {
        await this.storage.deleteFile(key).catch(() => undefined);
      }
    }
    await Promise.all([
      this.invalidateRecords(),
      ...videoKeys.map((key) => this.invalidateVideoAllowed(key)),
    ]);
  }

  private async invalidateRecords() {
    await Promise.all([
      this.cache.remove(RECORDS_CACHE_KEY),
      this.cache.remove(DRAFTS_CACHE_KEY),
      this.cache.remove(FEED_CACHE_KEY),
    ]);
  }

  private async invalidateVideoAllowed(key?: string) {
    if (!key) return;
    await this.cache.remove(`cms:projects:video-allowed:${key}`);
  }
}
