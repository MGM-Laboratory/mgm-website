import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { StorageService } from "../storage/storage.service.js";
import { runForms, visitMeta, visitorTracker } from "./forms.common.js";
import { FormsPublicService } from "./forms-public.service.js";
import {
  eventSchema,
  parseSafe,
  submissionSchema,
  unlockSchema,
  uploadQuerySchema,
} from "./forms.schemas.js";
import { FormsService } from "./forms.service.js";
import { FORM_MEDIA_KEY_PATTERN } from "./forms.utils.js";

const MINUTE = 60_000;

/** A per-route budget keyed by the respondent (see `visitorTracker`), not the web server. */
function perVisitor(limit: number) {
  return Throttle({ default: { limit, ttl: MINUTE, getTracker: visitorTracker } });
}

function headerValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** What respondents reach: the form itself, its writes, and its design media. */
@ApiTags("forms")
@Controller("forms")
export class FormsPublicController {
  constructor(
    private readonly forms: FormsService,
    private readonly publicForms: FormsPublicService,
    private readonly storage: StorageService,
  ) {}

  // Read on every page render by the web server, so no per-IP budget (the
  // IP would be the web server's own).
  @SkipThrottle()
  @Get("public/:slug")
  async publicForm(@Param("slug") slug: string, @Headers("x-form-token") token?: string) {
    return runForms(() => this.publicForms.publicForm(slug, headerValue(token)));
  }

  @perVisitor(10)
  @Post("public/:slug/unlock")
  @HttpCode(200)
  async unlock(@Param("slug") slug: string, @Body() body: unknown) {
    const { passphrase } = parseSafe(unlockSchema, body);
    return runForms(() => this.publicForms.unlock(slug, passphrase));
  }

  @perVisitor(120)
  @Post("public/:slug/events")
  @HttpCode(200)
  async event(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Headers("x-form-token") token?: string,
  ) {
    const input = parseSafe(eventSchema, body);
    return runForms(() =>
      this.publicForms.recordEvent(slug, input, visitMeta(req), headerValue(token)),
    );
  }

  // The body is the raw file (main.ts registers a route-scoped raw parser).
  @perVisitor(30)
  @Post("public/:slug/uploads")
  async upload(
    @Param("slug") slug: string,
    @Query() query: unknown,
    @Req() req: Request,
    @Headers("x-form-token") token?: string,
  ) {
    const input = parseSafe(uploadQuerySchema, query);
    return runForms(() =>
      this.publicForms.upload(
        slug,
        input,
        {
          body: req.body as unknown,
          contentType: String(req.headers["content-type"] ?? ""),
          fileName: headerValue(req.headers["x-file-name"]),
        },
        headerValue(token),
      ),
    );
  }

  @perVisitor(10)
  @Post("public/:slug/responses")
  async submit(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Headers("x-form-token") token?: string,
  ) {
    const input = parseSafe(submissionSchema, body);
    return runForms(() => this.publicForms.submit(slug, input, visitMeta(req), headerValue(token)));
  }

  // A form page requests its cover, background and question media in one
  // burst, so the global rate limit must not apply; the key allowlist and
  // the owning-form check keep the route narrow.
  @SkipThrottle()
  @Get("media/:key")
  async media(@Param("key") key: string, @Res() response: Response) {
    if (!FORM_MEDIA_KEY_PATTERN.test(key) || !(await this.forms.mediaServable(key))) {
      throw new NotFoundException("Unknown media key");
    }
    let url: string;
    try {
      url = await this.storage.getSignedDownloadUrl(key, 60 * 15);
    } catch {
      throw new NotFoundException("Media storage is not configured in this environment.");
    }
    response.redirect(url);
  }
}
