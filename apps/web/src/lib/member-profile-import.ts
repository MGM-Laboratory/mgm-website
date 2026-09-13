import type { Member } from "@/data/members";
import type {
  CmsAchievement,
  CmsCertificate,
  CmsEducation,
  CmsExperience,
  CmsLanguage,
} from "@/lib/member-cms";

type Section =
  | "achievements"
  | "certificates"
  | "education"
  | "experience"
  | "languages"
  | "projects"
  | "summary"
  | "skills";
type DatePart = { month: number; year: number };

export type ImportedMemberProfile = {
  achievements: CmsAchievement[];
  bio: string;
  certificates: CmsCertificate[];
  education: CmsEducation[];
  experience: CmsExperience[];
  languages: CmsLanguage[];
  projects: string[];
  skills: string[];
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;
const MONTH_LOOKUP = new Map<string, number>(MONTHS.map((month, index) => [month, index]));
const MONTH_PATTERN = MONTHS.join("|");
const PERIOD = new RegExp(
  `(${MONTH_PATTERN})\\s+(\\d{4})\\s*-\\s*(present|(?:${MONTH_PATTERN})\\s+\\d{4})(?:\\s*\\([^)]*\\))?`,
  "i",
);
const SECTIONS: readonly [RegExp, Section][] = [
  [/^(?:summary|ringkasan)\b/i, "summary"],
  [/^(?:top skills|keahlian teratas)\b/i, "skills"],
  [/^(?:experience|pengalaman)\b/i, "experience"],
  [/^(?:education|pendidikan)\b/i, "education"],
  [/^(?:languages|bahasa)\b/i, "languages"],
  [/^(?:honors?-?awards?|penghargaan)\b/i, "achievements"],
  [/^(?:certifications?|sertifikasi)\b/i, "certificates"],
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

function allLines(raw: string) {
  return raw.split("\n").map(clean);
}

function section(line: string): { content: string; key: Section } | undefined {
  for (const [pattern, key] of SECTIONS) {
    const match = line.match(pattern);
    if (match) return { content: clean(line.slice(match[0].length)), key };
  }
  return undefined;
}

function sectionLines(member: Member, raw: string, target: Section) {
  const nameWords = member.name
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 2);
  const resemblesMember = (value: string) =>
    nameWords.length > 0 &&
    nameWords.filter((word) => value.toLocaleLowerCase().includes(word)).length /
      nameWords.length >=
      0.6;
  const output: string[] = [];
  let capturing = false;
  for (const line of allLines(raw)) {
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

function parseExperience(raw: string): CmsExperience[] {
  const lines = allLines(raw);
  const start = lines.findIndex((line) => section(line)?.key === "experience");
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && section(line)?.key === "education");
  const scope = lines.slice(start + 1, end < 0 ? undefined : end);
  const dates = scope
    .map((line, index) => ({ index, match: line.match(PERIOD) }))
    .filter((value): value is { index: number; match: RegExpMatchArray } => Boolean(value.match));
  let currentCompany: string | undefined;
  return dates.flatMap((date, index): CmsExperience[] => {
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
        current: !endDate,
        end: endDate,
        location: locationFrom(inline) ?? laterLocation,
        start: parseDate(`${startMonth} ${startYear}`),
        title: clean(title),
      },
    ];
  });
}

function parseEducation(member: Member, raw: string): CmsEducation[] {
  const institution = /\b(?:universit(?:as|y)|school|sma|smk|college|academy|institut(?:e|ut))\b/i;
  const output: CmsEducation[] = [];
  let current: CmsEducation | undefined;
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

function toLanguage(value: string): CmsLanguage {
  const match = value.match(/^(.*?)\s*\(([^)]+)\)$/);
  return match ? { name: clean(match[1]), proficiency: clean(match[2]) } : { name: value };
}

export function importPublicMemberProfile(member: Member, raw: string): ImportedMemberProfile {
  const summary = sectionLines(member, raw, "summary");
  const skills = unique(sectionLines(member, raw, "skills")).slice(0, 24);
  const languages = unique([
    ...sectionLines(member, raw, "languages"),
    ...allLines(raw).filter((line) => LANGUAGE.test(line)),
  ]).slice(0, 16);
  const achievements = unique([
    ...sectionLines(member, raw, "achievements"),
    ...allLines(raw).filter((line) => ACHIEVEMENT.test(line)),
  ]).slice(0, 24);
  const collection = (key: "certificates" | "projects") =>
    unique(sectionLines(member, raw, key))
      .filter((item) => item.length < 180)
      .slice(0, 24);
  return {
    achievements: achievements.map((title) => ({ title })),
    bio: clean(summary.join(" ")) || member.bio,
    certificates: collection("certificates").map((title) => ({ title })),
    education: parseEducation(member, raw),
    experience: parseExperience(raw),
    languages: languages.map(toLanguage).filter((item) => item.name),
    projects: collection("projects"),
    skills: skills.length ? skills : [...member.labFocus],
  };
}
