"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  FileText,
  FolderKanban,
  Globe2,
  GraduationCap,
  Languages,
  Mail,
  Phone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import gsap from "gsap";
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Member } from "@/data/members";
import { GithubGlyph, LinkedinGlyph } from "@/components/social-icons";

type PublicProfile = {
  contacts: {
    github?: string;
    labEmail?: string;
    linkedin?: string;
    personalWebsite?: string;
    phone?: string;
    portfolio?: string;
    primaryEmail?: string;
  };
  identifiers: { nim?: string };
  raw: string;
};

type ProfileSectionData = { content: string; icon: LucideIcon; title: string };

const ACCENT_COLORS = {
  blue: "bg-brand-blue",
  yellow: "bg-brand-yellow",
  red: "bg-brand-red",
  green: "bg-brand-green",
} as const;

const SECTION_CONFIG: Record<string, Pick<ProfileSectionData, "icon" | "title">> = {
  achievements: { icon: BadgeCheck, title: "Achievements" },
  certifications: { icon: BadgeCheck, title: "Certifications" },
  education: { icon: GraduationCap, title: "Education" },
  experience: { icon: BriefcaseBusiness, title: "Experience" },
  languages: { icon: Languages, title: "Languages" },
  projects: { icon: FolderKanban, title: "Projects" },
  summary: { icon: FileText, title: "About" },
  topSkills: { icon: Sparkles, title: "Top skills" },
};

function normalise(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sectionKey(line: string) {
  const value = normalise(line);
  if (["summary", "ringkasan"].includes(value)) return "summary";
  if (["top skills", "keahlian teratas"].includes(value)) return "topSkills";
  if (["experience", "pengalaman"].includes(value)) return "experience";
  if (["education", "pendidikan"].includes(value)) return "education";
  if (["languages", "bahasa"].includes(value)) return "languages";
  if (["honors awards", "penghargaan"].includes(value)) return "achievements";
  if (["certifications", "certification", "sertifikasi"].includes(value)) return "certifications";
  if (["projects", "proyek"].includes(value)) return "projects";
  return undefined;
}

function parseProfile(member: Member, raw: string) {
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const sections = new Map<string, string[]>();
  let activeSection: string | undefined;
  const memberWords = normalise(member.name)
    .split(" ")
    .filter((word) => word.length > 2);
  const resemblesMemberName = (value: string) =>
    memberWords.filter((word) => normalise(value).includes(word)).length / memberWords.length >=
    0.6;

  for (const line of lines) {
    const nextSection = sectionKey(line);
    if (nextSection) {
      activeSection = nextSection;
      if (!sections.has(nextSection)) sections.set(nextSection, []);
      continue;
    }
    const isProfileHeading = memberWords.length > 1 && resemblesMemberName(line);
    if (activeSection === "topSkills" && isProfileHeading) {
      activeSection = undefined;
      continue;
    }
    if (activeSection) sections.get(activeSection)?.push(line);
  }

  const nameIndex = lines.findIndex((line) => {
    return memberWords.length > 1 && resemblesMemberName(line);
  });
  const headline =
    nameIndex >= 0
      ? lines.slice(nameIndex + 1, nameIndex + 5).find((line) => {
          const lineWords = normalise(line).split(" ");
          return (
            !sectionKey(line) &&
            !/Indonesia|University|Universitas/i.test(line) &&
            !resemblesMemberName(line) &&
            !lineWords.some((word) => memberWords.includes(word))
          );
        })
      : undefined;
  const content = Object.entries(SECTION_CONFIG).flatMap(([key, config]) => {
    const value = sections.get(key)?.join("\n").trim();
    return value ? [{ ...config, content: value }] : [];
  });
  return { headline, sections: content, skills: (sections.get("topSkills") ?? []).slice(0, 8) };
}

function ProfilePortrait({ member }: { member: Member }) {
  const initials = member.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (
    <div className="profile-portrait relative aspect-[4/5] overflow-hidden bg-brand-blue-50 dark:bg-[#1b2944]">
      <div
        aria-hidden="true"
        className={`absolute -right-[22%] -top-[12%] size-[74%] rounded-full ${ACCENT_COLORS[member.accent]}`}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 size-[37%] border-l-[22px] border-t-[22px] border-white/70 dark:border-white/10"
      />
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 h-[58%] w-[22%] bg-[var(--ink)]/90 dark:bg-white/15"
      />
      {member.hasPortrait ? (
        <Image
          src={`/members/${member.slug}.png`}
          alt={`Portrait of ${member.name}`}
          fill
          sizes="(max-width: 1023px) 100vw, 42vw"
          className="object-contain object-bottom"
        />
      ) : (
        <span className="absolute inset-x-0 bottom-12 text-center font-display text-8xl font-semibold tracking-tighter text-[var(--ink)]/80 dark:text-white/80">
          {initials}
        </span>
      )}
      <span className="absolute bottom-6 left-6 font-mono text-[11px] tracking-[0.16em] text-[var(--ink)]/55 uppercase dark:text-white/55">
        MGM Laboratory
      </span>
    </div>
  );
}

function ProfileSection({
  icon: Icon,
  title,
  children,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="border-t border-[var(--line)] py-9 first:border-t-0 first:pt-0 dark:border-white/10">
      <div className="flex items-center gap-3">
        <Icon size={19} strokeWidth={2.25} className="text-brand-blue" />
        <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--ink)] dark:text-white">
          {title}
        </h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ExternalLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-3 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none dark:border-white/15 dark:text-white/70 dark:hover:text-white"
    >
      <Icon className="size-4" />
      {label}
      <ArrowUpRight size={14} strokeWidth={2.25} />
    </a>
  );
}

