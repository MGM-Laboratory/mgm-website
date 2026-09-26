import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormPreviewHost } from "@/components/forms/preview-host";
import { getAdminSession } from "@/lib/admin-session";

// The session cookie decides access, so this is never prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Form preview | MGM Laboratory",
  robots: { index: false, follow: false },
};

/**
 * The form builder's live preview, embedded as an iframe: it renders the
 * document the builder posts (docs/forms: the admin preview protocol) with
 * the public experience, and never records events or submits.
 */
export default async function FormPreviewPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return <FormPreviewHost />;
}
