import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";

import { safeEqual } from "../cms/admin-auth.util.js";
import { parseVideoUploadBody } from "../cms/video-validation.util.js";
import type { Env } from "../config/env.validation.js";
import { StorageService } from "../storage/storage.service.js";
import { FormsError, runForms } from "./forms.common.js";
import { FormsResponsesService } from "./forms-responses.service.js";
import {
  applySchema,
  bulkSchema,
  createFormSchema,
  mediaImageSchema,
  parseSafe,
  responsePatchSchema,
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
    private readonly responses: FormsResponsesService,
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

  // --- Responses ---

  @Get(":id/responses")
  async listResponses(@Param("id") id: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { responses: await runForms(() => this.responses.list(id)) };
  }

  // Fixed response paths sit above ":responseId".
  @Post(":id/responses/bulk")
  @HttpCode(200)
  async bulk(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const input = parseSafe(bulkSchema, body);
    return runForms(() => this.responses.bulk(id, input));
  }

  @Post(":id/responses/apply")
  @HttpCode(200)
  async apply(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const input = parseSafe(applySchema, body);
    return runForms(() => this.responses.apply(id, input));
  }

  @Patch(":id/responses/:responseId")
  async patchResponse(
    @Param("id") id: string,
    @Param("responseId") responseId: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const patch = parseSafe(responsePatchSchema, body);
    return { response: await runForms(() => this.responses.patch(id, responseId, patch)) };
  }

  /**
   * A respondent's upload: its signed URL and metadata, or with
   * `?download=1` the bytes themselves as an attachment (the web app relays
   * them so the admin can zip files same-origin).
   */
  @Get(":id/files/:key")
  async file(
    @Param("id") id: string,
    @Param("key") key: string,
    @Query("download") download: unknown,
    @Res() response: Response,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    if (download !== "1") {
      response.json(await runForms(() => this.responses.fileLink(id, key)));
      return;
    }
    const file = await runForms(() =>
      this.responses.fileBytes(id, key, this.config.getOrThrow<number>("FORMS_MAX_UPLOAD_BYTES")),
    );
    response.setHeader("Content-Type", file.type);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(file.body);
  }
}
