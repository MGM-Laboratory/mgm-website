import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { z } from "zod";

import type { Env } from "../config/env.validation.js";
import { safeEqual } from "../cms/admin-auth.util.js";
import { ShortlinksService, ShortlinksError } from "./shortlinks.service.js";
import { EXPIRY_OPTIONS, SLUG_PATTERN } from "./shortlinks.utils.js";

function parseSafe<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpException(
      parsed.error.issues[0]
        ? `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`
        : "Invalid request",
      400,
    );
  }
  return parsed.data;
}

const longUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Use a full http(s) URL." },
  );

const optionalSlugSchema = z.preprocess(
  (value: unknown) => (value === "" ? undefined : value),
  z.string().regex(SLUG_PATTERN, "Use letters, numbers, hyphens and underscores only.").optional(),
);

const createLinkSchema = z.object({
  domainId: z.string().min(1),
  longUrl: longUrlSchema,
  slug: optionalSlugSchema,
  expiresIn: z.enum(EXPIRY_OPTIONS).default("never"),
  passphrase: z.string().min(1).max(200).optional(),
});

const updateLinkSchema = z.object({
  domainId: z.string().min(1).optional(),
  longUrl: longUrlSchema.optional(),
  slug: optionalSlugSchema,
  expiresIn: z.enum(EXPIRY_OPTIONS).optional(),
  passphraseAction: z.enum(["keep", "set", "remove"]).default("keep"),
  passphrase: z.string().min(1).max(200).optional(),
});

const addDomainSchema = z.object({
  hostname: z.string().trim().min(1).max(253),
});

const cloudflareSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

const verifySchema = z.object({
  slug: z.string().regex(SLUG_PATTERN),
  host: z.string().trim().min(1).max(253),
  passphrase: z.string().min(1).max(200),
});

type VisitMeta = { ip: string | null; userAgent: string | null; referer: string | null };

