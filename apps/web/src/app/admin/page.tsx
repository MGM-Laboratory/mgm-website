import { redirect } from "next/navigation";

import { MemberCmsStudio } from "@/components/admin/member-cms-studio";
import { can } from "@/lib/admin-permissions";
import { fetchAdminAccounts } from "@/lib/admin-records";
import { getAdminSession } from "@/lib/admin-session";
import { fetchArticleRecords } from "@/lib/article-cms-server";
import { fetchCareerAdminList, fetchCareerApplications } from "@/lib/career-cms-server";
import { fetchMemberRecords } from "@/lib/member-cms-server";
import { fetchProjectAdminList } from "@/lib/project-cms-server";
import { fetchPublicationRecords } from "@/lib/publication-cms-server";
import { ensureResearchCmsSeeded } from "@/lib/research-cms-server";
import { fetchEventAdminList, fetchEventRegistrations } from "@/lib/events-cms-server";
import { fetchContactInquiries } from "@/lib/contact-inquiries-cms-server";
import { fetchLinksAdminSnapshot } from "@/lib/links-cms-server";
import { fetchFormsAdminList } from "@/lib/forms/admin-server";

// The auth check reads the session cookie, so this page must never be
// statically prerendered: at build time there is no cookie and the
// redirect to the login page would get baked into the static output.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  // These reads speak for the superadmin, so the draft feeds must not
  // reach accounts without read access to the matching page. The UI hides
  // the workspace, and the server must not ship its data either.
  const [
    articles,
    ,
    publications,
    admins,
    jobs,
    applications,
    research,
    projects,
    events,
    eventRegistrations,
    contactInquiries,
    linksData,
    forms,
  ] = await Promise.all([
    can(session.permissions, "articles", "read")
      ? fetchArticleRecords().catch(() => undefined)
      : Promise.resolve(undefined),
    fetchMemberRecords().catch(() => undefined),
    can(session.permissions, "publications", "read")
      ? fetchPublicationRecords().catch(() => undefined)
      : Promise.resolve(undefined),
    session.role === "superadmin" ? fetchAdminAccounts().catch(() => []) : Promise.resolve([]),
    can(session.permissions, "careers", "read")
      ? fetchCareerAdminList().catch(() => [])
      : Promise.resolve([]),
    can(session.permissions, "careers", "read")
      ? fetchCareerApplications().catch(() => [])
      : Promise.resolve([]),
    can(session.permissions, "research", "read")
      ? ensureResearchCmsSeeded().catch(() => undefined)
      : Promise.resolve(undefined),
    can(session.permissions, "projects", "read")
      ? fetchProjectAdminList().catch(() => [])
      : Promise.resolve([]),
    can(session.permissions, "events", "read")
      ? fetchEventAdminList().catch(() => [])
      : Promise.resolve([]),
    can(session.permissions, "events", "read")
      ? fetchEventRegistrations().catch(() => [])
      : Promise.resolve([]),
    can(session.permissions, "contact-inquiries", "read")
      ? fetchContactInquiries().catch(() => [])
      : Promise.resolve([]),
    can(session.permissions, "links", "read")
      ? fetchLinksAdminSnapshot().catch(() => ({ domains: [], links: [] }))
      : Promise.resolve({ domains: [], links: [] }),
    can(session.permissions, "forms", "read")
      ? fetchFormsAdminList().catch(() => [])
      : Promise.resolve([]),
  ]);
  return (
    <MemberCmsStudio
      initialAdmins={admins}
      initialApplications={applications ?? []}
      initialArticles={articles ?? []}
      initialContactInquiries={contactInquiries ?? []}
      initialEventRegistrations={eventRegistrations ?? []}
      initialEvents={events ?? []}
      initialForms={forms}
      initialJobs={jobs ?? []}
      initialLinksData={linksData}
      initialProjects={projects ?? []}
      initialPublications={publications ?? []}
      initialResearch={research ?? []}
      paperLimitBytes={Number(process.env.CMS_MAX_PAPER_BYTES ?? 209_715_200)}
      videoLimitBytes={Number(process.env.CMS_MAX_VIDEO_BYTES ?? 524_288_000)}
      session={session}
    />
  );
}
