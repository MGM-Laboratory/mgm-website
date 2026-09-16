import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { CmsContactInquiriesController } from "./cms-contact-inquiries.controller.js";
import { CmsContactInquiriesService } from "./cms-contact-inquiries.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [CmsContactInquiriesController],
  providers: [CmsContactInquiriesService],
  exports: [CmsContactInquiriesService],
})
export class CmsContactInquiriesModule {}
