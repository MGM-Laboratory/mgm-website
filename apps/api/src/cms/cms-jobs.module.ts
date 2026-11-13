import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MulterModule } from "@nestjs/platform-express";

import type { Env } from "../config/env.validation.js";
import { MailModule } from "../mail/mail.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CmsJobApplicationsService } from "./cms-jobs-applications.service.js";
import { CmsJobsController } from "./cms-jobs.controller.js";
import { CmsJobsService } from "./cms-jobs.service.js";

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    MailModule,
    // The public apply route keeps the CV in memory, so multer stops reading at the size limit and not after the whole file
    // arrived. The module has no other upload route.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        limits: {
          fileSize: config.getOrThrow<number>("CMS_MAX_CV_BYTES"),
          files: 1,
          fields: 20,
          parts: 25,
        },
      }),
    }),
  ],
  controllers: [CmsJobsController],
  providers: [CmsJobsService, CmsJobApplicationsService],
})
export class CmsJobsModule {}
