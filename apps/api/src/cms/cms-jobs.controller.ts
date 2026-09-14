import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CmsJobsService } from "./cms-jobs.service.js";

@ApiTags("cms-jobs")
@Controller("cms/jobs")
export class CmsJobsController {
  constructor(private readonly jobs: CmsJobsService) {}

  // Open roles only. The listing never renders BlockNote body text, so the
  // feed carries everything except the document and stays payload-light.
  @Get()
  async all() {
    return { records: await this.jobs.all() };
  }

  @Get(":slug")
  async one(@Param("slug") slug: string) {
    return { record: await this.jobs.bySlug(slug) };
  }
}
