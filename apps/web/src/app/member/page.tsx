import type { Metadata } from "next";

import { MemberDirectory } from "@/components/members/member-directory";
import { MemberHero } from "@/components/members/member-hero";
import { CtaFooter } from "@/components/sections/cta-footer";
import type { CmsMemberRecord } from "@/lib/member-cms";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";

export const metadata: Metadata = {
  title: "Member | MGM Laboratory",
  description: "The researchers, engineers, and designers behind MGM Laboratory.",
};

export default async function MemberPage() {
  let initialRecords: CmsMemberRecord[] = [];
  try {
    initialRecords = await ensureMemberCmsSeeded();
  } catch {
    // The static directory remains available during a temporary CMS outage.
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col">
      <MemberHero />
      <MemberDirectory initialRecords={initialRecords} />
      <CtaFooter />
    </div>
  );
}
