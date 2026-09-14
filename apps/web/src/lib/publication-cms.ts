/** Shared types and citation tooling for the publications editorial workflow. */

export type PublicationType =
  "journal-article" | "conference-paper" | "preprint" | "book-chapter" | "book" | "thesis";

export type PublicationAuthorKind = "residence" | "non-residence";

export type PublicationAuthor = {
  id: string;
  /** Residence authors resolve through the member CMS; non-residence
   *  authors carry their own portrait and public link. Omitted on older
   *  records, where the presence of memberSlug decides. */
  kind?: PublicationAuthorKind;
  name: string;
  /** Organization the author is affiliated with, shown as a footnote. */
  affiliation?: string;
  /** Lab member link (residence authors). */
  memberSlug?: string;
  /** Public click target for the author's name and portrait (non-residence). */
  url?: string;
  /** Uploaded portrait storage key (non-residence). */
  photoKey?: string;
  /** Crop framing for the uploaded portrait. */
  photoPosition?: { x: number; y: number; zoom: number };
};

/** Legacy records decide residence by the presence of a member link. */
export function authorKind(author: PublicationAuthor): PublicationAuthorKind {
  if (author.kind) return author.kind;
  return author.memberSlug ? "residence" : "non-residence";
}

export type PublicationDraft = {
  slug: string;
  title: string;
  type: PublicationType;
  date: string;
  /** Venue: journal name, conference, book title, or series. */
  journal: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  url?: string;
  license?: string;
  keywords: string[];
  abstract: string;
  authors: PublicationAuthor[];
  draft: boolean;
  /** S3 media key, or a `static/<public-path>` key for bundled seed papers. */
  paperKey?: string;
  paperName?: string;
  paperSize?: number;
};

export type CmsPublicationRecord = {
  publication: PublicationDraft;
  slug: string;
  updatedAt?: string;
};

export const PUBLICATION_TYPES: {
  id: PublicationType;
  label: string;
  bibtex: string;
  ris: string;
}[] = [
  { id: "journal-article", label: "Journal Article", bibtex: "article", ris: "JOUR" },
  { id: "conference-paper", label: "Conference Paper", bibtex: "inproceedings", ris: "CONF" },
  { id: "preprint", label: "Preprint", bibtex: "misc", ris: "ELEC" },
  { id: "book-chapter", label: "Book Chapter", bibtex: "incollection", ris: "CHAP" },
  { id: "book", label: "Book", bibtex: "book", ris: "BOOK" },
  { id: "thesis", label: "Thesis", bibtex: "phdthesis", ris: "THES" },
];

export const LICENSE_OPTIONS = [
  "CC BY 4.0",
  "CC BY-SA 4.0",
  "CC BY-NC 4.0",
  "CC BY-ND 4.0",
  "CC BY-NC-SA 4.0",
  "CC BY-NC-ND 4.0",
  "All rights reserved",
];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isPublicationSlug(value: string) {
  return SLUG_PATTERN.test(value);
}

export function publicationTypeLabel(type: PublicationType) {
  return PUBLICATION_TYPES.find((entry) => entry.id === type)?.label ?? type;
}

export function emptyPublicationDraft(): PublicationDraft {
  return {
    slug: "",
    title: "",
    type: "journal-article",
    date: new Date().toISOString().slice(0, 10),
    journal: "",
    keywords: [],
    abstract: "",
    authors: [],
    draft: true,
  };
}

export function draftToPublication(draft: PublicationDraft): PublicationDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    journal: draft.journal?.trim() || "",
    volume: draft.volume?.trim() || undefined,
    issue: draft.issue?.trim() || undefined,
    pages: draft.pages?.trim() || undefined,
    publisher: draft.publisher?.trim() || undefined,
    doi: draft.doi?.trim() || undefined,
    url: draft.url?.trim() || undefined,
    license: draft.license?.trim() || undefined,
    keywords: [...new Set(draft.keywords.map((keyword) => keyword.trim()).filter(Boolean))],
    abstract: draft.abstract.trim(),
    authors: draft.authors
      .map((author) => ({
        ...author,
        name: author.name.trim(),
        affiliation: author.affiliation?.trim() || undefined,
        url: author.url?.trim() || undefined,
      }))
      .filter((author) => Boolean(author.name)),
  };
}

export function publicationToDraft(publication: PublicationDraft): PublicationDraft {
  return {
    ...publication,
    journal: publication.journal ?? "",
    volume: publication.volume ?? "",
    issue: publication.issue ?? "",
    pages: publication.pages ?? "",
    publisher: publication.publisher ?? "",
    doi: publication.doi ?? "",
    url: publication.url ?? "",
    license: publication.license ?? "",
    keywords: [...publication.keywords],
    abstract: publication.abstract ?? "",
    authors: publication.authors.map((author) => ({
      ...author,
      kind: authorKind(author),
      affiliation: author.affiliation ?? "",
      url: author.url ?? "",
    })),
  };
}

export function publishedPublications(records: readonly CmsPublicationRecord[]) {
  return records
    .filter((record) => !record.publication.draft)
    .sort((left, right) => right.publication.date.localeCompare(left.publication.date));
}

