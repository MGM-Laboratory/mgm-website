import { redirect } from "next/navigation";

import { MemberCmsStudio } from "@/components/admin/member-cms-studio";
import { hasAdminSession } from "@/lib/admin-session";
import { ensureArticleCmsSeeded } from "@/lib/article-cms-seed";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";

export default async function AdminPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  const [articles] = await Promise.all([
    ensureArticleCmsSeeded().catch(() => undefined),
    ensureMemberCmsSeeded().catch(() => undefined),
  ]);
  return <MemberCmsStudio initialArticles={articles ?? []} />;
}
