import type { Metadata } from "next";

import { CompetencyPageContent } from "@/components/sections/competency-page";
import { COMPETENCIES } from "@/data/competencies";

const competency = COMPETENCIES.find((c) => c.href === "/ux")!;

export const metadata: Metadata = {
  title: `${competency.title} — MGM Laboratory`,
  description: competency.description,
};

export default function UxPage() {
  return <CompetencyPageContent competency={competency} />;
}
