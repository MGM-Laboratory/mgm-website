import { timingSafeEqual } from "node:crypto";

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import type { Env } from "../config/env.validation.js";
import { CmsContactInquiriesService } from "./cms-contact-inquiries.service.js";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

const stateSchema = z
  .object({
    read: z.boolean().optional(),
    status: z.enum(["inbox", "archived"]).optional(),
  })
  .refine((value) => value.read !== undefined || value.status !== undefined, "Nothing to update");

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["archive", "unarchive", "markRead", "markUnread", "delete"]),
});

function parseSafe<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
  }
  return parsed.data;
}

@ApiTags("cms-contact-inquiries")
@Controller("cms/contact-inquiries")
export class CmsContactInquiriesController {
  constructor(
    private readonly inquiries: CmsContactInquiriesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async all(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { records: await this.inquiries.all() };
  }

  @Put(":slug/state")
  async state(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const patch = parseSafe(stateSchema, body);
    return { record: await this.inquiries.updateState(slug, patch) };
  }

  @Post("bulk")
  async bulk(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { ids, action } = parseSafe(bulkSchema, body);
    await this.inquiries.bulk(ids, action);
    return { ok: true };
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
