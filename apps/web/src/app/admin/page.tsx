import { redirect } from "next/navigation";

import { MemberCmsStudio } from "@/components/admin/member-cms-studio";
import { hasAdminSession } from "@/lib/admin-session";

export default async function AdminPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  return <MemberCmsStudio />;
}
