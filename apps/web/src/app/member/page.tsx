import type { Metadata } from "next";

import { MemberDirectory } from "@/components/members/member-directory";
import { MemberHero } from "@/components/members/member-hero";
import { CtaFooter } from "@/components/sections/cta-footer";

export const metadata: Metadata = {
  title: "Member | MGM Laboratory",
  description: "The researchers, engineers, and designers behind MGM Laboratory.",
};

export default function MemberPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col">
      <MemberHero />
      <MemberDirectory />
      <CtaFooter />
    </div>
  );
}
