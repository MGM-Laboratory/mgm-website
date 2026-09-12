import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Events — MGM Laboratory",
  description: "Talks, workshops, and showcases hosted by MGM Laboratory.",
};

export default function EventsPage() {
  return (
    <PageBand
      eyebrow="Events"
      title="Events"
      description="Talks, workshops, and showcases where the lab shares what it's building and learning with the wider community."
      tone="red"
      motif="fans"
    />
  );
}