/** Resolves a paper key to a loadable URL — bundled seed papers or CMS storage. */
export function publicationPaperUrl(paperKey?: string) {
  if (!paperKey) return undefined;
  if (paperKey.startsWith("static/")) return `/${paperKey.slice("static/".length)}`;
  return `/api/publications-cms/paper/${encodeURIComponent(paperKey)}`;
}

/** Resolves an author portrait key to a loadable URL. */
export function authorPhotoUrl(photoKey?: string) {
  if (!photoKey) return undefined;
  return `/api/publications-cms/media/${encodeURIComponent(photoKey)}`;
}

export function doiUrl(doi?: string) {
  if (!doi) return undefined;
  return `https://doi.org/${doi}`;
}

/** Formats an ISO date the way the article template does: "Sabtu, 31 Agustus 2024".
 *  Year-only dates (older records whose month and day were never stated)
 *  render as just the year. */
export function formatPublicationDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year) return value;
  if (!month || !day) return String(year);
  return new Date(year, month - 1, day).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatPaperSize(bytes?: number) {
  if (!bytes) return undefined;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------------------
// Citation tooling. Author names are stored in display order as plain full
// names ("First Middle Last"); every format below derives its own convention
// (initials, family-first) from that single source of truth.
// ---------------------------------------------------------------------------

type ParsedName = { given: string[]; family: string };

function splitName(name: string): ParsedName {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { given: [], family: parts[0] ?? "" };
  return { given: parts.slice(0, -1), family: parts[parts.length - 1] };
}

function initials(name: ParsedName) {
  return name.given.map((part) => `${part[0]}.`).join(" ");
}

function lastNameFirst(name: ParsedName) {
  return initials(name) ? `${name.family}, ${initials(name)}` : name.family;
}

function familyNameFirst(name: ParsedName) {
  return name.given.length ? `${name.family}, ${name.given.join(" ")}` : name.family;
}

function initialsFirst(name: ParsedName) {
  return initials(name) ? `${initials(name)} ${name.family}` : name.family;
}

const parsedAuthors = (authors: readonly PublicationAuthor[]) =>
  authors.map((author) => splitName(author.name));

function joinWords(parts: string[], finalJoiner: string) {
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")}${finalJoiner}${parts[parts.length - 1]}`;
}

function apaAuthors(authors: readonly ParsedName[]) {
  const names = authors.map(lastNameFirst);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, & ${names[1]}`;
  if (names.length > 20) return `${names.slice(0, 19).join(", ")}, … ${names[names.length - 1]}`;
  return joinWords(names, ", & ");
}

function ieeeAuthors(authors: readonly ParsedName[]) {
  const names = authors.map(initialsFirst);
  if (names.length === 1) return names[0];
  return joinWords(names, ", and ");
}

function mlaAuthors(authors: readonly ParsedName[]) {
  if (!authors.length) return "";
  if (authors.length === 1) return familyNameFirst(authors[0]);
  if (authors.length === 2)
    return `${familyNameFirst(authors[0])}, and ${authors[1].given.join(" ")} ${authors[1].family}`;
  return `${familyNameFirst(authors[0])}, et al.`;
}

function chicagoAuthors(authors: readonly ParsedName[]) {
  if (!authors.length) return "";
  if (authors.length === 1) return familyNameFirst(authors[0]);
  if (authors.length === 2)
    return `${familyNameFirst(authors[0])}, and ${authors[1].given.join(" ")} ${authors[1].family}`;
  if (authors.length <= 10)
    return `${authors
      .map((author) => familyNameFirst(author))
      .slice(0, -1)
      .join(", ")}, and ${familyNameFirst(authors[authors.length - 1])}`;
  return `${familyNameFirst(authors[0])}, et al.`;
}

function bibtexAuthors(authors: readonly ParsedName[]) {
  return authors.map(familyNameFirst).join(" and ");
}

function paperYear(publication: PublicationDraft) {
  return publication.date.slice(0, 4) || publication.date;
}

function doiSuffix(publication: PublicationDraft) {
  const doi = doiUrl(publication.doi);
  return doi ?? publication.url;
}

export function apaCitation(publication: PublicationDraft) {
  const authors = parsedAuthors(publication.authors);
  const parts: string[] = [];
  parts.push(`${apaAuthors(authors)} (${paperYear(publication)}).`);
  let title = publication.title;
  if (!/[.!?]$/.test(title)) title += ".";
  parts.push(title);
  if (publication.journal) {
    const venue = [
      publication.journal,
      publication.volume &&
        `${publication.volume}${publication.issue ? `(${publication.issue})` : ""}`,
      publication.pages,
    ]
      .filter(Boolean)
      .join(", ");
    parts.push(`${venue}.`);
  } else {
    parts.push(`${publicationTypeLabel(publication.type)}.`);
  }
  const suffix = doiSuffix(publication);
  if (suffix) parts.push(suffix);
  return parts.join(" ");
}

export function ieeeCitation(publication: PublicationDraft) {
  const authors = parsedAuthors(publication.authors);
  const title = `${publication.title.replace(/[.!?]$/, "")}`;
  const parts = [
    publication.journal,
    publication.volume && `vol. ${publication.volume}`,
    publication.issue && `no. ${publication.issue}`,
    publication.pages && `pp. ${publication.pages}`,
    paperYear(publication),
    publication.doi && `doi: ${publication.doi}`,
  ].filter(Boolean) as string[];
  return `${ieeeAuthors(authors)}, "${title}," ${parts.join(", ")}.`;
}

export function mlaCitation(publication: PublicationDraft) {
  const authors = parsedAuthors(publication.authors);
  const parts = [
    `"${publication.title}."`,
    publication.journal && `${publication.journal},`,
    publication.volume && `vol. ${publication.volume},`,
    publication.issue && `no. ${publication.issue},`,
    `${paperYear(publication)},`,
    publication.pages && `pp. ${publication.pages}.`,
  ].filter(Boolean) as string[];
  let citation = `${mlaAuthors(authors)}. ${parts.join(" ")}`;
  if (publication.doi) citation += ` DOI: ${publication.doi}.`;
  else if (publication.url) citation += ` ${publication.url}.`;
  return citation;
}

export function chicagoCitation(publication: PublicationDraft) {
  const authors = parsedAuthors(publication.authors);
  const venue = publication.journal
    ? [
        `${publication.journal}${publication.volume ? ` ${publication.volume}` : ""}`,
        publication.issue && `no. ${publication.issue}`,
        `(${paperYear(publication)})`,
        publication.pages && `: ${publication.pages}`,
      ]
        .filter(Boolean)
        .join("")
    : `${paperYear(publication)}. ${publicationTypeLabel(publication.type)}`;
  let citation = `${chicagoAuthors(authors)}. "${publication.title}." ${venue}.`;
  if (doiSuffix(publication)) citation += ` ${doiSuffix(publication)}.`;
  return citation;
}

export function plainTextCitation(publication: PublicationDraft) {
  return ieeeCitation(publication);
}

function bibtexKey(publication: PublicationDraft) {
  const first = splitName(publication.authors[0]?.name ?? "unknown").family.toLowerCase();
  const word = publication.title.toLowerCase().match(/[a-z0-9]+/)?.[0] ?? "publication";
  return `${first.replace(/[^a-z0-9]/g, "")}${paperYear(publication)}${word}`;
}

export function bibtexCitation(publication: PublicationDraft) {
  const entry =
    PUBLICATION_TYPES.find((type) => type.id === publication.type) ?? PUBLICATION_TYPES[0];
  const fields: string[] = [
    `  title = {{${publication.title}}}`,
    `  author = {${bibtexAuthors(parsedAuthors(publication.authors))}}`,
  ];
  const venueField = publication.type === "conference-paper" ? "booktitle" : "journal";
  if (publication.journal) fields.push(`  ${venueField} = {${publication.journal}}`);
  fields.push(`  year = {${paperYear(publication)}}`);
  if (publication.volume) fields.push(`  volume = {${publication.volume}}`);
  if (publication.issue) fields.push(`  number = {${publication.issue}}`);
  if (publication.pages) fields.push(`  pages = {${publication.pages.replace(/[–-]/, "--")}}`);
  if (publication.type === "thesis" && publication.publisher)
    fields.push(`  school = {${publication.publisher}}`);
  else if (publication.publisher) fields.push(`  publisher = {${publication.publisher}}`);
  if (publication.doi) fields.push(`  doi = {${publication.doi}}`);
  if (publication.url) fields.push(`  url = {${publication.url}}`);
  return `@${entry.bibtex}{${bibtexKey(publication)},\n${fields.join(",\n")}\n}`;
}

export function risCitation(publication: PublicationDraft) {
  const entry =
    PUBLICATION_TYPES.find((type) => type.id === publication.type) ?? PUBLICATION_TYPES[0];
  const lines = [`TY  - ${entry.ris}`];
  for (const author of parsedAuthors(publication.authors)) {
    lines.push(`AU  - ${familyNameFirst(author)}`);
  }
  lines.push(`TI  - ${publication.title}`);
  if (publication.journal) {
    lines.push(
      `${publication.type === "conference-paper" ? "T2" : "JO"}  - ${publication.journal}`,
    );
  }
  if (publication.volume) lines.push(`VL  - ${publication.volume}`);
  if (publication.issue) lines.push(`IS  - ${publication.issue}`);
  const pages = publication.pages?.split(/[–-]/, 2);
  if (pages?.[0]) lines.push(`SP  - ${pages[0].trim()}`);
  if (pages?.[1]) lines.push(`EP  - ${pages[1].trim()}`);
  lines.push(`PY  - ${paperYear(publication)}`);
  if (publication.doi) lines.push(`DO  - ${publication.doi}`);
  if (publication.publisher) lines.push(`PB  - ${publication.publisher}`);
  if (publication.url) lines.push(`UR  - ${publication.url}`);
  for (const keyword of publication.keywords) lines.push(`KW  - ${keyword}`);
  lines.push("ER  - ");
  return lines.join("\n");
}
