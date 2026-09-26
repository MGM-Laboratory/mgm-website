import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import { safeEqual } from "../cms/admin-auth.util.js";
import { parseVideoUploadBody } from "../cms/video-validation.util.js";
import type { Env } from "../config/env.validation.js";
import { StorageService } from "../storage/storage.service.js";
import { FormsError, runForms } from "./forms.common.js";
import {
  createFormSchema,
  mediaImageSchema,
  parseSafe,
  updateFormSchema,
} from "./forms.schemas.js";
import { FormsService } from "./forms.service.js";
import { formMediaKey, sniffImage } from "./forms.utils.js";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** The forms workspace's routes, behind the passphrase the Next proxy holds. */
@ApiTags("forms-admin")
@Controller("forms/admin")
export class FormsAdminController {
  constructor(
    private readonly forms: FormsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }

  @Get()
  async list(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { forms: await this.forms.list() };
  }

  @Post()
  async create(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const input = parseSafe(createFormSchema, body);
    return { form: await runForms(() => this.forms.create(input)) };
  }

  // Fixed paths sit above ":id" so they are never read as a form id.
  @Get("slug-available")
  async slugAvailable(
    @Query("slug") slug: unknown,
    @Query("excludeId") excludeId: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    return this.forms.slugAvailable(
      typeof slug === "string" ? slug.slice(0, 200) : "",
      typeof excludeId === "string" && excludeId ? excludeId : undefined,
    );
  }

  @Get(":id")
  async get(@Param("id") id: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { form: await runForms(() => this.forms.get(id)) };
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const input = parseSafe(updateFormSchema, body);
    return { form: await runForms(() => this.forms.update(id, input)) };
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    await runForms(() => this.forms.remove(id));
    return { ok: true };
  }

  @Post(":id/duplicate")
  async duplicate(@Param("id") id: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { form: await runForms(() => this.forms.duplicate(id)) };
  }

  /**
   * Design media: a data-URL image (PNG, JPEG, WebP or GIF by its bytes,
   * 6 MB decoded) or a raw MP4/WebM video streamed through the proxy.
   */
  @Post(":id/media")
  async uploadMedia(
    @Param("id") id: string,
    @Req() request: Request,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    return runForms(async () => {
      const form = await this.forms.require(id);
      const contentType = String(request.headers["content-type"] ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();

      let upload: { body: Buffer; contentType: string; extension: string };
      if (contentType.startsWith("video/")) {
        upload = parseVideoUploadBody(
          request,
          this.config.getOrThrow<number>("CMS_MAX_VIDEO_BYTES"),
        );
      } else {
        const { image } = parseSafe(mediaImageSchema, request.body);
        const comma = image.indexOf(",");
        const header = comma >= 0 ? image.slice(0, comma) : "";
        if (!/^data:image\/[a-z0-9.+-]+;base64$/i.test(header)) {
          throw new FormsError("The image must be a base64 data URL.", 400);
        }
        const buffer = Buffer.from(image.slice(comma + 1), "base64");
        const sniffed = sniffImage(buffer);
        if (!sniffed || buffer.length > MAX_IMAGE_BYTES) {
          throw new FormsError("The image must be a PNG, JPEG, WebP or GIF under 6 MB.", 400);
        }
        upload = { body: buffer, contentType: sniffed.type, extension: sniffed.extension };
      }

      const key = formMediaKey(form.id, upload.extension);
      try {
        await this.storage.uploadFile({ body: upload.body, contentType: upload.contentType, key });
      } catch {
        throw new FormsError(
          "Media storage is not configured in this environment, so files cannot be uploaded.",
          503,
        );
      }
      return { key };
    });
  }
}
