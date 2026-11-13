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
  highlighted: boolean;
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
    highlighted: member.highlighted ?? false,
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
    highlighted: draft.highlighted,
    labFocus: draft.labFocus.map((skill) => skill.trim()).filter(Boolean),
    name: draft.name.trim(),
    nickname: draft.nickname.trim() || undefined,
    role: draft.role,
    slug: draft.slug.trim(),
    unit: draft.unit || undefined,
  };
}

/** The members of the CMS records, in a stable order by name so an edit does not reshuffle a list. */
export function membersFromRecords(records: readonly CmsMemberRecord[]) {
  return records.map((record) => record.member).toSorted((a, b) => a.name.localeCompare(b.name));
}
