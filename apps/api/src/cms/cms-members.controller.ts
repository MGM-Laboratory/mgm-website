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
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.validation.js";
import { StorageService } from "../storage/storage.service.js";
import { CmsMembersService } from "./cms-members.service.js";
import { MEMBER_MEDIA_KEY_PATTERN } from "./member-media-key.js";
import { memberProfileSchema } from "./member-profile.schema.js";

const memberSchema = z.object({
  member: z.object({
    accent: z.enum(["blue", "yellow", "red", "green"]),
    bio: z.string(),
    division: z.string(),
    group: z.string(),
    hasPortrait: z.boolean(),
    highlighted: z.boolean().default(false),
    labFocus: z.array(z.string()),
    name: z.string().min(1),
    nickname: z.string().optional(),
    role: z.string(),
    slug: z.string().min(1),
    unit: z.string().optional(),
  }),
  profile: memberProfileSchema,
});

const saveMemberSchema = memberSchema.extend({ sourceSlug: z.string().min(1).optional() });

const imageSchema = z.object({ image: z.string().startsWith("data:image/") });

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@ApiTags("cms-members")
@Controller("cms/members")
export class CmsMembersController {
  constructor(
    private readonly members: CmsMembersService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async all() {
    return { records: await this.members.all() };
  }

  @Get("media/:key")
  async media(@Param("key") key: string, @Res() response: Response) {
    // Only a portrait key is signed here. Any other key belongs to another namespace, such as a CV or an attachment.
    if (!MEMBER_MEDIA_KEY_PATTERN.test(key)) {
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
    // A link with an unsafe scheme is a mistake of the editor, so it answers 400 with the reason and not a server error
    const parsed = saveMemberSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      throw new BadRequestException(
        issue ? `${where}${issue.message}` : "The member is not valid.",
      );
    }
    const document = parsed.data;
    try {
      return await this.members.save(
        slug,
        document.member.slug,
        document as unknown as Prisma.InputJsonValue,
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "CMS_MEMBER_SLUG_CONFLICT") {
          throw new ConflictException("That profile URL is already in use.");
        }
        if (error.message === "CMS_MEMBER_AMBIGUOUS_RENAME") {
          throw new ConflictException(
            "More than one existing profile has this name. Please contact an administrator.",
          );
        }
      }
      throw error;
    }
  }

  @Delete(":slug")
  async remove(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    await this.members.remove(slug);
    return { ok: true };
  }

  @Post(":slug/photo")
  async uploadPhoto(
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
        "The portrait must be a PNG, JPEG, or WebP image under 6 MB after compression.",
      );
    }
    const extension =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `member-${slug.replace(/[^A-Za-z0-9_-]/g, "-")}-${randomUUID()}.${extension}`;
    await this.storage.uploadFile({ body: buffer, contentType, key });
    return { key };
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
