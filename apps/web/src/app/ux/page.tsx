import type { Metadata } from "next";

import { UxFocusPage } from "@/components/focus/ux/ux-focus-page";
import { COMPETENCIES } from "@/data/competencies";

const competency = COMPETENCIES.find((c) => c.href === "/ux")!;

export const metadata: Metadata = {
  title: `${competency.title} — MGM Laboratory`,
  description: competency.description,
};

export default function UxPage() {
  return <UxFocusPage />;
}
