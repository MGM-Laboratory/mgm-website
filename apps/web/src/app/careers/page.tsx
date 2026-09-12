import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Careers — MGM Laboratory",
  description: "Open roles and how to join MGM Laboratory.",
};

export default function CareersPage() {
  return (
    <PageBand
      eyebrow="Careers"
      title="Careers at MGM Laboratory"
      description="We're always looking for researchers and builders who want to work across the line between academic research and real, shipped products."
      tone="yellow"
      motif="plus"
    />
  );
}
