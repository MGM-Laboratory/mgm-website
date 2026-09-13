import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { MEMBERS, type Member } from "@/data/members";
import { cmsApi } from "@/lib/cms-api";
import { importPublicMemberProfile } from "@/lib/member-profile-import";
import type { CmsLink, CmsMemberRecord } from "@/lib/member-cms";

type LegacyContacts = {
  github?: string;
  linkedin?: string;
  personalWebsite?: string;
  phone?: string;
  portfolio?: string;
  primaryEmail?: string;
};

type LegacyProfile = { contacts?: LegacyContacts; raw?: string };

let bootstrapPromise: Promise<CmsMemberRecord[]> | undefined;

function publicProfileDirectories() {
  return [
    join(process.cwd(), "public", "member-profiles"),
    join(process.cwd(), "apps", "web", "public", "member-profiles"),
  ];
}

async function legacyProfile(slug: string): Promise<LegacyProfile> {
  for (const directory of publicProfileDirectories()) {
    try {
      return JSON.parse(await readFile(join(directory, `${slug}.json`), "utf8")) as LegacyProfile;
    } catch {
      // The next candidate covers both `next dev` and the standalone Railway image.
    }
  }
  return {};
}

function url(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

function linksFrom(contacts: LegacyContacts = {}): CmsLink[] {
  const phone = contacts.phone?.replace(/\D/g, "");
  const whatsapp = phone
    ? `https://api.whatsapp.com/send/?phone=${phone.startsWith("0") ? `62${phone.slice(1)}` : phone}`
    : undefined;
  const entries: [string, string | undefined][] = [
    ["Website", url(contacts.personalWebsite)],
    ["Portfolio", url(contacts.portfolio)],
    ["GitHub", url(contacts.github)],
    ["LinkedIn", url(contacts.linkedin)],
    ["Email", contacts.primaryEmail ? `mailto:${contacts.primaryEmail.trim()}` : undefined],
    ["WhatsApp", whatsapp],
  ];
  return entries.flatMap(([label, href]) => (href ? [{ label, url: href }] : []));
}

async function sourceRecord(member: Member): Promise<CmsMemberRecord> {
  const legacy = await legacyProfile(member.slug);
  const profile = importPublicMemberProfile(member, legacy.raw ?? "");
  return {
    member,
    profile: { ...profile, links: linksFrom(legacy.contacts) },
    slug: member.slug,
  };
}

async function requestRecords() {
  const response = await cmsApi("/cms/members");
  if (!response.ok) throw new Error("CMS member records could not be read");
  const data = (await response.json()) as { records?: CmsMemberRecord[] };
  return data.records ?? [];
}

export async function ensureMemberCmsSeeded() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const existing = await requestRecords();
      if (existing.length) return existing;

      const records = await Promise.all(MEMBERS.map(sourceRecord));
      const response = await cmsApi("/cms/members/bootstrap", {
        body: JSON.stringify({ records }),
        method: "POST",
      });
      if (!response.ok) throw new Error("CMS member records could not be imported");
      const data = (await response.json()) as { records?: CmsMemberRecord[] };
      return data.records ?? records;
    })().catch((error) => {
      bootstrapPromise = undefined;
      throw error;
    });
  }
  return bootstrapPromise;
}
