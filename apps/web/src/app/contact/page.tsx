import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Contact — MGM Laboratory",
  description: "Get in touch with MGM Laboratory.",
};

export default function ContactPage() {
  return (
    <PageBand
      eyebrow="Contact"
      title="Get in Touch"
      description="Have a project, a research question, or just want to say hello? We'd love to hear from you."
      tone="blue"
      motif="plus"
    />
  );
}
