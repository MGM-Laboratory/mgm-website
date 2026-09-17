import { randomUUID, timingSafeEqual } from "node:crypto";

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
import { CmsHomeContentService } from "./cms-home-content.service.js";

// Every home video upload mints a `home-video-<uuid>.<ext>` key; anything
// else belongs to another namespace and is refused.
const VIDEO_KEY_PATTERN =
  /^home-video-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidVideo(buffer: Buffer, contentType: string) {
  // Buffer.isBuffer() at the call site already proves this isn't array-shaped;
  // CodeQL's request-parameter model doesn't know about main.ts's raw-body middleware.
  if (contentType === "video/mp4") {
    // codeql[js/type-confusion-through-parameter-tampering]
    return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
  }
  if (contentType === "video/webm") {
    return (
      // codeql[js/type-confusion-through-parameter-tampering]
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    );
  }
  return false;
}

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
    let url: string;
    try {
      url = await this.storage.getSignedDownloadUrl(key, 60 * 60);
    } catch {
      throw new BadRequestException("Media storage is not configured in this environment.");
    }
    return response.redirect(url);
  }

  // Raw video bytes; the global raw-body middleware (main.ts) enforces the
  // same size ceiling.
  @Post("video")
  async uploadVideo(@Req() request: Request, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const contentType = String(request.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    // CodeQL's type-confusion query only recognizes typeof/Array.isArray checks
    // as sanitizing barriers, not Buffer.isBuffer() below — this rejects the
    // array shape its model worries about before that real (sufficient) check.
    if (Array.isArray(request.body)) {
      throw new BadRequestException("The video must be an MP4 or WebM file.");
    }
    const body = Buffer.isBuffer(request.body) ? request.body : undefined;
    const maxBytes = this.config.getOrThrow<number>("CMS_MAX_VIDEO_BYTES");

    if ((contentType !== "video/mp4" && contentType !== "video/webm") || !body?.length) {
      throw new BadRequestException("The video must be an MP4 or WebM file.");
    }
    // body is a real Buffer here (guarded above), not an attacker-tamperable
    // array; see the isValidVideo() note.
    // codeql[js/type-confusion-through-parameter-tampering]
    if (body.length > maxBytes) {
      throw new BadRequestException(
        `The video must be under ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
      );
    }
    if (!isValidVideo(body, contentType)) {
      throw new BadRequestException("That file is not a valid video.");
    }

    const extension = contentType === "video/mp4" ? "mp4" : "webm";
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
