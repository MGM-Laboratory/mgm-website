"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  FolderKanban,
  Globe2,
  GraduationCap,
  Languages,
  Mail,
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

import { GithubGlyph, LinkedinGlyph, WhatsappGlyph } from "@/components/social-icons";
import type { Member } from "@/data/members";
import { useMemberRecords } from "@/hooks/use-member-records";
import type { CmsMemberProfile, CmsMemberRecord } from "@/lib/member-cms";

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
  raw: string;
};
type DatePart = { month: number; year: number };
type Experience = {
  company: string;
  description?: string;
  end?: DatePart;
  isCurrent: boolean;
  location?: string;
  start?: DatePart;
  title: string;
};
type Education = { detail?: string; institution: string };
type ProfileData = {
  achievements: string[];
  bio: string;
  certifications: string[];
  education: Education[];
  experience: Experience[];
  languages: string[];
  projects: string[];
  skills: string[];
};
type SectionKey =
  | "achievements"
  | "certifications"
  | "education"
  | "experience"
  | "languages"
  | "projects"
  | "summary"
  | "topSkills";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const MONTH_LOOKUP = new Map(MONTHS.map((month, index) => [month.toLowerCase(), index]));
const MONTH_PATTERN = MONTHS.join("|");
const PERIOD = new RegExp(
  `(${MONTH_PATTERN})\\s+(\\d{4})\\s*-\\s*(Present|(?:${MONTH_PATTERN})\\s+\\d{4})(?:\\s*\\([^)]*\\))?`,
  "i",
);
const SECTIONS: readonly [RegExp, SectionKey][] = [
  [/^(?:summary|ringkasan)\b/i, "summary"],
  [/^(?:top skills|keahlian teratas)\b/i, "topSkills"],
  [/^(?:experience|pengalaman)\b/i, "experience"],
  [/^(?:education|pendidikan)\b/i, "education"],
  [/^(?:languages|bahasa)\b/i, "languages"],
  [/^(?:honors?-?awards?|penghargaan)\b/i, "achievements"],
  [/^(?:certifications?|sertifikasi)\b/i, "certifications"],
  [/^(?:projects?|proyek)\b/i, "projects"],
];
const COMPANY =
  /\b(?:agency|arunika|bem|biznet|community|company|faculty|filkom|foundation|gdsc|himpunan|inc\.?|kaia|kaizin|laboratory|laboratorium|ltd\.?|mgm|organizer|pt\.?|school|sekawan|suitmedia|tedx|university|universitas|upwork|yorusa)\b/i;
const LOCATION =
  /\b(?:indonesia|jakarta|malang|surabaya|yogyakarta|bandung|bali|batang|pekalongan|czechia|prague|makassar|sidoarjo|greater)\b/i;
