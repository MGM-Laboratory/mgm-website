import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Media — MGM Laboratory",
  description: "News, stories, and updates from MGM Laboratory.",
};

export default function MediaPage() {
  return (
    <PageBand
      eyebrow="Media"
      title="Media"
      description="News, stories, and updates from MGM Laboratory."
      tone="blue"
      motif="fans"
    />
  );
}
