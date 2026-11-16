// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import "reflect-metadata";

import { MODULE_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it } from "vitest";

import { CmsAdminsModule } from "./cms-admins.module.js";
import { CmsArticlesModule } from "./cms-articles.module.js";
import { CmsContactInquiriesModule } from "./cms-contact-inquiries.module.js";
import { CmsContactSettingsModule } from "./cms-contact-settings.module.js";
import { CmsEventsModule } from "./cms-events.module.js";
import { CmsHomeContentModule } from "./cms-home-content.module.js";
import { CmsJobsModule } from "./cms-jobs.module.js";
import { CmsMembersModule } from "./cms-members.module.js";
import { CmsProjectsModule } from "./cms-projects.module.js";
import { CmsPublicationsModule } from "./cms-publications.module.js";
import { CmsResearchModule } from "./cms-research.module.js";
import { CmsAdminsController } from "./cms-admins.controller.js";
import { CmsAdminsService } from "./cms-admins.service.js";
import { CmsArticlesController } from "./cms-articles.controller.js";
import { CmsArticlesService } from "./cms-articles.service.js";
import { CmsContactInquiriesController } from "./cms-contact-inquiries.controller.js";
import { CmsContactInquiriesService } from "./cms-contact-inquiries.service.js";
import { CmsContactSettingsController } from "./cms-contact-settings.controller.js";
import { CmsContactSettingsService } from "./cms-contact-settings.service.js";
import { CmsEventRegistrationsService } from "./cms-event-registrations.service.js";
import { CmsEventsController } from "./cms-events.controller.js";
import { CmsEventsService } from "./cms-events.service.js";
import { CmsHomeContentController } from "./cms-home-content.controller.js";
import { CmsHomeContentService } from "./cms-home-content.service.js";
import { CmsJobApplicationsService } from "./cms-jobs-applications.service.js";
import { CmsJobsController } from "./cms-jobs.controller.js";
import { CmsJobsService } from "./cms-jobs.service.js";
import { CmsMembersController } from "./cms-members.controller.js";
import { CmsMembersService } from "./cms-members.service.js";
import { CmsProjectsController } from "./cms-projects.controller.js";
import { CmsProjectsService } from "./cms-projects.service.js";
import { CmsPublicationsController } from "./cms-publications.controller.js";
import { CmsPublicationsService } from "./cms-publications.service.js";
import { CmsResearchController } from "./cms-research.controller.js";
import { CmsResearchService } from "./cms-research.service.js";

type Metadata = { controllers?: unknown[]; providers?: unknown[]; imports?: unknown[] };

function metadataOf(module: unknown): Metadata {
  return {
    controllers: Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module as object),
    providers: Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module as object),
    imports: Reflect.getMetadata(MODULE_METADATA.IMPORTS, module as object),
  };
}

describe("CMS modules", () => {
  it.each([
    ["admins", CmsAdminsModule, CmsAdminsController, [CmsAdminsService]],
    ["articles", CmsArticlesModule, CmsArticlesController, [CmsArticlesService]],
    [
      "contact inquiries",
      CmsContactInquiriesModule,
      CmsContactInquiriesController,
      [CmsContactInquiriesService],
    ],
    [
      "contact settings",
      CmsContactSettingsModule,
      CmsContactSettingsController,
      [CmsContactSettingsService],
    ],
    [
      "events",
      CmsEventsModule,
      CmsEventsController,
      [CmsEventsService, CmsEventRegistrationsService],
    ],
    ["home content", CmsHomeContentModule, CmsHomeContentController, [CmsHomeContentService]],
    ["jobs", CmsJobsModule, CmsJobsController, [CmsJobsService, CmsJobApplicationsService]],
    ["members", CmsMembersModule, CmsMembersController, [CmsMembersService]],
    ["projects", CmsProjectsModule, CmsProjectsController, [CmsProjectsService]],
    ["publications", CmsPublicationsModule, CmsPublicationsController, [CmsPublicationsService]],
    ["research", CmsResearchModule, CmsResearchController, [CmsResearchService]],
  ])(
    "the %s module wires its own controller and services",
    (_name, module, controller, services) => {
      const metadata = metadataOf(module);

      expect(metadata.controllers).toContain(controller);
      expect(metadata.controllers).toHaveLength(1);
      for (const service of services) expect(metadata.providers).toContain(service);
      expect(metadata.providers).toHaveLength(services.length);
    },
  );

  it("the jobs module caps the CV upload with the configured size", () => {
    const imports = metadataOf(CmsJobsModule).imports as { providers?: unknown[] }[];
    const multer = imports.find((entry) => Array.isArray(entry.providers));
    const options = multer?.providers?.find(
      (provider) => typeof (provider as { useFactory?: unknown }).useFactory === "function",
    ) as { useFactory: (config: unknown) => unknown } | undefined;
    expect(options).toBeDefined();

    const config = { getOrThrow: (name: string) => (name === "CMS_MAX_CV_BYTES" ? 5_000_000 : 0) };

    expect(options?.useFactory(config)).toEqual({
      limits: { fileSize: 5_000_000, files: 1, fields: 20, parts: 25 },
    });
  });
});
