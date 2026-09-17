import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Body,
  Controller,
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
import type { Request, Response } from "express";
import { homeContentSchema } from "@repo/shared";

import type { Env } from "../config/env.validation.js";
import { StorageService } from "../storage/storage.service.js";
import { safeEqual } from "./admin-auth.util.js";
import { CmsHomeContentService } from "./cms-home-content.service.js";
import { parseVideoUploadBody, redirectToSignedVideoUrl } from "./video-validation.util.js";

// Every home video upload mints a `home-video-<uuid>.<ext>` key; anything
// else belongs to another namespace and is refused.
const VIDEO_KEY_PATTERN =
  /^home-video-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/;

@ApiTags("cms-home-content")
@Controller("cms/home")
export class CmsHomeContentController {
  constructor(
    private readonly home: CmsHomeContentService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async get() {
    return { record: await this.home.get() };
  }

  @Put()
  async save(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const data = homeContentSchema.parse(body);
    return { record: await this.home.save(data) };
  }

  @SkipThrottle()
  @Get("video/:key")
  async video(@Param("key") key: string, @Res() response: Response) {
    if (!VIDEO_KEY_PATTERN.test(key)) {
      throw new BadRequestException("Unknown video key");
    }
    if (!(await this.home.videoKeyMatches(key))) {
      throw new BadRequestException("Video not found");
    }
    await redirectToSignedVideoUrl(response, this.storage, key);
  }

  // Raw video bytes; the global raw-body middleware (main.ts) enforces the
  // same size ceiling.
  @Post("video")
  async uploadVideo(@Req() request: Request, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const maxBytes = this.config.getOrThrow<number>("CMS_MAX_VIDEO_BYTES");
    const { body, contentType, extension } = parseVideoUploadBody(request, maxBytes);

    const key = `home-video-${randomUUID()}.${extension}`;
    try {
      await this.storage.uploadFile({ body, contentType, key });
    } catch {
      throw new BadRequestException(
        "Video storage is not configured in this environment, so the video cannot be uploaded.",
      );
    }
    return { key, size: body.length };
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
