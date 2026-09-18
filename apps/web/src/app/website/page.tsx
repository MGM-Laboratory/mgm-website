import type { Metadata } from "next";

import { WebsiteFocusPage } from "@/components/focus/website/website-focus-page";
import { COMPETENCIES } from "@/data/competencies";

const competency = COMPETENCIES.find((c) => c.href === "/website")!;

export const metadata: Metadata = {
  title: `${competency.title} — MGM Laboratory`,
  description: competency.description,
};

export default function WebsitePage() {
  return <WebsiteFocusPage />;
}
