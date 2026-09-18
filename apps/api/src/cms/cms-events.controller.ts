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
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { z } from "zod";

import type { Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.validation.js";
import { StorageService } from "../storage/storage.service.js";
import { CmsEventsService } from "./cms-events.service.js";
import { CmsEventRegistrationsService } from "./cms-event-registrations.service.js";
import { buildIcsFeed, buildSingleEventIcs, type IcsEventRecord } from "./cms-events.ics.js";

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

// Paths that belong to fixed routes on this controller; an event can never
// claim one as its own slug (mirrors RESERVED_JOB_SLUGS in cms-jobs.controller.ts).
const RESERVED_EVENT_SLUGS = new Set([
  "admin",
  "bootstrap",
  "calendar.ics",
  "media",
  "registrations",
  "resolve-maps-link",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// A UTC ISO instant ("Z"-suffixed) — the same instant a form's <input
// type="datetime-local"> value converts to before it reaches this API.
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{3})?Z$/;

// Site paths (a single leading slash, never protocol-relative) and http(s)
// URLs only; javascript:, data:, and every other scheme are refused.
const SAFE_URL_PATTERN = /^(\/(?!\/)|https?:\/\/)/i;

// BlockNote document validation. Unknown block fields must survive the parse
// so zod's default stripping does not silently rewrite saved documents.
const blockSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    props: z.record(z.string(), z.unknown()).optional(),
    content: z.unknown().optional(),
    children: z.array(z.unknown()).optional(),
  })
  .passthrough();

const speakerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  institution: z.string().trim().max(160).optional(),
  photoKey: z.string().optional(),
});

const rundownItemSchema = z.object({
  time: z.string().trim().max(60),
  item: z.string().trim().max(240),
});

const eventSchema = z
  .object({
    slug: z
      .string()
      .regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens.")
      .refine((value) => !RESERVED_EVENT_SLUGS.has(value), "That URL is reserved."),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional(),
    startAt: z.string().regex(DATETIME_PATTERN, "Use an ISO UTC datetime."),
    endAt: z.string().regex(DATETIME_PATTERN, "Use an ISO UTC datetime."),
    allDay: z.boolean(),
    // GMT offset in hours (e.g. 7 for WIB/Jakarta). Whole hours only, kept
    // simple deliberately — Indonesia's own three zones (WIB/WITA/WIT) are
    // all whole-hour offsets, and Intl's `timeZone` names don't accept an
    // arbitrary numeric offset, so display/conversion math is done by hand
    // against this number instead (see events-cms.ts).
    timezoneOffset: z.number().int().min(-12).max(14).default(7),
    location: z.string().trim().max(200).optional(),
    meetingLink: z
      .string()
      .trim()
      .max(500)
      .refine((value) => !value || SAFE_URL_PATTERN.test(value), "Use a URL or a site path.")
      .optional(),
    draft: z.boolean(),
    thumbnailKey: z.string().optional(),
    speakers: z.array(speakerSchema).max(20).default([]),
    organizer: z.string().trim().max(200).optional(),
    coordinator: z.string().trim().max(200).optional(),
    attendees: z.string().trim().max(1000).optional(),
    rundown: z.array(rundownItemSchema).max(50).default([]),
    mapsUrl: z
      .string()
      .trim()
      .max(500)
      .refine((value) => !value || SAFE_URL_PATTERN.test(value), "Use a URL or a site path.")
      .optional(),
    mapsLat: z.number().min(-90).max(90).optional(),
    mapsLng: z.number().min(-180).max(180).optional(),
    registrationEnabled: z.boolean().default(false),
    registrationCapacity: z.number().int().positive().max(100_000).optional(),
    content: z.array(blockSchema).default([]),
  })
  .refine(({ startAt, endAt }) => endAt >= startAt, {
    message: "The end time cannot be earlier than the start time.",
    path: ["endAt"],
  });

const bootstrapSchema = z.object({ records: z.array(eventSchema).min(1).max(500) });

const imageSchema = z.object({ image: z.string().startsWith("data:image/") });

const registerSchema = z.object({
  agreedToTerms: z.literal(true, "You must agree to the Terms of Service and Privacy Policy."),
  fullName: z.string().trim().min(2).max(200),
  email: z.email().max(254),
  phone: z.string().trim().min(5).max(30),
});

const registrationStateSchema = z
  .object({
    read: z.boolean().optional(),
    status: z.enum(["inbox", "archived"]).optional(),
  })
  .refine((value) => value.read !== undefined || value.status !== undefined, "Nothing to update");

const registrationBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["archive", "unarchive", "markRead", "markUnread", "delete"]),
});

const resolveMapsLinkSchema = z.object({ url: z.string().trim().min(1).max(2000) });

// Every event media key is minted by the upload endpoint with an
// `event-<slug>-<uuid>.<ext>` shape. Anything else belongs to another
// namespace.
const MEDIA_KEY_PATTERN =
  /^event-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;

// Matches "@lat,lng" (the standard Google Maps place/search URL marker) and
// the "!3d<lat>!4d<lng>" form some share links embed instead.
const AT_COORD_PATTERN = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const BANG_COORD_PATTERN = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const SHORT_LINK_PATTERN = /^https?:\/\/(goo\.gl\/maps|maps\.app\.goo\.gl)\//i;

function extractCoords(url: string): { lat: number; lng: number } | undefined {
  const bang = url.match(BANG_COORD_PATTERN);
  if (bang) return { lat: Number(bang[1]), lng: Number(bang[2]) };
  const at = url.match(AT_COORD_PATTERN);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  return undefined;
}