const LANGUAGE =
  /\((?:native|limited|elementary|professional|full professional|working|bilingual|intermediate)/i;
const ACHIEVEMENT =
  /\b(?:\d+(?:st|nd|rd|th)\s+(?:place|honorable)|first\s+place|second\s+place|third\s+place|finalist|winner|award|medal|champion|recognition|top\s+\d+)\b/i;
const ACCENT_COLORS = {
  blue: "bg-brand-blue",
  green: "bg-brand-green",
  red: "bg-brand-red",
  yellow: "bg-brand-yellow",
} as const;

function clean(value: string) {
  return value
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
function unique(values: readonly string[]) {
  return Array.from(
    new Map(
      values
        .map(clean)
        .filter(Boolean)
        .map((value) => [value.toLocaleLowerCase(), value]),
    ).values(),
  );
}
function lines(raw: string) {
  return raw.split("\n").map(clean);
}
function section(line: string): { content: string; key: SectionKey } | undefined {
  for (const [pattern, key] of SECTIONS) {
    const match = line.match(pattern);
    if (match) return { content: clean(line.slice(match[0].length)), key };
  }
  return undefined;
}
function sectionLines(member: Member, raw: string, target: SectionKey) {
  const memberWords = member.name
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 2);
  const resemblesMember = (value: string) =>
    memberWords.length > 0 &&
    memberWords.filter((word) => value.toLocaleLowerCase().includes(word)).length /
      memberWords.length >=
      0.6;
  const output: string[] = [];
  let capturing = false;
  for (const line of lines(raw)) {
    const heading = section(line);
    if (heading) {
      capturing = heading.key === target;
      if (capturing && heading.content) output.push(heading.content);
      continue;
    }
    if (capturing && resemblesMember(line)) break;
    if (capturing && line) output.push(line);
  }
  return output;
}
function parseDate(value: string): DatePart | undefined {
  const match = value.match(new RegExp(`^(${MONTH_PATTERN})\\s+(\\d{4})$`, "i"));
  const month = match ? MONTH_LOOKUP.get(match[1].toLocaleLowerCase()) : undefined;
  return month === undefined || !match ? undefined : { month, year: Number(match[2]) };
}
function locationFrom(value: string) {
  if (!LOCATION.test(value)) return undefined;
  const match = clean(value).match(
    /^(.*?(?:Indonesia|Czechia|Jakarta|Malang|Surabaya|Yogyakarta|Bandung|Bali|Batang|Pekalongan|Makassar|Sidoarjo))(?:\s|$)/i,
  );
  const result = clean(match?.[1] ?? value);
  return result.length <= 90 ? result : undefined;
}
function isLocationOnly(value: string) {
  return /^(?:(?:greater )?(?:jakarta|malang|surabaya|yogyakarta|bandung|bali|batang|pekalongan|makassar|sidoarjo|prague)(?:,? (?:east|west|central) java)?(?:,? indonesia)?|czechia|indonesia)$/i.test(
    clean(value),
  );
}
function isNoise(value: string) {
  const wordCount = value.split(" ").filter(Boolean).length;
  return (
    !value ||
    Boolean(section(value)) ||
    LANGUAGE.test(value) ||
    ACHIEVEMENT.test(value) ||
    /^\d+\s+(?:years?|months?)(?:\s+\d+\s+months?)?$/i.test(value) ||
    /^(?:https?:\/\/|www\.|contact$)/i.test(value) ||
    value.length > 180 ||
    wordCount > 14 ||
    (wordCount > 8 && /[,.]/.test(value) && !/^PT\./i.test(value)) ||
    (wordCount > 1 && /\.$/.test(value) && !/^PT\./i.test(value)) ||
    (/^[a-z]/.test(value) && !COMPANY.test(value))
  );
}
function parseExperience(raw: string) {
  const all = lines(raw);
  const start = all.findIndex((line) => section(line)?.key === "experience");
  if (start < 0) return [];
  const end = all.findIndex((line, index) => index > start && section(line)?.key === "education");
  const scope = all.slice(start + 1, end < 0 ? undefined : end);
  const dates = scope
    .map((line, index) => ({ index, match: line.match(PERIOD) }))
    .filter((value): value is { index: number; match: RegExpMatchArray } => Boolean(value.match));
  let currentCompany: string | undefined;
  return dates.flatMap((date, index): Experience[] => {
    const previous = dates[index - 1]?.index ?? -1;
    const next = dates[index + 1]?.index ?? scope.length;
    const beforeSource = scope.slice(previous + 1, date.index);
    const before = beforeSource.filter(
      (line, lineIndex) =>
        !isNoise(line) &&
        !(lineIndex > 0 && isNoise(beforeSource[lineIndex - 1]) && /^\(/.test(line)),
    );
    const title = before.at(-1);
    if (!title) return [];
    const directCompany = before.at(-2);
    const directCompanyIsPlausible =
      directCompany &&
      !/[,.]/.test(directCompany.replace(/^PT\./i, "")) &&
      (COMPANY.test(directCompany) ||
        (!isLocationOnly(directCompany) && directCompany.split(" ").length <= 6));
    const company =
      !currentCompany || directCompanyIsPlausible
        ? clean(directCompany ?? currentCompany ?? "")
        : currentCompany;
    if (!company) return [];
    currentCompany = clean(company);
    const [full, startMonth, startYear, endValue] = date.match;
    const inline = clean(scope[date.index].slice(scope[date.index].indexOf(full) + full.length));
    const laterLocation = scope
      .slice(date.index + 1, next)
      .map(locationFrom)
      .find(Boolean);
    const endDate = endValue.toLocaleLowerCase() === "present" ? undefined : parseDate(endValue);
    return [
      {
        company: currentCompany,
        end: endDate,
        isCurrent: !endDate,
        location: locationFrom(inline) ?? laterLocation,
        start: parseDate(`${startMonth} ${startYear}`),
        title: clean(title),
      },
    ];
  });
}
function parseEducation(member: Member, raw: string) {
  const institution = /\b(?:universit(?:as|y)|school|sma|smk|college|academy|institut(?:e|ut))\b/i;
  const output: Education[] = [];
  let current: Education | undefined;
  for (const line of sectionLines(member, raw, "education")) {
    if (institution.test(line) || !current) {
      if (current) output.push(current);
      current = { institution: line };
    } else {
      current.detail = clean(`${current.detail ?? ""} ${line}`);
    }
  }
  if (current) output.push(current);
  return output;
}
// The importer owns persistence now; this remains as a legacy fallback parser for archived records.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseProfile(member: Member, raw: string): ProfileData {
  const summary = sectionLines(member, raw, "summary");
  const skills = unique(sectionLines(member, raw, "topSkills")).slice(0, 12);
  const languages = unique([
    ...sectionLines(member, raw, "languages"),
    ...lines(raw).filter((line) => LANGUAGE.test(line)),
  ]).slice(0, 8);
  const achievements = unique([
    ...sectionLines(member, raw, "achievements"),
    ...lines(raw).filter((line) => ACHIEVEMENT.test(line)),
  ]).slice(0, 12);
  const list = (key: "certifications" | "projects") =>
    unique(sectionLines(member, raw, key))
      .filter((item) => item.length < 180)
      .slice(0, 12);
  return {
    achievements,
    bio: clean(summary.join(" ")) || member.bio,
    certifications: list("certifications"),
    education: parseEducation(member, raw),
    experience: parseExperience(raw),
    languages,
    projects: list("projects"),
    skills: skills.length ? skills : [...member.labFocus],
  };
}
function formatPeriod(item: Experience, now: Date) {
  if (!item.start) return item.isCurrent ? "Present" : "Timeline unavailable";
  const end = item.end ?? { month: now.getMonth(), year: now.getFullYear() };
  const count = Math.max(1, (end.year - item.start.year) * 12 + end.month - item.start.month + 1);
  const years = Math.floor(count / 12);
  const months = count % 12;
  const duration = years
    ? `${years} year${years === 1 ? "" : "s"}${months ? ` ${months} month${months === 1 ? "" : "s"}` : ""}`
    : `${months} month${months === 1 ? "" : "s"}`;
  return `${MONTHS[item.start.month]} ${item.start.year} - ${item.isCurrent ? "Present" : `${MONTHS[end.month]} ${end.year}`} (${duration})`;
}
function useCurrentMonth() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 1);
    const timer = window.setTimeout(
      () => setNow(new Date()),
      Math.max(1_000, next.getTime() - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [now]);
  return now;
}

