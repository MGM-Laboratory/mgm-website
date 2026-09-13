import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

type MemberDocument = { member?: { name?: unknown }; sourceSlug?: unknown };

function memberName(data: Prisma.JsonValue) {
  const name = (data as MemberDocument).member?.name;
  return typeof name === "string" ? name.trim().toLocaleLowerCase() : "";
}

function renameDocument(data: Prisma.InputJsonValue, sourceSlug: string) {
  const document = data as MemberDocument;
  return {
    ...document,
    sourceSlug: typeof document.sourceSlug === "string" ? document.sourceSlug : sourceSlug,
  } as Prisma.InputJsonValue;
}

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
        const requestedSource = (data as MemberDocument).sourceSlug;
        const sourceRecord =
          typeof requestedSource === "string" && requestedSource !== nextSlug
            ? await transaction.cmsMember.findUnique({ where: { slug: requestedSource } })
            : undefined;

        if (sourceRecord) {
          return transaction.cmsMember.update({
            where: { slug: sourceRecord.slug },
            data: { data: renameDocument(data, sourceRecord.slug), slug: nextSlug },
          });
        }

        if (currentSlug !== nextSlug) throw new NotFoundException("Member record not found");

        // Legacy dashboard bundles used the edited slug as their request URL.
        // A unique name match lets us still execute the intended rename safely.
        const sameName = memberName(data as Prisma.JsonValue);
        const candidates = sameName
          ? (await transaction.cmsMember.findMany({ select: { data: true, slug: true } })).filter(
              (record) => record.slug !== nextSlug && memberName(record.data) === sameName,
            )
          : [];
        if (candidates.length === 1) {
          return transaction.cmsMember.update({
            where: { slug: candidates[0].slug },
            data: { data: renameDocument(data, candidates[0].slug), slug: nextSlug },
          });
        }
        if (candidates.length > 1) throw new Error("CMS_MEMBER_AMBIGUOUS_RENAME");
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
