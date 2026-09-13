import type { Member, MemberAccent, MemberDivision } from "@/data/members";

export type CmsDate = { month: number; year: number };

export type CmsExperience = {
  company: string;
  current?: boolean;
  description?: string;
  end?: CmsDate;
  location?: string;
  start?: CmsDate;
  title: string;
};

export type CmsEducation = {
  degree?: string;
  detail?: string;
  end?: CmsDate;
  institution: string;
  start?: CmsDate;
};

export type CmsAchievement = {
  date?: string;
  description?: string;
  issuer?: string;
  title: string;
};

export type CmsCertificate = {
  credentialId?: string;
  credentialUrl?: string;
  issuedAt?: string;
  issuer?: string;
  title: string;
};

export type CmsLanguage = { name: string; proficiency?: string };
export type CmsLink = { label: string; url: string };

export type CmsMemberProfile = {
  achievements?: CmsAchievement[];
  bio?: string;
  certificates?: CmsCertificate[];
  education?: CmsEducation[];
  experience?: CmsExperience[];
  languages?: CmsLanguage[];
  links?: CmsLink[];
  photoKey?: string;
  photoPosition?: { x: number; y: number; zoom: number };
  projects?: string[];
  skills?: string[];
};

export type CmsMemberRecord = {
  member: Member;
  profile: CmsMemberProfile;
  slug: string;
  /** The original static-directory slug when a member profile has been renamed. */
  sourceSlug?: string;
  updatedAt?: string;
};

export type MemberDraft = {
  accent: MemberAccent;
  bio: string;
  division: MemberDivision;
  group: Member["group"];
  hasPortrait: boolean;
  labFocus: string[];
  name: string;
  nickname: string;
  role: Member["role"];
  slug: string;
  unit: "" | "Assistant Coordinator" | "Secretariat";
};

export function memberToDraft(member: Member): MemberDraft {
  return {
    ...member,
    labFocus: [...member.labFocus],
    nickname: member.nickname ?? "",
    unit: member.unit ?? "",
  };
}

export function draftToMember(draft: MemberDraft): Member {
  return {
    accent: draft.accent,
    bio: draft.bio.trim(),
    division: draft.division,
    group: draft.group,
    hasPortrait: draft.hasPortrait,
    labFocus: draft.labFocus.map((skill) => skill.trim()).filter(Boolean),
    name: draft.name.trim(),
    nickname: draft.nickname.trim() || undefined,
    role: draft.role,
    slug: draft.slug.trim(),
    unit: draft.unit || undefined,
  };
}

export function mergeMemberRecords(base: readonly Member[], records: readonly CmsMemberRecord[]) {
  const overrides = new Map(records.map((record) => [record.slug, record.member]));
  const renamedBaseSlugs = new Set(
    records.flatMap((record) =>
      record.sourceSlug && record.sourceSlug !== record.slug ? [record.sourceSlug] : [],
    ),
  );
  const merged = base
    .filter((member) => !renamedBaseSlugs.has(member.slug))
    .map((member) => overrides.get(member.slug) ?? member);
  const additions = records
    .filter((record) => !base.some((member) => member.slug === record.slug))
    .map((record) => record.member);

  return [...merged, ...additions];
}
