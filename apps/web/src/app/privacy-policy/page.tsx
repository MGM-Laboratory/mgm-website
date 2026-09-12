import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Privacy Policy — MGM Laboratory",
  description: "How MGM Laboratory handles your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <PageBand
      eyebrow="Legal"
      title="Privacy Policy"
      description="Details on what we collect and how it's used are coming soon."
      tone="blue"
      motif="quads"
    />
  );
}
