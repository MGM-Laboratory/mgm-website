import { timingSafeEqual } from "node:crypto";

import { Body, Controller, Get, Headers, Put, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { contactSettingsSchema } from "@repo/shared";

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

  @Get()
  async get() {
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

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
