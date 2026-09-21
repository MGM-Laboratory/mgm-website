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
import { CmsArticlesService } from "./cms-articles.service.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const blockSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    props: z.record(z.string(), z.unknown()).optional(),
    content: z.unknown().optional(),
    children: z.array(z.unknown()).optional(),
  })
  .passthrough();

const articleSchema = z.object({
  article: z.object({
    slug: z.string().regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens."),
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().trim().max(300).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    categories: z.array(z.string().trim().min(1)).max(6),
    authorSlugs: z.array(z.string().min(1)).min(1),
    draft: z.boolean(),
    coverKey: z.string().min(1).max(500).optional(),
  }),
  content: z.array(blockSchema),
});
const bootstrapSchema = z.object({ records: z.array(articleSchema).min(1).max(500) });
const saveArticleSchema = articleSchema.extend({ sourceSlug: z.string().min(1).optional() });

const imageSchema = z.object({ image: z.string().startsWith("data:image/") });

// Every article media key is minted by the cover upload endpoint with an
// `article-<slug>-<uuid>.<ext>` shape. Anything else belongs to another
// namespace (member portraits, arbitrary bucket objects) and is refused.
const MEDIA_KEY_PATTERN =
  /^article-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@ApiTags("cms-articles")
@Controller("cms/articles")
export class CmsArticlesController {
  constructor(
    private readonly articles: CmsArticlesService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async all() {
    // Drafts are filtered server-side; this route feeds the public site.
    return { records: await this.articles.all() };
  }

  @Get("admin")
  async allIncludingDrafts(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { records: await this.articles.allIncludingDrafts() };
  }

  // The light feed and the single-record routes sit above ":slug" so the
  // reserved paths admin / feed / media can never be shadowed by a slug.
  @Get("feed")
  async feed() {
    return { records: await this.articles.feed() };
  }

  @Get(":slug")
  async one(@Param("slug") slug: string) {
    return { record: await this.articles.bySlug(slug) };
  }

  @Post("bootstrap")
  async bootstrap(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { records } = bootstrapSchema.parse(body);
    return {
      records: await this.articles.bootstrap(
        records.map((record) => ({
          data: record as unknown as Prisma.InputJsonValue,
          slug: record.article.slug,
        })),
      ),
    };
  }

  // Article pages request hundreds of media redirects in a single burst, so
  // the global rate limit must not apply here. The key allowlist below keeps
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
    const document = saveArticleSchema.parse(body);
    try {
      return await this.articles.save(
        slug,
        document.article.slug,
        document as unknown as Prisma.InputJsonValue,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "CMS_ARTICLE_SLUG_CONFLICT") {
        throw new ConflictException("That article URL is already in use.");
      }
      throw error;
    }
  }

  @Delete(":slug")
  async remove(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    await this.articles.remove(slug);
    return { ok: true };
  }

  @Post(":slug/cover")
  async uploadCover(
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
        "The cover must be a PNG, JPEG, or WebP image under 6 MB after compression.",
      );
    }
    const extension =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `article-${slug}-${randomUUID()}.${extension}`;
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