function ProfilePortrait({
  member,
  photoKey,
  photoPosition,
  sourceSlug,
}: {
  member: Member;
  photoKey?: string;
  photoPosition?: CmsMemberProfile["photoPosition"];
  sourceSlug?: string;
}) {
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
      {photoKey || member.hasPortrait ? (
        // Uploaded portraits resolve through a short-lived signed storage URL.
        // The browser can follow it directly; the Next image optimizer rejects it.
        <Image
          src={
            photoKey
              ? `/api/member-cms/media/${photoKey}`
              : `/members/${sourceSlug ?? member.slug}.png`
          }
          alt={`Portrait of ${member.name}`}
          fill
          key={photoKey ?? sourceSlug ?? member.slug}
          sizes="(max-width: 1023px) 100vw, 30vw"
          unoptimized={Boolean(photoKey)}
          className={photoKey ? "object-cover" : "object-contain object-bottom"}
          style={
            photoKey && photoPosition
              ? {
                  objectPosition: `${photoPosition.x}% ${photoPosition.y}%`,
                  transform: `scale(${photoPosition.zoom})`,
                }
              : undefined
          }
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
  children,
  icon: Icon,
  title,
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
  const external = /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      {...(external ? { rel: "noreferrer", target: "_blank" } : {})}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-3 py-2 text-sm font-medium text-[var(--ink-2)] transition-[border-color,color,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-blue hover:text-brand-blue active:translate-y-0 focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none dark:border-white/15 dark:text-white/70 dark:hover:text-white"
    >
      <Icon className="size-4" />
      {label}
      {external ? <ArrowUpRight size={14} strokeWidth={2.25} /> : null}
    </a>
  );
}
function ContactLinks({
  profile,
  links = [],
}: {
  links?: NonNullable<CmsMemberProfile["links"]>;
  profile: PublicProfile;
}) {
  const { contacts } = profile;
  const whatsappNumber = contacts.phone?.replace(/\D/g, "");
  const whatsappHref = whatsappNumber
    ? `https://api.whatsapp.com/send/?phone=${whatsappNumber.startsWith("0") ? `62${whatsappNumber.slice(1)}` : whatsappNumber}`
    : undefined;
  const primaryEmail =
    contacts.primaryEmail && !contacts.primaryEmail.toLocaleLowerCase().endsWith("@labmgm.org")
      ? contacts.primaryEmail
      : undefined;
  const iconForLink = (label: string, href: string): ComponentType<{ className?: string }> => {
    const identity = `${label} ${href}`.toLocaleLowerCase();
    if (identity.includes("github")) return GithubGlyph;
    if (identity.includes("linkedin")) return LinkedinGlyph;
    if (identity.includes("whatsapp") || identity.includes("wa.me")) return WhatsappGlyph;
    if (identity.includes("mailto:")) return Mail;
    return Globe2;
  };
  return (
    <div className="mt-5">
      <p className="font-mono text-[11px] tracking-[0.14em] text-brand-blue uppercase">Connect</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {contacts.personalWebsite ? (
          <ExternalLink href={contacts.personalWebsite} icon={Globe2} label="Website" />
        ) : null}
        {contacts.portfolio ? (
          <ExternalLink href={contacts.portfolio} icon={FolderKanban} label="Portfolio" />
        ) : null}
        {contacts.github ? (
          <ExternalLink href={contacts.github} icon={GithubGlyph} label="GitHub" />
        ) : null}
        {contacts.linkedin ? (
          <ExternalLink href={contacts.linkedin} icon={LinkedinGlyph} label="LinkedIn" />
        ) : null}
        {primaryEmail ? (
          <ExternalLink href={`mailto:${primaryEmail}`} icon={Mail} label="Email" />
        ) : null}
        {whatsappHref ? (
          <ExternalLink href={whatsappHref} icon={WhatsappGlyph} label="WhatsApp" />
        ) : null}
        {links
          .filter((link) => link.url && link.label)
          .map((link) => (
            <ExternalLink
              href={link.url}
              icon={iconForLink(link.label, link.url)}
              key={`${link.label}-${link.url}`}
              label={link.label}
            />
          ))}
      </div>
    </div>
  );
}
function Bio({ value }: { value: string }) {
  return (
    <div className="mt-6 max-w-3xl">
      <p className="text-lg leading-8 text-[var(--ink-2)] dark:text-white/70">{value}</p>
    </div>
  );
}
function ExperienceList({ items, now }: { items: readonly Experience[]; now: Date }) {
  if (!items.length)
    return (
      <p className="text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
        No public experience has been listed yet.
      </p>
    );
  const groups = items.reduce<Experience[][]>((all, item) => {
    const existing = all.find(
      (group) => group[0]?.company.toLocaleLowerCase() === item.company.toLocaleLowerCase(),
    );
    if (existing) existing.push(item);
    else all.push([item]);
    return all;
  }, []);
  return (
    <ol className="grid gap-6">
      {groups.map((group, groupIndex) => (
        <li
          key={`${group[0]?.company}-${groupIndex}`}
          className="rounded-2xl border border-[var(--line)] bg-white/35 p-5 transition-colors hover:border-brand-blue/50 dark:border-white/10 dark:bg-white/[0.025]"
        >
          <h3 className="font-display text-2xl font-semibold tracking-tight text-[var(--ink)] dark:text-white">
            {group[0]?.company}
          </h3>
          <ol className="mt-5 grid gap-5 border-l-2 border-brand-blue/70 pl-5 dark:border-brand-blue-50">
            {group.map((item, index) => (
              <li key={`${item.title}-${index}`} className="grid gap-2">
                <h4 className="font-display text-xl font-semibold tracking-tight text-[var(--ink)] dark:text-white">
                  {item.title}
                </h4>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--ink-2)] dark:text-white/70">
                  <span>{formatPeriod(item, now)}</span>
                  {item.location ? <span>{item.location}</span> : null}
                </div>
                {item.description ? (
                  <p className="max-w-3xl text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
                    {item.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}
function EducationList({ items }: { items: readonly Education[] }) {
  if (!items.length)
    return (
      <p className="text-sm text-[var(--ink-2)] dark:text-white/65">
        No public education history has been listed yet.
      </p>
    );
  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <article
          key={`${item.institution}-${index}`}
          className="rounded-2xl border border-[var(--line)] p-4 dark:border-white/10"
        >
          <h3 className="font-medium text-[var(--ink)] dark:text-white">{item.institution}</h3>
          {item.detail ? (
            <p className="mt-1 text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
              {item.detail}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
function DetailList({ items }: { items: readonly string[] }) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-2xl border border-[var(--line)] px-4 py-3 text-sm leading-6 text-[var(--ink-2)] dark:border-white/10 dark:text-white/65"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function MemberProfile({
  initialRecords = [],
  member,
}: {
  initialRecords?: readonly CmsMemberRecord[];
  member: Member;
}) {
  const root = useRef<HTMLElement>(null);
  const { records } = useMemberRecords(initialRecords);
  const override = records.find((record) => record.slug === member.slug);
  const effectiveMember = override?.member ?? member;
  const cmsProfile = override?.profile;
  const now = useCurrentMonth();
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
  const parsed = useMemo<ProfileData | undefined>(() => undefined, []);
  const displayed = useMemo(
    () => ({
      ...parsed,
      achievements: cmsProfile?.achievements
        ? cmsProfile.achievements.map((item) =>
            [item.title, item.issuer, item.description].filter(Boolean).join(" · "),
          )
        : (parsed?.achievements ?? []),
      bio: cmsProfile?.bio?.trim() ?? parsed?.bio ?? effectiveMember.bio,
      certifications: cmsProfile?.certificates
        ? cmsProfile.certificates.map((item) =>
            [item.title, item.issuer].filter(Boolean).join(" · "),
          )
        : (parsed?.certifications ?? []),
      education: cmsProfile?.education
        ? cmsProfile.education.map((item) => ({
            detail: [item.degree, item.detail].filter(Boolean).join(" · "),
            institution: item.institution,
          }))
        : (parsed?.education ?? []),
      experience: cmsProfile?.experience
        ? cmsProfile.experience.map((item) => ({
            company: item.company,
            description: item.description,
            end: item.end,
            isCurrent: Boolean(item.current),
            location: item.location,
            start: item.start,
            title: item.title,
          }))
        : (parsed?.experience ?? []),
      languages: cmsProfile?.languages
        ? cmsProfile.languages.map((item) =>
            [item.name, item.proficiency].filter(Boolean).join(" · "),
          )
        : (parsed?.languages ?? []),
      projects: cmsProfile?.projects ?? parsed?.projects ?? [],
      skills: cmsProfile?.skills ?? parsed?.skills ?? [...effectiveMember.labFocus],
    }),
    [cmsProfile, effectiveMember.bio, effectiveMember.labFocus, parsed],
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
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(19rem,0.75fr)_minmax(0,1.25fr)] lg:gap-20">
          <aside className="profile-reveal self-start lg:sticky lg:top-24">
            <ProfilePortrait
              member={effectiveMember}
              photoKey={cmsProfile?.photoKey}
              photoPosition={cmsProfile?.photoPosition}
              sourceSlug={override?.sourceSlug}
            />
            <ContactLinks links={cmsProfile?.links} profile={{ contacts: {}, raw: "" }} />
          </aside>
          <header className="min-w-0 self-start">
            <h1 className="profile-reveal font-display text-[clamp(2.75rem,6vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.05em] text-[var(--ink)] dark:text-white">
              {effectiveMember.name}
            </h1>
            <div className="profile-reveal">
              <Bio value={displayed.bio} />
            </div>
          </header>
        </div>
        <div className="profile-reveal mt-20">
          <ProfileSection icon={BriefcaseBusiness} title="Experience">
            <ExperienceList items={displayed.experience} now={now} />
          </ProfileSection>
        </div>
        <div className="profile-reveal grid gap-x-14 lg:grid-cols-2 lg:gap-y-0">
          <div className="lg:border-r lg:border-[var(--line)] lg:pr-14 dark:border-white/10">
            <ProfileSection icon={GraduationCap} title="Education">
              <EducationList items={displayed.education} />
            </ProfileSection>
            <ProfileSection icon={Sparkles} title="Skills">
              <div className="flex flex-wrap gap-2">
                {displayed.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink-2)] dark:border-white/15 dark:text-white/70"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </ProfileSection>
            {displayed.languages.length ? (
              <ProfileSection icon={Languages} title="Languages">
                <DetailList items={displayed.languages} />
              </ProfileSection>
            ) : null}
          </div>
          <div className="lg:pl-14">
            {displayed.achievements.length ? (
              <ProfileSection icon={BadgeCheck} title="Achievements">
                <DetailList items={displayed.achievements} />
              </ProfileSection>
            ) : null}
            {displayed.certifications.length ? (
              <ProfileSection icon={BadgeCheck} title="Certifications">
                <DetailList items={displayed.certifications} />
              </ProfileSection>
            ) : null}
            {displayed.projects.length ? (
              <ProfileSection icon={FolderKanban} title="Projects">
                <DetailList items={displayed.projects} />
              </ProfileSection>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

export function MemberProfileBySlug({
  initialRecords = [],
  slug,
}: {
  initialRecords?: readonly CmsMemberRecord[];
  slug: string;
}) {
  const { members, ready, records } = useMemberRecords(initialRecords);
  const member = members.find((candidate) => candidate.slug === slug);
  if (!member) {
    return (
      <main className="grid min-h-[100dvh] place-items-center px-6 pt-16 text-sm text-[var(--ink-2)] dark:text-white/65">
        {ready ? "This member profile is not available." : "Loading member profile…"}
      </main>
    );
  }
  return <MemberProfile initialRecords={records} member={member} />;
}
