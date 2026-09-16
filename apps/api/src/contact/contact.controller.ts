import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  CONTACT_ATTACHMENT_KEY_PATTERN,
  CONTACT_MAX_ATTACHMENT_BYTES,
  contactFormSchema,
} from "@repo/shared";
import type { Request, Response } from "express";

import { StorageService } from "../storage/storage.service.js";
import { ContactService } from "./contact.service.js";

function slugifyFilename(filename: string) {
  const base = filename.replace(/\.[^./]+$/, "");
  return base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-{1,64}/, "")
    .replace(/-{1,64}$/, "")
    .slice(0, 60);
}

function extensionOf(filename: string) {
  const match = /\.([a-z0-9]{1,10})$/i.exec(filename);
  return match ? `.${match[1].toLowerCase()}` : "";
}

@ApiTags("contact")
@Controller("contact")
export class ContactController {
  constructor(
    private readonly contact: ContactService,
    private readonly storage: StorageService,
  ) {}

  // Attachments arrive as raw bytes of whatever type the browser reports —
  // the raw body parser for this exact path is registered in main.ts.
  @Post("attachments")
  async uploadAttachment(@Req() request: Request, @Headers("x-filename") rawFilename = "") {
    // CodeQL's type-confusion query only recognizes typeof/Array.isArray checks
    // as sanitizing barriers, not Buffer.isBuffer() below — this rejects the
    // array shape its model worries about before that real (sufficient) check.
    if (Array.isArray(request.body)) {
      throw new BadRequestException("No file received.");
    }
    const body = Buffer.isBuffer(request.body) ? request.body : undefined;
    if (!body?.length) {
      throw new BadRequestException("No file received.");
    }
    // body is a real Buffer here (guarded above via Buffer.isBuffer()), fed by
    // main.ts's route-scoped raw-body middleware, not an attacker-tamperable
    // array from query/body parameter duplication.
    // codeql[js/type-confusion-through-parameter-tampering]
    if (body.length > CONTACT_MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException(
        `Attachments must be under ${Math.floor(CONTACT_MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`,
      );
    }

    let filename = rawFilename;
    try {
      filename = decodeURIComponent(rawFilename);
    } catch {
      // Malformed percent-encoding — fall back to the raw header value.
    }
    const slug = slugifyFilename(filename);
    const ext = extensionOf(filename);
    const slugSuffix = slug ? `-${slug}` : "";
    const key = `contact-${randomUUID()}${slugSuffix}${ext}`;
    const contentType = String(request.headers["content-type"] ?? "application/octet-stream")
      .split(";")[0]
      .trim();

    try {
      await this.storage.uploadFile({ body, contentType, key });
    } catch {
      throw new BadRequestException(
        "Attachment storage is not configured in this environment, so files cannot be uploaded.",
      );
    }
    // codeql[js/type-confusion-through-parameter-tampering]
    return { key, size: body.length };
  }

  @Get("attachments/:key")
  async attachment(@Param("key") key: string, @Res() response: Response) {
    if (!CONTACT_ATTACHMENT_KEY_PATTERN.test(key)) {
      throw new BadRequestException("Unknown attachment key");
    }
    const localFile = await this.storage.getLocalFile(key);
    if (localFile) {
      response.set({
        "cache-control": "private, max-age=0",
        "content-type": localFile.contentType,
        "x-content-type-options": "nosniff",
      });
      return response.send(localFile.body);
    }
    if (this.storage.usesLocalMedia()) throw new BadRequestException("Attachment not found");
    const url = await this.storage.getSignedDownloadUrl(key, 60 * 15);
    return response.redirect(url);
  }

  @Post()
  async submit(@Req() request: Request) {
    const parsed = contactFormSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    await this.contact.send(parsed.data);
    return { ok: true };
  }
}
