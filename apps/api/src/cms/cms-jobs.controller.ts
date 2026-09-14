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
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.validation.js";
import { StorageService } from "../storage/storage.service.js";
import { CmsJobsService } from "./cms-jobs.service.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// BlockNote document validation. Unknown block fields must survive the parse
// so zod's default stripping does not silently rewrite saved documents.
const blockSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    props: z.record(z.string(), z.unknown()).optional(),
    content: z.unknown().optional(),
    children: z.array(z.unknown()).optional(),
  })
  .passthrough();

// Paths that belong to routes on this controller (and the applications
// namespace in the companion service); a job can never claim one as its URL.
const RESERVED_JOB_SLUGS = new Set(["admin", "feed", "media", "applications"]);

const jobSchema = z.object({
  job: z.object({
    slug: z
      .string()
      .regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens.")
      .refine((value) => !RESERVED_JOB_SLUGS.has(value), "That URL is reserved."),
    title: z.string().trim().min(1).max(200),
    focus: z.string().trim().min(1).max(120),
    commitment: z.enum(["full-time", "part-time", "project", "internship", "volunteer"]),
    mode: z.enum(["onsite", "remote", "hybrid"]),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    perks: z.array(z.string().trim().min(1).max(80)).max(8),
    status: z.enum(["draft", "published", "closed"]),
  }),
  content: z.array(blockSchema),
});
const saveJobSchema = jobSchema.extend({ sourceSlug: z.string().min(1).optional() });

const imageSchema = z.object({ image: z.string().startsWith("data:image/") });

// Every job media key is minted by the upload endpoint with a
// `job-<slug>-<uuid>.<ext>` shape. Anything else belongs to another
// namespace (article covers, CV uploads, arbitrary bucket objects).
const MEDIA_KEY_PATTERN =
  /^job-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@ApiTags("cms-jobs")
@Controller("cms/jobs")
export class CmsJobsController {
  constructor(
    private readonly jobs: CmsJobsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Open roles only. The listing never renders BlockNote body text, so the
  // feed carries everything except the document and stays payload-light.
  @Get()
  async all() {
    return { records: await this.jobs.all() };
  }

  @Get("admin")
  async allIncludingDrafts(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { records: await this.jobs.allIncludingDrafts() };
  }

  // The admin and media routes sit above ":slug" so the reserved paths can
  // never be shadowed by a job slug.
  @Get(":slug")
  async one(@Param("slug") slug: string) {
    return { record: await this.jobs.bySlug(slug) };
  }

  @Put(":slug")
  async save(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const document = saveJobSchema.parse(body);
    try {
      return await this.jobs.save(
        slug,
        document.job.slug,
        document as unknown as Prisma.InputJsonValue,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "CMS_JOB_SLUG_CONFLICT") {
        throw new ConflictException("That role URL is already in use.");
      }
      throw error;
    }
  }

  @Delete(":slug")
  async remove(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    await this.jobs.remove(slug);
    return { ok: true };
  }

  @Post(":slug/media")
  async uploadMedia(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const { image } = imageSchema.parse(body);
    const [meta, payload] = image.split(",", 2);
    const contentType = meta.match(/^data:(image\/(?:jpeg|png|webp));base64$/)?.[1];
    const buffer = Buffer.from(payload ?? "", "base64");
    if (!contentType || !buffer.length || buffer.length > 6 * 1024 * 1024) {
      throw new BadRequestException(
        "The image must be a PNG, JPEG, or WebP under 6 MB after compression.",
      );
    }
    const extension =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `job-${slug}-${randomUUID()}.${extension}`;
    try {
      await this.storage.uploadFile({ body: buffer, contentType, key });
    } catch {
      throw new BadRequestException(
        "Media storage is not configured in this environment, so images cannot be uploaded.",
      );
    }
    return { key };
  }

  // Job descriptions request many media redirects in a single burst, so the
  // global rate limit must not apply here. The key allowlist below keeps the
  // route safe without a request budget.
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

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
