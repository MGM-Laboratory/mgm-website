import { redirect } from "next/navigation";

import { MemberCmsStudio } from "@/components/admin/member-cms-studio";
import { hasAdminSession } from "@/lib/admin-session";
import { ensureArticleCmsSeeded } from "@/lib/article-cms-seed";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";
import { ensurePublicationCmsSeeded } from "@/lib/publication-cms-seed";

export default async function AdminPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  const [articles, , publications] = await Promise.all([
    ensureArticleCmsSeeded().catch(() => undefined),
    ensureMemberCmsSeeded().catch(() => undefined),
    ensurePublicationCmsSeeded().catch(() => undefined),
  ]);
  return (
    <MemberCmsStudio
      initialArticles={articles ?? []}
      initialPublications={publications ?? []}
      paperLimitBytes={Number(process.env.CMS_MAX_PAPER_BYTES ?? 209_715_200)}
    />
  );
}
