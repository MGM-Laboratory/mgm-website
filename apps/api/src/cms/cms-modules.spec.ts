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
    ["admins", CmsAdminsModule],
    ["articles", CmsArticlesModule],
    ["contact inquiries", CmsContactInquiriesModule],
    ["contact settings", CmsContactSettingsModule],
    ["events", CmsEventsModule],
    ["home content", CmsHomeContentModule],
    ["jobs", CmsJobsModule],
    ["members", CmsMembersModule],
    ["projects", CmsProjectsModule],
    ["publications", CmsPublicationsModule],
    ["research", CmsResearchModule],
  ])("the %s module declares a controller and a service", (_name, module) => {
    const metadata = metadataOf(module);

    expect(metadata.controllers).toHaveLength(1);
    expect(metadata.providers?.length).toBeGreaterThanOrEqual(1);
  });

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
