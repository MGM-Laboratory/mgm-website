import type { Metadata } from "next";

import { CtaFooter } from "@/components/sections/cta-footer";
import { AboutHero } from "@/components/about/about-hero";
import { IdentitySection } from "@/components/about/identity-section";
import { HistorySection } from "@/components/about/history-section";
import { ResearchSection } from "@/components/about/research-section";
import { GovernanceSection } from "@/components/about/governance-section";
import { RecordSection } from "@/components/about/record-section";
import { NetworkSection } from "@/components/about/network-section";
import { OpenQuestionsSection } from "@/components/about/open-questions-section";
import { SourceRegister } from "@/components/about/source-register";
import { EvidenceLens } from "@/components/about/evidence-lens";

export const metadata: Metadata = {
  title: "About Us — MGM Laboratory",
  description:
    "MGM Laboratory, presented as an evidence ledger — every claim footnoted and confidence-rated against the public FILKOM UB record.",
};

export default function AboutPage() {
  return (
    <div className="relative flex flex-1 flex-col">
      <main className="flex flex-1 flex-col pb-24">
        <AboutHero />
        <IdentitySection />
        <HistorySection />
        <ResearchSection />
        <GovernanceSection />
        <RecordSection />
        <NetworkSection />
        <OpenQuestionsSection />
        <SourceRegister />
      </main>
      <CtaFooter />
      <EvidenceLens />
    </div>
  );
}
