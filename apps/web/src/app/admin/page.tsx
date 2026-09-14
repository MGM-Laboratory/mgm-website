import { redirect } from "next/navigation";

import { MemberCmsStudio } from "@/components/admin/member-cms-studio";
import { hasAdminSession } from "@/lib/admin-session";
import { ensureArticleCmsSeeded } from "@/lib/article-cms-seed";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";
import { ensurePublicationCmsSeeded } from "@/lib/publication-cms-seed";

// The auth check reads the session cookie, so this page must never be
// statically prerendered: at build time there is no cookie and the
// redirect to the login page would get baked into the static output.
export const dynamic = "force-dynamic";

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
