import { formatArticleDate, type ArticleBlock } from "@/lib/article-cms";

export const JOB_COMMITMENTS = [
  "full-time",
  "part-time",
  "project",
  "internship",
  "volunteer",
] as const;
export const JOB_MODES = ["onsite", "remote", "hybrid"] as const;
export const JOB_STATUSES = ["draft", "published", "closed"] as const;

export type JobCommitment = (typeof JOB_COMMITMENTS)[number];
export type JobMode = (typeof JOB_MODES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

export const COMMITMENT_LABELS: Record<JobCommitment, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  project: "Project-based",
  internship: "Internship",
  volunteer: "Volunteer",
};

export const MODE_LABELS: Record<JobMode, string> = {
  onsite: "On-site",
  remote: "Remote",
  hybrid: "Hybrid",
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

export type JobDraft = {
  slug: string;
  title: string;
  /** Free-text focus area, e.g. "Game Development". */
  focus: string;
  commitment: JobCommitment;
  mode: JobMode;
  /** YYYY-MM-DD; the deadline day is inclusive. */
  deadline: string;
  perks: string[];
  status: JobStatus;
};

export type CmsJobRecord = {
  job: JobDraft;
  content: ArticleBlock[];
  slug: string;
  updatedAt?: string;
};

export type CmsJobApplicationRecord = {
  application: {
    jobSlug: string;
    jobTitle: string;
    applicantType: "ub-student" | "general";
    fullName: string;
    email: string;
    phoneCountry: string;
    phoneNumber: string;
    nim?: string;
    faculty?: string;
    motivation: string;
    cvKey: string;
    cvFilename: string;
    cvContentType: string;
    agreedToTerms: boolean;
    read: boolean;
    readAt?: string | null;
    status: "inbox" | "archived";
  };
  slug: string;
  createdAt?: string;
  updatedAt?: string;
};

/** Today in UTC as YYYY-MM-DD; deadlines compare against this string. */
export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** Open role: published and the deadline has not passed (inclusive day). */
export function isOpenJob(job: JobDraft, now = todayUtc()) {
  return job.status === "published" && job.deadline >= now;
}

/** Open roles, soonest deadline first - the public listing order. */
export function openJobs(records: readonly CmsJobRecord[], now = todayUtc()) {
  return records
    .filter((record) => isOpenJob(record.job, now))
    .sort((left, right) => left.job.deadline.localeCompare(right.job.deadline));
}

export function jobAcceptingApplications(job: JobDraft, now = todayUtc()) {
  return isOpenJob(job, now);
}

/** "Rabu, 31 Desember 2099" - the same id-ID long form articles use. */
export function formatJobDeadline(value: string) {
  return formatArticleDate(value);
}

/** Whole days until the deadline (negative once passed). */
export function daysUntilDeadline(job: JobDraft, now = todayUtc()) {
  const deadlineMs = new Date(`${job.deadline}T00:00:00Z`).getTime();
  const nowMs = new Date(`${now}T00:00:00Z`).getTime();
  return Math.round((deadlineMs - nowMs) / 86_400_000);
}

export function emptyJobDraft(): JobDraft {
  return {
    slug: "",
    title: "",
    focus: "",
    commitment: "part-time",
    mode: "hybrid",
    deadline: "",
    perks: [],
    status: "draft",
  };
}