export function MemberProfile({ member }: { member: Member }) {
  const root = useRef<HTMLElement>(null);
  const [profile, setProfile] = useState<PublicProfile>();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/member-profiles/${member.slug}.json`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((data: PublicProfile | undefined) => setProfile(data))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setProfile(undefined);
      });
    return () => controller.abort();
  }, [member.slug]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const targets = element.querySelectorAll<HTMLElement>(".profile-reveal");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }
    const context = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.72, ease: "power3.out", stagger: 0.11 },
      );
    }, element);
    return () => context.revert();
  }, []);

  const parsed = useMemo(
    () => (profile ? parseProfile(member, profile.raw) : undefined),
    [member, profile],
  );
  const links = profile?.contacts;
  const visibleSkills = parsed?.skills.length ? parsed.skills : member.labFocus;
  const supportingSections = (parsed?.sections ?? []).filter((section) =>
    ["Top skills", "Languages", "Certifications", "Projects"].includes(section.title),
  );
  const careerSections = (parsed?.sections ?? []).filter((section) =>
    ["Experience", "Education", "Achievements"].includes(section.title),
  );

  return (
    <main ref={root} className="px-5 pb-20 pt-28 sm:px-8 sm:pt-32 lg:px-12 lg:pb-28">
      <div className="mx-auto max-w-[1280px]">
        <Link
          href="/member"
          className="profile-reveal inline-flex items-center gap-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:text-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none dark:text-white/65 dark:hover:text-brand-blue"
        >
          <ArrowLeft size={18} strokeWidth={2.25} />
          All members
        </Link>
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.18fr)] lg:gap-20">
          <div className="profile-reveal self-start lg:sticky lg:top-24">
            <ProfilePortrait member={member} />
          </div>
          <div className="min-w-0 pt-1">
            <p className="profile-reveal font-mono text-xs tracking-[0.16em] text-brand-blue uppercase">
              {member.division}
            </p>
            <h1 className="profile-reveal mt-3 font-display text-[clamp(2.75rem,6vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.05em] text-[var(--ink)] dark:text-white">
              {member.name}
            </h1>
            <p className="profile-reveal mt-4 text-lg font-medium text-brand-blue">
              {parsed?.headline ?? member.role}
            </p>
            <p className="profile-reveal mt-7 max-w-2xl text-lg leading-8 text-[var(--ink-2)] dark:text-white/70">
              {parsed?.sections.find((section) => section.title === "About")?.content ?? member.bio}
            </p>
            <div className="profile-reveal mt-10 flex flex-wrap gap-2">
              {visibleSkills.slice(0, 8).map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink-2)] dark:border-white/15 dark:text-white/70"
                >
                  {skill}
                </span>
              ))}
            </div>
            {links ? (
              <div className="profile-reveal mt-8 flex flex-wrap gap-2">
                {links.personalWebsite ? (
                  <ExternalLink href={links.personalWebsite} icon={Globe2} label="Website" />
                ) : null}
                {links.portfolio ? (
                  <ExternalLink href={links.portfolio} icon={FolderKanban} label="Portfolio" />
                ) : null}
                {links.github ? (
                  <ExternalLink href={links.github} icon={GithubGlyph} label="GitHub" />
                ) : null}
                {links.linkedin ? (
                  <ExternalLink href={links.linkedin} icon={LinkedinGlyph} label="LinkedIn" />
                ) : null}
                {links.primaryEmail ? (
                  <ExternalLink href={`mailto:${links.primaryEmail}`} icon={Mail} label="Email" />
                ) : null}
                {links.labEmail && links.labEmail !== links.primaryEmail ? (
                  <ExternalLink href={`mailto:${links.labEmail}`} icon={Mail} label="Lab email" />
                ) : null}
                {links.phone ? (
                  <ExternalLink href={`tel:+${links.phone}`} icon={Phone} label="Phone" />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="profile-reveal mt-20 grid gap-x-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-y-0">
          <div className="lg:border-r lg:border-[var(--line)] lg:pr-14 dark:border-white/10">
            <ProfileSection icon={Sparkles} title="Professional profile">
              <p className="max-w-md text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
                {profile
                  ? "Published from this member’s submitted LinkedIn profile export and roster links."
                  : "Loading this member’s published professional profile."}
              </p>
              {profile?.identifiers.nim ? (
                <p className="mt-3 font-mono text-xs text-brand-blue">
                  NIM · {profile.identifiers.nim}
                </p>
              ) : null}
            </ProfileSection>
            {supportingSections.map((section) => (
              <ProfileSection key={section.title} icon={section.icon} title={section.title}>
                <p className="whitespace-pre-line text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
                  {section.content}
                </p>
              </ProfileSection>
            ))}
          </div>
          <div className="lg:pl-14">
            {careerSections.map((section) => (
              <ProfileSection key={section.title} icon={section.icon} title={section.title}>
                <p className="whitespace-pre-line text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
                  {section.content}
                </p>
              </ProfileSection>
            ))}
            {!profile ? (
              <ProfileSection icon={BriefcaseBusiness} title="Experience">
                <div className="h-16 animate-pulse rounded-xl bg-black/[0.045] dark:bg-white/[0.06]" />
              </ProfileSection>
            ) : null}
            <Link
              href="/contact"
              className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-brand-blue transition-colors hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none dark:hover:text-white"
            >
              Contact MGM Laboratory
              <ArrowUpRight size={17} strokeWidth={2.25} />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
