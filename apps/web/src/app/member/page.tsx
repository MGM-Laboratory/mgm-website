import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Member — MGM Laboratory",
  description: "The researchers, engineers, and designers behind MGM Laboratory.",
};

export default function MemberPage() {
  return (
    <PageBand
      eyebrow="Member"
      title="Our Members"
      description="A mix of researchers, engineers, and designers working across websites, mobile apps, UX research, and interactive media."
      tone="green"
      motif="clover"
    />
  );
}
