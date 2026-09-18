import type { Metadata } from "next";

import { MobileFocusPage } from "@/components/focus/mobile/mobile-focus-page";
import { COMPETENCIES } from "@/data/competencies";

const competency = COMPETENCIES.find((c) => c.href === "/mobile")!;

export const metadata: Metadata = {
  title: `${competency.title} — MGM Laboratory`,
  description: competency.description,
};

export default function MobilePage() {
  return <MobileFocusPage />;
}
