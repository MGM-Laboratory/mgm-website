import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class CmsMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async all() {
    const records = await this.prisma.cmsMember.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => ({
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  async save(currentSlug: string, nextSlug: string, data: Prisma.InputJsonValue) {
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.cmsMember.findUnique({ where: { slug: currentSlug } });

      // A new member starts with its first chosen slug. A renamed member must
      // already exist under the URL that was opened in the editor.
      if (!current) {
        if (currentSlug !== nextSlug) throw new NotFoundException("Member record not found");
        return transaction.cmsMember.create({ data: { slug: nextSlug, data } });
      }

      if (currentSlug !== nextSlug) {
        const destination = await transaction.cmsMember.findUnique({ where: { slug: nextSlug } });
        if (destination) throw new Error("CMS_MEMBER_SLUG_CONFLICT");
      }

      return transaction.cmsMember.update({
        where: { slug: currentSlug },
        data: { data, slug: nextSlug },
      });
    });
    return {
      ...(record.data as Record<string, unknown>),
      slug: record.slug,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async bootstrap(records: { data: Prisma.InputJsonValue; slug: string }[]) {
    const existingCount = await this.prisma.cmsMember.count();
    if (existingCount) return this.all();

    await this.prisma.$transaction(
      records.map((record) =>
        this.prisma.cmsMember.upsert({
          where: { slug: record.slug },
          create: record,
          update: { data: record.data },
        }),
      ),
    );
    return this.all();
  }

  async remove(slug: string) {
    try {
      await this.prisma.cmsMember.delete({ where: { slug } });
    } catch {
      throw new NotFoundException("Member override not found");
    }
  }
}
