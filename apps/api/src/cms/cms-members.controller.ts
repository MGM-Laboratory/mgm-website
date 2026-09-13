import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
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

const memberSchema = z.object({
  member: z.object({
    accent: z.enum(["blue", "yellow", "red", "green"]),
    bio: z.string(),
    division: z.string(),
    group: z.string(),
    hasPortrait: z.boolean(),
    labFocus: z.array(z.string()),
    name: z.string().min(1),
    nickname: z.string().optional(),
    role: z.string(),
    slug: z.string().min(1),
    unit: z.string().optional(),
  }),
  profile: z.record(z.string(), z.unknown()),
});
const bootstrapSchema = z.object({ records: z.array(memberSchema).min(1).max(200) });
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

  @Post("bootstrap")
  async bootstrap(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { records } = bootstrapSchema.parse(body);
    return {
      records: await this.members.bootstrap(
        records.map((record) => ({
          data: record as unknown as Prisma.InputJsonValue,
          slug: record.member.slug,
        })),
      ),
    };
  }

  @Get("media/:key")
  async media(@Param("key") key: string, @Res() response: Response) {
    const localFile = await this.storage.getLocalFile(key);
    if (localFile) {
      response.set({
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": localFile.contentType,
        "x-content-type-options": "nosniff",
      });
      return response.send(localFile.body);
    }
    if (this.storage.usesLocalMedia()) throw new NotFoundException("Portrait not found");
    const url = await this.storage.getSignedDownloadUrl(key, 60 * 15);
    return response.redirect(url);
  }

  @Put(":slug")
  async save(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const document = saveMemberSchema.parse(body);
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
    const key = `member-${slug}-${randomUUID()}.${extension}`;
    await this.storage.uploadFile({ body: buffer, contentType, key });
    return { key };
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
