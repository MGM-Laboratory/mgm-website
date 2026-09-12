import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Terms of Service — MGM Laboratory",
  description: "The terms covering use of MGM Laboratory's site and services.",
};

export default function TermsOfServicePage() {
  return (
    <PageBand
      eyebrow="Legal"
      title="Terms of Service"
      description="The full terms are coming soon."
      tone="red"
      motif="plus"
    />
  );
}
