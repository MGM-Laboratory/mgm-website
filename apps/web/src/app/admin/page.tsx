import { redirect } from "next/navigation";

import { MemberCmsStudio } from "@/components/admin/member-cms-studio";
import { hasAdminSession } from "@/lib/admin-session";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";

export default async function AdminPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  await ensureMemberCmsSeeded().catch(() => undefined);
  return <MemberCmsStudio />;
}
