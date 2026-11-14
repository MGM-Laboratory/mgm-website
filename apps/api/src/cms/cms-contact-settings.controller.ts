import { timingSafeEqual } from "node:crypto";

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Put,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { contactDetailsSchema, contactSettingsSchema } from "@repo/shared";

import type { Env } from "../config/env.validation.js";
import { MailService } from "../mail/mail.service.js";
import { CmsContactSettingsService } from "./cms-contact-settings.service.js";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@ApiTags("cms-contact-settings")
@Controller("cms/contact-settings")
export class CmsContactSettingsController {
  constructor(
    private readonly settings: CmsContactSettingsService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Admin-only. The record holds the inbox addresses and the mail routing. The contact page and the studio both
  // read it through the web server, which sends the passphrase on every call.
  @Get()
  async get(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { record: await this.settings.get() };
  }

  // Admin-only: configured-booleans and live remaining counts, never the
  // underlying credentials. Limits are read from the saved settings record
  // so the counts reflect whatever's currently configured, not a payload
  // the caller could spoof.
  @Get("mail-provider-status")
  async status(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const settings = await this.settings.get();
    return this.mail.getStatus(settings.mailProviderLimits);
  }

  @Put()
  async save(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const data = contactSettingsSchema.parse(body);
    return { record: await this.settings.save(data) };
  }

  // The contact details only. The mail routing stays as it is stored, so a save
  // from an editor that holds an older copy of the routing cannot write it back.
  @Patch()
  async saveDetails(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const parsed = contactDetailsSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues.at(0);
      throw new BadRequestException(
        issue ? `${issue.path.join(".")}: ${issue.message}`.replace(/^: /, "") : "Invalid request",
      );
    }
    const details = parsed.data;
    return { record: await this.settings.saveDetails(details) };
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
