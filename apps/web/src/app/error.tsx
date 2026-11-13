"use client";

import Link from "next/link";
import { useEffect } from "react";

import { StatusPage } from "@/components/ui/status-page";

// Shown when a page throws while it renders, for example when the API does
// not answer. The page itself stays a real 404 only for a record that does
// not exist, so a visitor never reads "not found" for an outage.
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <meta name="robots" content="noindex" />
      <StatusPage
        eyebrow="Something went wrong"
        title="We could not load this page"
        description="The problem is on our side, not yours. Please try again in a moment."
      >
        <button
          className="rounded-md bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          onClick={() => retry()}
          type="button"
        >
          Try again
        </button>
        <Link
          className="rounded-md border border-[var(--ink-3)]/40 px-5 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:border-brand-blue dark:text-white"
          href="/"
        >
          Back to the home page
        </Link>
      </StatusPage>
    </>
  );
}
