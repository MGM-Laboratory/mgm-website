import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Research — MGM Laboratory",
  description: "Ongoing research projects at MGM Laboratory.",
};

export default function ResearchPage() {
  return (
    <PageBand
      eyebrow="Our Work — Research"
      title="Research"
      description="Ongoing studies and experiments — the groundwork that ends up shaping how the lab designs and builds its products."
      tone="red"
      motif="arcs"
    />
  );
}
