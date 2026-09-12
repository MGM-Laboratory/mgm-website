import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MemberProfile } from "@/components/members/member-profile";
import { CtaFooter } from "@/components/sections/cta-footer";
import { MEMBERS, getMemberBySlug } from "@/data/members";

type MemberDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return MEMBERS.map((member) => ({ slug: member.slug }));
}

export async function generateMetadata({ params }: MemberDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const member = getMemberBySlug(slug);

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
  const member = getMemberBySlug(slug);

  if (!member) notFound();

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col">
      <MemberProfile member={member} />
      <CtaFooter />
    </div>
  );
}
