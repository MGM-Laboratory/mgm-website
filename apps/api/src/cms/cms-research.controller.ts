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
import { CmsResearchService } from "./cms-research.service.js";

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

const milestoneSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(DATE_PATTERN, "Use a YYYY-MM-DD date."),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(600),
  relatedUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => !value || SAFE_URL_PATTERN.test(value), "Use a URL or a site path.")
    .optional(),
  relatedLabel: z.string().trim().max(120).optional(),
});

const outputSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["project", "publication", "article"]),
  label: z.string().trim().min(1).max(200),
  href: z.string().trim().min(1).max(500).regex(SAFE_URL_PATTERN, "Use a URL or a site path."),
  recordSlug: z.string().regex(SLUG_PATTERN).optional(),
});

const partnerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => !value || SAFE_URL_PATTERN.test(value), "Use a URL or a site path.")
    .optional(),
});

const researchSchema = z
  .object({
    slug: z.string().regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens."),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    question: z.string().trim().min(1).max(500),
    context: z.string().trim().max(2000).optional(),
    contribution: z.string().trim().max(2000).optional(),
    areas: z
      .array(z.enum(["website", "mobile", "hci-ux", "game-xr"]))
      .min(1)
      .max(4),
    status: z.enum(["exploring", "active", "completed"]),
    startDate: z.string().regex(DATE_PATTERN).optional(),
    endDate: z.string().regex(DATE_PATTERN).optional(),
    featured: z.boolean(),
    draft: z.boolean(),
    methods: z.array(z.string().trim().min(1).max(80)).max(12),
    memberSlugs: z.array(z.string().regex(SLUG_PATTERN)).max(60),
    coverKey: z.string().min(1).max(500).optional(),
    coverAlt: z.string().trim().max(300).optional(),
    milestones: z.array(milestoneSchema).max(50),
    outputs: z.array(outputSchema).max(100),
    partners: z.array(partnerSchema).max(10).optional(),
    seoTitle: z.string().trim().max(120).optional(),
    seoDescription: z.string().trim().max(300).optional(),
  })
  .refine(
    ({ startDate, endDate }) => !startDate || !endDate || endDate >= startDate,
    "The end date cannot be earlier than the start date.",
  );

const researchRecordSchema = z.object({
  research: researchSchema,
  body: z.array(blockSchema),
});
const bootstrapSchema = z.object({ records: z.array(researchRecordSchema).min(1).max(500) });
const saveResearchSchema = researchRecordSchema.extend({
  sourceSlug: z.string().min(1).optional(),
});

const imageSchema = z.object({ image: z.string().startsWith("data:image/") });

// Every research media key is minted by the cover upload endpoint with a
// `research-<slug>-<uuid>.<ext>` shape. Anything else belongs to another
// namespace (article covers, member portraits, arbitrary bucket objects)
// and is refused.
const MEDIA_KEY_PATTERN =
  /^research-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@ApiTags("cms-research")
@Controller("cms/research")
export class CmsResearchController {
  constructor(
    private readonly research: CmsResearchService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async all() {
    // Drafts are filtered server-side; this route feeds the public site.
    return { records: await this.research.all() };
  }

  @Get("admin")
  async allIncludingDrafts(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { records: await this.research.allIncludingDrafts() };
  }

  // The light feed and the media route sit above ":slug" so reserved paths
  // can never be shadowed by a record slug.
  @Get("feed")
  async feed() {
    return { records: await this.research.feed() };
  }

  @Get(":slug")
  async one(@Param("slug") slug: string) {
    return { record: await this.research.bySlug(slug) };
  }

  @Post("bootstrap")
  async bootstrap(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { records } = parseSafe(bootstrapSchema, body);
    return {
      records: await this.research.bootstrap(
        records.map((record) => ({
          data: record as unknown as Prisma.InputJsonValue,
          slug: record.research.slug,
        })),
      ),
    };
  }

  // Research pages request cover redirects like article pages do, so the
  // global rate limit must not apply here. The key allowlist below keeps
  // the route safe without a request budget.
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

  @Put(":slug")
  async save(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const document = parseSafe(saveResearchSchema, body);
    try {
      return await this.research.save(
        slug,
        document.research.slug,
        document as unknown as Prisma.InputJsonValue,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "CMS_RESEARCH_SLUG_CONFLICT") {
        throw new ConflictException("That research URL is already in use.");
      }
      throw error;
    }
  }

  @Delete(":slug")
  async remove(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    await this.research.remove(slug);
    return { ok: true };
  }

  @Post(":slug/cover")
  async uploadCover(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const { image } = parseSafe(imageSchema, body);
    const [meta, payload] = image.split(",", 2);
    const contentType = meta.match(/^data:(image\/(?:jpeg|png|webp));base64$/)?.[1];
    const buffer = Buffer.from(payload ?? "", "base64");
    if (!contentType || !buffer.length || buffer.length > 6 * 1024 * 1024) {
      throw new BadRequestException(
        "The cover must be a PNG, JPEG, or WebP image under 6 MB after compression.",
      );
    }
    const extension =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `research-${slug}-${randomUUID()}.${extension}`;
    try {
      await this.storage.uploadFile({ body: buffer, contentType, key });
    } catch {
      throw new BadRequestException(
        "Media storage is not configured in this environment, so covers cannot be uploaded.",
      );
    }
    return { key };
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
