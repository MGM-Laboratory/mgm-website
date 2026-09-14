import { redirect } from "next/navigation";

import { MemberCmsStudio } from "@/components/admin/member-cms-studio";
import { can } from "@/lib/admin-permissions";
import { fetchAdminAccounts } from "@/lib/admin-records";
import { getAdminSession } from "@/lib/admin-session";
import { ensureArticleCmsSeeded } from "@/lib/article-cms-seed";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";
import { ensurePublicationCmsSeeded } from "@/lib/publication-cms-seed";

// The auth check reads the session cookie, so this page must never be
// statically prerendered: at build time there is no cookie and the
// redirect to the login page would get baked into the static output.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  // The seed helpers speak for the superadmin, so the draft feeds must not
  // reach accounts without read access to the matching page — the UI hides
  // the workspace, and the server must not ship its data either.
  const [articles, , publications, admins] = await Promise.all([
    can(session.permissions, "articles", "read")
      ? ensureArticleCmsSeeded().catch(() => undefined)
      : Promise.resolve(undefined),
    ensureMemberCmsSeeded().catch(() => undefined),
    can(session.permissions, "publications", "read")
      ? ensurePublicationCmsSeeded().catch(() => undefined)
      : Promise.resolve(undefined),
    session.role === "superadmin" ? fetchAdminAccounts().catch(() => []) : Promise.resolve([]),
  ]);
  return (
    <MemberCmsStudio
      initialAdmins={admins}
      initialArticles={articles ?? []}
      initialPublications={publications ?? []}
      paperLimitBytes={Number(process.env.CMS_MAX_PAPER_BYTES ?? 209_715_200)}
      session={session}
    />
  );
}
