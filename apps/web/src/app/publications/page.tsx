import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Publications — MGM Laboratory",
  description: "Papers and writing published by MGM Laboratory.",
};

export default function PublicationsPage() {
  return (
    <PageBand
      eyebrow="Our Work — Publications"
      title="Publications"
      description="Papers and write-ups covering the research questions behind the lab's products — from usability studies to systems work."
      tone="blue"
      motif="quads"
    />
  );
}
