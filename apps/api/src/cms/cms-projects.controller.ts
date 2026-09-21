import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import sharp from "sharp";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.validation.js";
import { StorageService } from "../storage/storage.service.js";
import { CmsProjectsService } from "./cms-projects.service.js";
import { parseVideoUploadBody, redirectToSignedVideoUrl } from "./video-validation.util.js";

/**
 * Zod failures become readable 400s instead of opaque 500s: the editor
 * surfaces the first issue directly next to the field it came from.
 */
function parseSafe<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues[0]
        ? `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`
        : "Invalid request",
    );
  }
  return parsed.data;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const blockSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    props: z.record(z.string(), z.unknown()).optional(),
    content: z.unknown().optional(),
    children: z.array(z.unknown()).optional(),
  })
  .passthrough();

// Site paths (a single leading slash, never protocol-relative) and http(s)
// URLs only; javascript:, data:, and every other scheme are refused.
const SAFE_URL_PATTERN = /^(\/(?!\/)|https?:\/\/)/i;
const YOUTUBE_URL_PATTERN =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{6,}/i;

export const PROJECT_CATEGORIES = ["website", "mobile", "hci-ux", "game"] as const;
export const PROJECT_STATUSES = ["planned", "in-progress", "completed", "archived"] as const;
export const PROJECT_VIDEO_MODES = ["none", "upload", "url", "youtube"] as const;

const contributorSchema = z.object({
  id: z.string().trim().min(1).max(64),
  kind: z.enum(["residence", "non-residence"]).optional(),
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(120).optional(),
  affiliation: z.string().trim().max(300).optional(),
  memberSlug: z.string().trim().min(1).max(120).optional(),
  url: z.string().trim().max(500).optional(),
  photoKey: z.string().min(1).max(500).optional(),
  photoPosition: z
    .object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      zoom: z.number().positive().max(10),
    })
    .optional(),
});

const organizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => !value || SAFE_URL_PATTERN.test(value), "Use a URL or a site path.")
    .optional(),
});

const linkSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().min(1).max(500).regex(SAFE_URL_PATTERN, "Use a URL or a site path."),
});

const outputSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["research", "publication", "article"]),
  label: z.string().trim().min(1).max(200),
  href: z.string().trim().min(1).max(500).regex(SAFE_URL_PATTERN, "Use a URL or a site path."),
  recordSlug: z.string().regex(SLUG_PATTERN).optional(),
});

const projectSchema = z
  .object({
    slug: z.string().regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens."),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    categories: z.array(z.enum(PROJECT_CATEGORIES)).min(1).max(4),
    techStack: z.array(z.string().trim().min(1).max(40)).max(24),
    status: z.enum(PROJECT_STATUSES),
    startDate: z.string().regex(DATE_PATTERN).optional(),
    endDate: z.string().regex(DATE_PATTERN).optional(),
    role: z.string().trim().max(160).optional(),
    platform: z.string().trim().max(160).optional(),
    featured: z.boolean(),
    draft: z.boolean(),
    coverKey: z.string().min(1).max(500).optional(),
    coverAlt: z.string().trim().max(300).optional(),
    galleryKeys: z.array(z.string().min(1).max(500)).max(20),
    videoMode: z.enum(PROJECT_VIDEO_MODES),
    videoKey: z.string().min(1).max(500).optional(),
    videoName: z.string().trim().max(300).optional(),
    videoSize: z.number().int().nonnegative().max(1_073_741_824).optional(),
    videoUrl: z.string().trim().max(500).optional(),
    links: z.array(linkSchema).max(20),
    contributors: z.array(contributorSchema).max(50),
    organizations: z.array(organizationSchema).max(10),
    outputs: z.array(outputSchema).max(50),
    seoTitle: z.string().trim().max(120).optional(),
    seoDescription: z.string().trim().max(300).optional(),
  })
  .refine(
    ({ startDate, endDate }) => !startDate || !endDate || endDate >= startDate,
    "The end date cannot be earlier than the start date.",
  )
  .refine(
    ({ videoMode, videoUrl }) =>
      (videoMode !== "url" && videoMode !== "youtube") || Boolean(videoUrl?.trim()),
    "Add a video URL for this mode.",
  )
  .refine(
    ({ videoMode, videoUrl }) =>
      videoMode !== "youtube" || !videoUrl || YOUTUBE_URL_PATTERN.test(videoUrl),
    "That doesn't look like a YouTube URL.",
  );

const projectRecordSchema = z.object({
  project: projectSchema,
  body: z.array(blockSchema),
});
const bootstrapSchema = z.object({ records: z.array(projectRecordSchema).min(1).max(500) });
const saveProjectSchema = projectRecordSchema.extend({
  sourceSlug: z.string().min(1).optional(),
});

const imageSchema = z.object({ image: z.string().startsWith("data:image/") });

// Every project image key is minted by the media upload endpoint with a
// `project-<slug>-<uuid>.<ext>` shape; contributor portraits mint their own
// `contributor-<uuid>.webp` keys. Anything else belongs to another namespace
// and is refused.
const MEDIA_KEY_PATTERN =
  /^project-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;
const VIDEO_KEY_PATTERN =
  /^demo-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@ApiTags("cms-projects")
