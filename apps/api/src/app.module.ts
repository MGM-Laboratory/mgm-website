import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";

import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { CacheModule } from "./cache/cache.module.js";
import { CmsAdminsModule } from "./cms/cms-admins.module.js";
import { CmsArticlesModule } from "./cms/cms-articles.module.js";
import { CmsContactInquiriesModule } from "./cms/cms-contact-inquiries.module.js";
import { CmsContactSettingsModule } from "./cms/cms-contact-settings.module.js";
import { CmsEventsModule } from "./cms/cms-events.module.js";
import { CmsHomeContentModule } from "./cms/cms-home-content.module.js";
import { CmsJobsModule } from "./cms/cms-jobs.module.js";
import { CmsMembersModule } from "./cms/cms-members.module.js";
import { CmsProjectsModule } from "./cms/cms-projects.module.js";
import { CmsPublicationsModule } from "./cms/cms-publications.module.js";
import { CmsResearchModule } from "./cms/cms-research.module.js";
import { ContactModule } from "./contact/contact.module.js";
import { validateEnv } from "./config/env.validation.js";
import { HealthModule } from "./health/health.module.js";
import { MailModule } from "./mail/mail.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ShortlinksModule } from "./shortlinks/shortlinks.module.js";
import { StorageModule } from "./storage/storage.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { singleLine: true } }
            : undefined,
        autoLogging: true,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL ?? 60000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    CacheModule,
    PrismaModule,
    CmsMembersModule,
    CmsArticlesModule,
    CmsPublicationsModule,
    CmsContactSettingsModule,
    CmsContactInquiriesModule,
    CmsHomeContentModule,
    ContactModule,
    CmsJobsModule,
    CmsResearchModule,
    CmsProjectsModule,
    CmsEventsModule,
    CmsAdminsModule,
    HealthModule,
    StorageModule,
    MailModule,
    ShortlinksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
