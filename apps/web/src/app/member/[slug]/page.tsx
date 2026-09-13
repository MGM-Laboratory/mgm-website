import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MemberProfile, MemberProfileBySlug } from "@/components/members/member-profile";
import { CtaFooter } from "@/components/sections/cta-footer";
import { MEMBERS, getMemberBySlug } from "@/data/members";
import type { CmsMemberRecord } from "@/lib/member-cms";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";

type MemberDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return MEMBERS.map((member) => ({ slug: member.slug }));
}

// A renamed profile needs to resolve at request time so its previous URL can
// immediately redirect instead of serving an obsolete statically generated page.
export const revalidate = 0;

export async function generateMetadata({ params }: MemberDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  let member = getMemberBySlug(slug);
  try {
    const records = await ensureMemberCmsSeeded();
    const record = records.find(
      (item) => item.slug === slug || (item.sourceSlug === slug && item.slug !== slug),
    );
    member = record?.member ?? member;
  } catch {
    // Preserve the static member metadata when the CMS cannot be reached.
  }

  if (!member) {
    return { title: "Member not found | MGM Laboratory" };
  }

  return {
    title: `${member.name} | MGM Laboratory`,
    description: `${member.name} is a ${member.role.toLowerCase()} in MGM Laboratory's ${member.division} division.`,
  };
}

export default async function MemberDetailPage({ params }: MemberDetailPageProps) {
  const { slug } = await params;
  let initialRecords: CmsMemberRecord[] = [];
  let renamedSlug: string | undefined;
  try {
    initialRecords = await ensureMemberCmsSeeded();
    renamedSlug = initialRecords.find(
      (record) => record.sourceSlug === slug && record.slug !== slug,
    )?.slug;
  } catch {
    // The client-side member data hook retains the public profile fallback if the CMS is unavailable.
  }
  if (renamedSlug) redirect(`/member/${renamedSlug}`);
  const member = getMemberBySlug(slug);

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col">
      {member ? (
        <MemberProfile initialRecords={initialRecords} member={member} />
      ) : (
        <MemberProfileBySlug initialRecords={initialRecords} slug={slug} />
      )}
      <CtaFooter />
    </div>
  );
}
