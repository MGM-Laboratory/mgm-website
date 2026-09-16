import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";

import { PrismaService } from "../prisma/prisma.service.js";

export type RegistrationStatePatch = {
  read?: boolean;
  readAt?: string | null;
  status?: "inbox" | "archived";
};
export type RegistrationBulkAction = "archive" | "unarchive" | "markRead" | "markUnread" | "delete";

type PublicRegistrationRecord = Record<string, unknown> & {
  slug: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class CmsEventRegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The admin inbox: every registration, newest first. Deliberately
   * uncached — read states mutate constantly and a cache would stale the
   * unread counts.
   */
  async all(): Promise<PublicRegistrationRecord[]> {
    const records = await this.prisma.cmsEventRegistration.findMany({
      orderBy: { createdAt: "desc" },
    });
    return records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  async create(data: Prisma.InputJsonValue) {
    await this.prisma.cmsEventRegistration.create({
      data: { slug: `reg-${randomUUID()}`, data },
    });
    return { ok: true };
  }

  /** Merge a state patch into one registration; never replaces the record. */
  async updateState(slug: string, patch: RegistrationStatePatch) {
    const record = await this.prisma.cmsEventRegistration.findUnique({ where: { slug } });
    if (!record) throw new NotFoundException("Registration not found");

    const data = record.data as { registration: Record<string, unknown> };
    const registration = { ...data.registration };
    if (patch.read !== undefined) {
      registration.read = patch.read;
      registration.readAt = patch.read ? new Date().toISOString() : null;
    }
    if (patch.status !== undefined) registration.status = patch.status;

    const updated = await this.prisma.cmsEventRegistration.update({
      where: { slug },
      data: { data: { registration } as Prisma.InputJsonValue },
    });
    return {
      ...(updated.data as Record<string, unknown>),
      slug: updated.slug,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /** Bulk inbox operations, mirroring the job-applications inbox. */
  async bulk(ids: string[], action: RegistrationBulkAction) {
    if (action === "delete") {
      const { count } = await this.prisma.cmsEventRegistration.deleteMany({
        where: { slug: { in: ids } },
      });
      return { deletedCount: count };
    }

    const now = new Date().toISOString();
    const patch: RegistrationStatePatch =
      action === "archive"
        ? { status: "archived" }
        : action === "unarchive"
          ? { status: "inbox" }
          : action === "markRead"
            ? { read: true, readAt: now }
            : { read: false, readAt: null };

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.cmsEventRegistration.findMany({
        where: { slug: { in: ids } },
      });
      for (const record of existing) {
        const data = record.data as { registration: Record<string, unknown> };
        const registration = { ...data.registration, ...patch };
        await transaction.cmsEventRegistration.update({
          where: { slug: record.slug },
          data: { data: { registration } as Prisma.InputJsonValue },
        });
      }
      return { deletedCount: 0 };
    });
  }
}
