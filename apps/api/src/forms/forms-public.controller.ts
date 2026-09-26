import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";

import { StorageService } from "../storage/storage.service.js";
import { FormsService } from "./forms.service.js";
import { FORM_MEDIA_KEY_PATTERN } from "./forms.utils.js";

/** What respondents reach: the form itself, its writes, and its design media. */
@ApiTags("forms")
@Controller("forms")
export class FormsPublicController {
  constructor(
    private readonly forms: FormsService,
    private readonly storage: StorageService,
  ) {}

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
    return response.redirect(url);
  }
}
