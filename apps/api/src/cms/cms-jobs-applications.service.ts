import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";

import { PrismaService } from "../prisma/prisma.service.js";

export type ApplicationStatePatch = {
  read?: boolean;
  readAt?: string | null;
  status?: "inbox" | "archived";
};
export type ApplicationBulkAction = "archive" | "unarchive" | "markRead" | "markUnread" | "delete";

type PublicApplicationRecord = Record<string, unknown> & {
  slug: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class CmsJobApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The admin inbox: every application, newest first. Deliberately uncached —
   * read states mutate constantly and a cache would stale the unread counts.
   */
  async all(): Promise<PublicApplicationRecord[]> {
    const records = await this.prisma.cmsJobApplication.findMany({
      orderBy: { createdAt: "desc" },
    });
    return records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  async bySlug(slug: string) {
    const record = await this.prisma.cmsJobApplication.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Application not found");
    const publicRecord: PublicApplicationRecord = {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
    return publicRecord;
  }

  async create(data: Prisma.InputJsonValue) {
    await this.prisma.cmsJobApplication.create({
      data: { slug: `app-${randomUUID()}`, data },
    });
    return { ok: true };
  }

  /** Merge a state patch into one application; never replaces the record. */
  async updateState(slug: string, patch: ApplicationStatePatch) {
    const record = await this.prisma.cmsJobApplication.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Application not found");

    const data = record.data as { application: Record<string, unknown> };
    const application = { ...data.application };
    if (patch.read !== undefined) {
      application.read = patch.read;
      application.readAt = patch.read ? new Date().toISOString() : null;
    }
    if (patch.status !== undefined) application.status = patch.status;

    const updated = await this.prisma.cmsJobApplication.update({
      where: { slug },
      data: { data: { application } as Prisma.InputJsonValue },
    });
    return {
      ...(updated.data as Record<string, unknown>),
      slug: updated.slug,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Bulk inbox operations. Deleted applications return their CV keys so the
   * caller can best-effort remove the stored files.
   */
  async bulk(ids: string[], action: ApplicationBulkAction) {
    if (action === "delete") {
      return this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.cmsJobApplication.findMany({
          where: { slug: { in: ids } },
        });
        const deletedCvKeys = existing
          .map((record) => {
            const data = record.data as { application?: { cvKey?: unknown } };
            return typeof data.application?.cvKey === "string" ? data.application.cvKey : null;
          })
          .filter((key): key is string => key !== null);
        await transaction.cmsJobApplication.deleteMany({ where: { slug: { in: ids } } });
        return { deletedCount: existing.length, deletedCvKeys };
      });
    }

    const now = new Date().toISOString();
    const patch: ApplicationStatePatch =
      action === "archive"
        ? { status: "archived" }
        : action === "unarchive"
          ? { status: "inbox" }
          : action === "markRead"
            ? { read: true, readAt: now }
            : { read: false, readAt: null };

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.cmsJobApplication.findMany({
        where: { slug: { in: ids } },
      });
      for (const record of existing) {
        const data = record.data as { application: Record<string, unknown> };
        const application = { ...data.application, ...patch };
        await transaction.cmsJobApplication.update({
          where: { slug: record.slug },
          data: { data: { application } as Prisma.InputJsonValue },
        });
      }
      return { deletedCount: 0, deletedCvKeys: [] as string[] };
    });
  }
}
