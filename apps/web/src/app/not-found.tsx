import type { Metadata } from "next";
import Link from "next/link";

import { StatusPage } from "@/components/ui/status-page";

export const metadata: Metadata = {
  title: "Page not found | MGM Laboratory",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <StatusPage
      eyebrow="404"
      title="This page does not exist"
      description="The link may be old, or the page may have been unpublished."
    >
      <Link
        className="rounded-md bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        href="/"
      >
        Back to the home page
      </Link>
    </StatusPage>
  );
}
