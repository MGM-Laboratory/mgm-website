import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";

import { PrismaService } from "../prisma/prisma.service.js";

export type InquiryStatePatch = {
  read?: boolean;
  readAt?: string | null;
  status?: "inbox" | "archived";
};
export type InquiryBulkAction = "archive" | "unarchive" | "markRead" | "markUnread" | "delete";

type PublicInquiryRecord = Record<string, unknown> & {
  slug: string;
  createdAt: string;
  updatedAt: string;
};

function patchForBulkAction(
  action: Exclude<InquiryBulkAction, "delete">,
  now: string,
): InquiryStatePatch {
  switch (action) {
    case "archive":
      return { status: "archived" };
    case "unarchive":
      return { status: "inbox" };
    case "markRead":
      return { read: true, readAt: now };
    case "markUnread":
      return { read: false, readAt: null };
  }
}

@Injectable()
export class CmsContactInquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The admin inbox: every inquiry, newest first. Deliberately uncached —
   * read states mutate constantly and a cache would stale the unread counts.
   */
  async all(): Promise<PublicInquiryRecord[]> {
    const records = await this.prisma.cmsContactInquiry.findMany({
      orderBy: { createdAt: "desc" },
    });
    return records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  // Called directly from ContactService, unconditionally and before any
  // email send is attempted — this is the guaranteed side effect of a
  // contact form submission, so an inquiry is never lost to an email
  // provider outage.
  async create(data: Prisma.InputJsonValue) {
    await this.prisma.cmsContactInquiry.create({
      data: { slug: `inquiry-${randomUUID()}`, data },
    });
    return { ok: true };
  }

  /** Merge a state patch into one inquiry; never replaces the record. */
  async updateState(slug: string, patch: InquiryStatePatch) {
    const record = await this.prisma.cmsContactInquiry.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Inquiry not found");

    const data = record.data as { inquiry: Record<string, unknown> };
    const inquiry = { ...data.inquiry };
    if (patch.read !== undefined) {
      inquiry.read = patch.read;
      inquiry.readAt = patch.read ? new Date().toISOString() : null;
    }
    if (patch.status !== undefined) inquiry.status = patch.status;

    const updated = await this.prisma.cmsContactInquiry.update({
      where: { slug },
      data: { data: { inquiry } as Prisma.InputJsonValue },
    });
    return {
      ...(updated.data as Record<string, unknown>),
      slug: updated.slug,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /** Bulk inbox operations, mirroring the event-registrations inbox. */
  async bulk(ids: string[], action: InquiryBulkAction) {
    if (action === "delete") {
      const { count } = await this.prisma.cmsContactInquiry.deleteMany({
        where: { slug: { in: ids } },
      });
      return { deletedCount: count };
    }

    const patch = patchForBulkAction(action, new Date().toISOString());

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.cmsContactInquiry.findMany({
        where: { slug: { in: ids } },
      });
      for (const record of existing) {
        const data = record.data as { inquiry: Record<string, unknown> };
        const inquiry = { ...data.inquiry, ...patch };
        await transaction.cmsContactInquiry.update({
          where: { slug: record.slug },
          data: { data: { inquiry } as Prisma.InputJsonValue },
        });
      }
      return { deletedCount: 0 };
    });
  }
}
