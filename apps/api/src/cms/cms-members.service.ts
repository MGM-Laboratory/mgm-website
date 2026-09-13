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

  async save(slug: string, data: Prisma.InputJsonValue) {
    const record = await this.prisma.cmsMember.upsert({
      where: { slug },
      create: { slug, data },
      update: { data },
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
