import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Articles — MGM Laboratory",
  description: "Writing from MGM Laboratory on research, design, and engineering.",
};

export default function ArticlesPage() {
  return (
    <PageBand
      eyebrow="Articles"
      title="Articles"
      description="Notes and write-ups from the lab — research findings, design decisions, and engineering lessons worth sharing."
      tone="yellow"
      motif="leaves"
    />
  );
}
