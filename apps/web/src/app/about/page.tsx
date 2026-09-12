import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "About Us — MGM Laboratory",
  description: "Who MGM Laboratory is and what the lab works on.",
};

export default function AboutPage() {
  return (
    <PageBand
      eyebrow="About Us"
      title="About MGM Laboratory"
      description="MGM Laboratory is a research group building Media, Game, and Mobile technology — where academic research and shipped products share the same roof."
      tone="blue"
      motif="circle"
    />
  );
}