@ApiTags("shortlinks")
@Controller("shortlinks")
export class ShortlinksController {
  constructor(
    private readonly shortlinks: ShortlinksService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Service errors carry their own status; everything else stays a 500. */
  private async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ShortlinksError) {
        throw new HttpException(error.message, error.status);
      }
      throw error;
    }
  }

  private assertAdmin(value: string) {
    const configured = this.config.getOrThrow<string>("ADMIN_PASSPHRASE");
    if (!safeEqual(value, configured)) throw new UnauthorizedException("Unauthorized");
  }

  /**
   * The visitor's address and client, forwarded by the web app (which is the
   * API's only client for these routes), with the direct-request headers as
   * a fallback so a link hit straight on the API is still attributed.
   */
  private visitMeta(
    req: Request,
    forwardedIp: string | undefined,
    forwardedAgent: string | undefined,
    forwardedReferer: string | undefined,
  ): VisitMeta {
    const headers = req.headers;
    const firstForwarded = (value: string | undefined) =>
      value ? value.split(",")[0].trim() : null;
    const ip =
      firstForwarded(forwardedIp) ??
      firstForwarded(headers["cf-connecting-ip"] as string | undefined) ??
      firstForwarded(headers["x-forwarded-for"] as string | undefined) ??
      req.ip ??
      null;
    return {
      ip,
      userAgent: forwardedAgent ?? (headers["user-agent"] as string | undefined) ?? null,
      referer: forwardedReferer ?? (headers.referer as string | undefined) ?? null,
    };
  }

  // --- Public routes (the redirect path, visited on every click) ---

  /** Custom domains the web proxy should treat as short-link hosts. */
  @SkipThrottle()
  @Get("hosts")
  async hosts() {
    const hosts = await this.shortlinks.routingHosts();
    return { hosts };
  }

  @SkipThrottle()
  @Get("resolve")
  async resolve(
    @Query("slug") slug: string,
    @Query("host") host: string,
    @Req() req: Request,
    @Headers("x-visitor-ip") forwardedIp: string,
    @Headers("x-visitor-user-agent") forwardedAgent: string,
    @Headers("x-visitor-referer") forwardedReferer: string,
  ) {
    return this.shortlinks.resolve(
      host ?? "",
      slug ?? "",
      this.visitMeta(req, forwardedIp, forwardedAgent, forwardedReferer),
    );
  }

  @SkipThrottle()
  @Get("public/:slug")
  async publicLinkState(
    @Param("slug") slug: string,
    @Query("host") host: string,
    @Req() req: Request,
    @Headers("x-visitor-ip") forwardedIp: string,
    @Headers("x-visitor-user-agent") forwardedAgent: string,
    @Headers("x-visitor-referer") forwardedReferer: string,
  ) {
    return this.shortlinks.publicLinkState(
      host ?? "",
      slug,
      this.visitMeta(req, forwardedIp, forwardedAgent, forwardedReferer),
    );
  }

  @Post("verify")
  async verify(
    @Body() body: unknown,
    @Req() req: Request,
    @Headers("x-visitor-ip") forwardedIp: string,
    @Headers("x-visitor-user-agent") forwardedAgent: string,
    @Headers("x-visitor-referer") forwardedReferer: string,
  ) {
    const input = parseSafe(verifySchema, body);
    const result = await this.shortlinks.verify(
      input.host,
      input.slug,
      input.passphrase,
      this.visitMeta(req, forwardedIp, forwardedAgent, forwardedReferer),
    );
    if (!result) throw new HttpException("That link does not exist.", 404);
    if (result.expired) throw new HttpException("That link has expired.", 410);
    if (result.rejected) {
      throw new UnauthorizedException("That passphrase is not right.");
    }
    return { longUrl: result.longUrl };
  }

  // --- Admin routes (behind the passphrase the Next proxy holds) ---

  @Get("admin/domains")
  async adminDomains(@Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    return {
      domains: await this.shortlinks.listDomains(),
      cnameTarget: this.config.getOrThrow("SHORTLINKS_CNAME_TARGET"),
    };
  }

  @Post("admin/domains")
  async adminCreateDomain(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const input = parseSafe(addDomainSchema, body);
    return this.run(() => this.shortlinks.createDomain(input.hostname));
  }

  @Get("admin/domains/:id")
  async adminDomainStatus(@Param("id") id: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const result = await this.shortlinks.refreshDomain(id);
    if (!result) throw new HttpException("That domain does not exist.", 404);
    return result;
  }

  @Post("admin/domains/:id/cloudflare")
  async adminAutoconfigureCloudflare(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const input = parseSafe(cloudflareSchema, body);
    const result = await this.run(() => this.shortlinks.autoconfigureCloudflare(id, input.token));
    if (!result) throw new HttpException("That domain does not exist.", 404);
    return result;
  }

  @Delete("admin/domains/:id")
  async adminDeleteDomain(@Param("id") id: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const deleted = await this.run(() => this.shortlinks.deleteDomain(id));
    if (!deleted) throw new HttpException("That domain does not exist.", 404);
    return { ok: true };
  }

  @Get("admin/links")
  async adminLinks(
    @Query("search") search: string,
    @Query("domainId") domainId: string,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    // A duplicated query parameter can arrive as an array; only strings get
    // sliced and searched.
    const searchText = typeof search === "string" ? search.slice(0, 200) : undefined;
    const domainFilter = typeof domainId === "string" ? domainId : undefined;
    return {
      links: await this.shortlinks.listLinks(searchText, domainFilter),
    };
  }

  @Post("admin/links")
  async adminCreateLink(@Body() body: unknown, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const input = parseSafe(createLinkSchema, body);
    return { link: await this.run(() => this.shortlinks.createLink(input)) };
  }

  @Put("admin/links/:id")
  async adminUpdateLink(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("x-cms-passphrase") passphrase = "",
  ) {
    this.assertAdmin(passphrase);
    const input = parseSafe(updateLinkSchema, body);
    const link = await this.run(() => this.shortlinks.updateLink(id, input));
    if (!link) throw new HttpException("That link does not exist.", 404);
    return { link };
  }

  @Delete("admin/links/:id")
  async adminDeleteLink(@Param("id") id: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    await this.shortlinks.deleteLink(id);
    return { ok: true };
  }

  @Get("admin/links/:id/analytics")
  async adminLinkAnalytics(@Param("id") id: string, @Headers("x-cms-passphrase") passphrase = "") {
    this.assertAdmin(passphrase);
    const analytics = await this.shortlinks.linkAnalytics(id);
    if (!analytics) throw new HttpException("That link does not exist.", 404);
    return analytics;
  }
}
