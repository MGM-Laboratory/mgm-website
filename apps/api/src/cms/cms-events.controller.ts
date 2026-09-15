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
import { SkipThrottle } from "@nestjs/throttler";
import { timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.validation.js";
import { CmsEventsService } from "./cms-events.service.js";
import { buildIcsFeed, type IcsEventRecord } from "./cms-events.ics.js";

/**
 * Zod failures become readable 400s instead of opaque 500s: the editor
 * surfaces the first issue directly next to the field it came from.
 */
function parseSafe<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues[0]
        ? `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`
        : "Invalid request",
    );
  }
  return parsed.data;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// A UTC ISO instant ("Z"-suffixed) — the same instant a form's <input
// type="datetime-local"> value converts to before it reaches this API.
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{3})?Z$/;

// Site paths (a single leading slash, never protocol-relative) and http(s)
// URLs only; javascript:, data:, and every other scheme are refused.
const SAFE_URL_PATTERN = /^(\/(?!\/)|https?:\/\/)/i;

// The color palette is closed to the site's four brand tokens
// (DESIGN_SYSTEM.md §2) — no ad-hoc category colors.
export const EVENT_COLORS = ["blue", "yellow", "red", "green"] as const;

const eventSchema = z
  .object({
    slug: z.string().regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens."),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional(),
    startAt: z.string().regex(DATETIME_PATTERN, "Use an ISO UTC datetime."),
    endAt: z.string().regex(DATETIME_PATTERN, "Use an ISO UTC datetime."),
    allDay: z.boolean(),
    location: z.string().trim().max(200).optional(),
    meetingLink: z
      .string()
      .trim()
      .max(500)
      .refine((value) => !value || SAFE_URL_PATTERN.test(value), "Use a URL or a site path.")
      .optional(),
    color: z.enum(EVENT_COLORS),
    draft: z.boolean(),
  })
  .refine(({ startAt, endAt }) => endAt >= startAt, {
    message: "The end time cannot be earlier than the start time.",
    path: ["endAt"],
  });

const bootstrapSchema = z.object({ records: z.array(eventSchema).min(1).max(500) });

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@ApiTags("cms-events")
@Controller("cms/events")
export class CmsEventsController {
  constructor(
    private readonly events: CmsEventsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async all() {
    // Drafts are filtered server-side; this route feeds the public site.
    return { records: await this.events.all() };
  }

  @Get("admin")
  async allIncludingDrafts(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { records: await this.events.allIncludingDrafts() };
  }

  // Reserved path — must sit above ":slug" or "calendar.ics" would be
  // swallowed as a record slug. Public: this is the URL calendar apps poll.
  @SkipThrottle()
  @Get("calendar.ics")
  async ics(@Res() response: Response) {
    const records = (await this.events.all()) as unknown as IcsEventRecord[];
    const body = buildIcsFeed(records);
    response.setHeader("Content-Type", "text/calendar; charset=utf-8");
    response.setHeader("Content-Disposition", 'inline; filename="mgm-events.ics"');
    response.setHeader("Cache-Control", "public, max-age=900");
    response.send(body);
  }

  @Get(":slug")
  async one(@Param("slug") slug: string) {
    return { record: await this.events.bySlug(slug) };
  }

  @Post("bootstrap")
  async bootstrap(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { records } = parseSafe(bootstrapSchema, body);
    return {
      records: await this.events.bootstrap(
        records.map((record) => ({
          data: record as unknown as Prisma.InputJsonValue,
          slug: record.slug,
        })),
      ),
    };
  }

  @Put(":slug")
  async save(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const document = parseSafe(eventSchema, body);
    try {
      return await this.events.save(
        slug,
        document.slug,
        document as unknown as Prisma.InputJsonValue,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "CMS_EVENT_SLUG_CONFLICT") {
        throw new ConflictException("That event URL is already in use.");
      }
      throw error;
    }
  }

  @Delete(":slug")
  async remove(@Param("slug") slug: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    await this.events.remove(slug);
    return { ok: true };
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