@Controller("cms/projects")
export class CmsProjectsController {
  constructor(
    private readonly projects: CmsProjectsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async all() {
    // Drafts are filtered server-side; this route feeds the public site.
    return { records: await this.projects.all() };
  }

  @Get("admin")
  async allIncludingDrafts(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { records: await this.projects.allIncludingDrafts() };
  }

  // The light feed sits above ":slug" so this reserved path can never be
  // shadowed by a record slug.
  @Get("feed")
  async feed() {
    return { records: await this.projects.feed() };
  }

  @Get(":slug")
  async one(@Param("slug") slug: string) {
    return { record: await this.projects.bySlug(slug) };
  }

  @Post("bootstrap")
  async bootstrap(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { records } = parseSafe(bootstrapSchema, body);
    return {
      records: await this.projects.bootstrap(
        records.map((record) => ({
          data: record as unknown as Prisma.InputJsonValue,
          slug: record.project.slug,
        })),
      ),
    };
  }

  // Contributor portraits are uploaded before the project necessarily has a
  // slug yet, so this route (like publications' author-photo) is not scoped
  // under ":slug".
  @Post("contributor-photo")
  async uploadContributorPhoto(
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const { image } = parseSafe(imageSchema, body);
    const [meta, payload] = image.split(",", 2);
    const sourceType = meta.match(/^data:(image\/(?:png|jpeg|webp|gif));base64$/)?.[1];
    const buffer = Buffer.from(payload ?? "", "base64");
    if (!sourceType || !buffer.length || buffer.length > 6 * 1024 * 1024) {
      throw new BadRequestException(
        "The portrait must be a PNG, JPEG, WebP, or GIF image under 6 MB after cropping.",
      );
    }
    let webp: Buffer;
    try {
      webp = await sharp(buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException("That file is not a valid image.");
    }
    const key = `contributor-${randomUUID()}.webp`;
    try {
      await this.storage.uploadFile({ body: webp, contentType: "image/webp", key });
    } catch {
      throw new BadRequestException(
        "Media storage is not configured in this environment, so portraits cannot be uploaded.",
      );
    }
    return { key };
  }

  @SkipThrottle()
  @Get("media/:key")
  async media(@Param("key") key: string, @Res() response: Response) {
    if (!MEDIA_KEY_PATTERN.test(key)) {
      throw new BadRequestException("Unknown media key");
    }
    let url: string;
    try {
      url = await this.storage.getSignedDownloadUrl(key, 60 * 15);
    } catch {
      throw new BadRequestException("Media storage is not configured in this environment.");
    }
    return response.redirect(url);
  }

  @SkipThrottle()
  @Get("video/:key")
  async video(@Param("key") key: string, @Res() response: Response) {
    if (!VIDEO_KEY_PATTERN.test(key)) {
      throw new BadRequestException("Unknown video key");
    }
    if (!(await this.projects.videoIsPublished(key))) {
      throw new BadRequestException("Project record not found");
    }
    await redirectToSignedVideoUrl(response, this.storage, key);
  }

  @Put(":slug")
  async save(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const document = parseSafe(saveProjectSchema, body);
    try {
      return await this.projects.save(
        slug,
        document.project.slug,
        document as unknown as Prisma.InputJsonValue,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "CMS_PROJECT_SLUG_CONFLICT") {
        throw new ConflictException("That project URL is already in use.");
      }
      throw error;
    }
  }

  @Delete(":slug")
  async remove(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    await this.projects.remove(slug);
    return { ok: true };
  }

  @Post(":slug/media")
  async uploadMedia(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    if (!SLUG_PATTERN.test(slug)) throw new BadRequestException("Invalid project slug");
    const { image } = parseSafe(imageSchema, body);
    const [meta, payload] = image.split(",", 2);
    const contentType = meta.match(/^data:(image\/(?:jpeg|png|webp));base64$/)?.[1];
    const buffer = Buffer.from(payload ?? "", "base64");
    if (!contentType || !buffer.length || buffer.length > 6 * 1024 * 1024) {
      throw new BadRequestException(
        "Images must be PNG, JPEG, or WebP under 6 MB after compression.",
      );
    }
    const extension =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `project-${slug}-${randomUUID()}.${extension}`;
    try {
      await this.storage.uploadFile({ body: buffer, contentType, key });
    } catch {
      throw new BadRequestException(
        "Media storage is not configured in this environment, so images cannot be uploaded.",
      );
    }
    return { key };
  }

  // Raw video bytes; the global raw-body middleware (main.ts) enforces the
  // same size ceiling.
  @Post(":slug/video")
  async uploadVideo(
    @Param("slug") slug: string,
    @Req() request: Request,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    if (!SLUG_PATTERN.test(slug)) throw new BadRequestException("Invalid project slug");
    const maxBytes = this.config.getOrThrow<number>("CMS_MAX_VIDEO_BYTES");
    const { body, contentType, extension } = parseVideoUploadBody(request, maxBytes, "demo video");

    const key = `demo-${slug}-${randomUUID()}.${extension}`;
    try {
      await this.storage.uploadFile({ body, contentType, key });
    } catch {
      throw new BadRequestException(
        "Video storage is not configured in this environment, so demos cannot be uploaded.",
      );
    }
    return { key, size: body.length };
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