/**
 * Best-effort coordinate resolution from a pasted Google Maps link: try the
 * URL as given, then — for a shortened share link — follow redirects
 * server-side (the browser can't, cross-origin) and try again against the
 * final location.
 */
async function resolveMapsCoordinates(
  url: string,
): Promise<{ lat: number; lng: number } | undefined> {
  const direct = extractCoords(url);
  if (direct) return direct;
  if (!SHORT_LINK_PATTERN.test(url)) return undefined;

  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    let location: string | null;
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
      });
      location = response.headers.get("location");
    } catch {
      return undefined;
    }
    if (!location) {
      const fromCurrent = extractCoords(current);
      if (fromCurrent) return fromCurrent;
      return undefined;
    }
    current = new URL(location, current).toString();
    const found = extractCoords(current);
    if (found) return found;
  }
  return undefined;
}

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
    private readonly registrations: CmsEventRegistrationsService,
    private readonly storage: StorageService,
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

  // Every fixed path below sits above ":slug" so a reserved word can never be
  // shadowed by (or shadow) an event slug — see RESERVED_EVENT_SLUGS above.

  // Public: this is the URL calendar apps poll to subscribe to every event.
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

  // Public: a single event's .ics, for the detail page's "Add to calendar"
  // (Apple/other) download — never caches, since it must reflect the exact
  // event the visitor is looking at right now.
  @SkipThrottle()
  @Get(":slug/calendar.ics")
  async singleIcs(@Param("slug") slug: string, @Res() response: Response) {
    const record = (await this.events.bySlug(slug)) as unknown as IcsEventRecord;
    const body = buildSingleEventIcs(record);
    response.setHeader("Content-Type", "text/calendar; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${slug}.ics"`);
    response.send(body);
  }

  @Get("registrations")
  async registrationsInbox(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return { records: await this.registrations.all() };
  }

  @Put("registrations/:slug/state")
  async registrationState(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const patch = parseSafe(registrationStateSchema, body);
    return { record: await this.registrations.updateState(slug, patch) };
  }

  @Post("registrations/bulk")
  async registrationsBulk(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { ids, action } = parseSafe(registrationBulkSchema, body);
    await this.registrations.bulk(ids, action);
    return { ok: true };
  }

  @Post("resolve-maps-link")
  async resolveMapsLink(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const { url } = parseSafe(resolveMapsLinkSchema, body);
    const coords = await resolveMapsCoordinates(url);
    if (!coords) {
      throw new BadRequestException(
        "Could not read coordinates from that link. Enter latitude/longitude manually.",
      );
    }
    return coords;
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

  @Get(":slug")
  async one(@Param("slug") slug: string) {
    return { record: await this.events.bySlug(slug) };
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

  @Post(":slug/media")
  async uploadMedia(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const { image } = parseSafe(imageSchema, body);
    const [meta, payload] = image.split(",", 2);
    const contentType = meta.match(/^data:(image\/(?:jpeg|png|webp));base64$/)?.[1];
    const buffer = Buffer.from(payload ?? "", "base64");
    if (!contentType || !buffer.length || buffer.length > 6 * 1024 * 1024) {
      throw new BadRequestException(
        "The image must be a PNG, JPEG, or WebP under 6 MB after compression.",
      );
    }
    const extension =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `event-${slug}-${randomUUID()}.${extension}`;
    try {
      await this.storage.uploadFile({ body: buffer, contentType, key });
    } catch {
      throw new BadRequestException(
        "Media storage is not configured in this environment, so images cannot be uploaded.",
      );
    }
    return { key };
  }

  // Event pages request many media redirects in a single burst (thumbnail +
  // speaker photos), so the global rate limit must not apply here. The key
  // allowlist keeps the route safe without a request budget.
  @SkipThrottle()
  @Get("media/:key")
  async media(@Param("key") key: string, @Res() response: Response) {
    if (!MEDIA_KEY_PATTERN.test(key)) {
      throw new BadRequestException("Unknown media key");
    }
    let url: string;
    try {
      url = await this.storage.getSignedDownloadUrl(key, 60 * 15);
    } catch {
      throw new BadRequestException("Media storage is not configured in this environment.");
    }
    return response.redirect(url);
  }

  // The registration form buffers no file, but is still a public write
  // endpoint anyone can hit — a tight budget keeps it from being spammed.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(":slug/register")
  async register(@Param("slug") slug: string, @Body() body: unknown = {}) {
    let fields: z.infer<typeof registerSchema>;
    try {
      fields = registerSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues[0]?.message ?? "Invalid registration.");
      }
      throw error;
    }

    let event: Record<string, unknown>;
    try {
      event = await this.events.bySlug(slug);
    } catch {
      throw new BadRequestException("That event does not exist.");
    }
    if (event.registrationEnabled !== true) {
      throw new ConflictException("This event is not accepting registrations.");
    }
    if (typeof event.endAt === "string") {
      const boundary = new Date(event.endAt);
      // An all-day event's endAt is UTC midnight at the *start* of its last
      // (inclusive) day, so registration must stay open through that day.
      if (event.allDay === true) boundary.setUTCDate(boundary.getUTCDate() + 1);
      if (boundary < new Date()) {
        throw new ConflictException("This event has already ended.");
      }
    }

    await this.registrations.create({
      registration: {
        ...fields,
        eventSlug: slug,
        eventTitle: typeof event.title === "string" ? event.title : slug,
        read: false,
        readAt: null,
        status: "inbox",
      },
    } as unknown as Prisma.InputJsonValue);
    return { ok: true };
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }
}
