// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMMITMENT_LABELS,
  JOB_COMMITMENTS,
  JOB_MODES,
  JOB_STATUSES,
  MODE_LABELS,
  STATUS_LABELS,
  daysUntilDeadline,
  emptyJobDraft,
  formatJobDeadline,
  isOpenJob,
  jobAcceptingApplications,
  openJobs,
  todayUtc,
  type CmsJobRecord,
  type JobDraft,
} from "./career-cms";

function job(extra: Partial<JobDraft> = {}): JobDraft {
  return {
    ...emptyJobDraft(),
    slug: "j",
    title: "J",
    status: "published",
    deadline: "2025-06-10",
    ...extra,
  };
}

function record(slug: string, extra: Partial<JobDraft> = {}): CmsJobRecord {
  return { slug, content: [], job: job({ slug, ...extra }) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("labels", () => {
  it("has a label for every commitment, mode and status", () => {
    for (const id of JOB_COMMITMENTS) expect(COMMITMENT_LABELS[id]).toBeTruthy();
    for (const id of JOB_MODES) expect(MODE_LABELS[id]).toBeTruthy();
    for (const id of JOB_STATUSES) expect(STATUS_LABELS[id]).toBeTruthy();
  });
});

describe("emptyJobDraft", () => {
  it("starts as a draft", () => {
    expect(emptyJobDraft()).toMatchObject({
      status: "draft",
      commitment: "part-time",
      mode: "hybrid",
      perks: [],
    });
  });
});

describe("todayUtc", () => {
  it("reads the UTC date of the clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-10T23:59:00.000Z"));

    expect(todayUtc()).toBe("2025-06-10");
  });
});

describe("isOpenJob", () => {
  it("keeps the deadline day inclusive", () => {
    expect(isOpenJob(job(), "2025-06-10")).toBe(true);
    expect(isOpenJob(job(), "2025-06-09")).toBe(true);
    expect(isOpenJob(job(), "2025-06-11")).toBe(false);
  });

  it("requires the published status", () => {
    expect(isOpenJob(job({ status: "draft" }), "2025-06-01")).toBe(false);
    expect(isOpenJob(job({ status: "closed" }), "2025-06-01")).toBe(false);
  });

  it("uses today by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-10T12:00:00.000Z"));

    expect(isOpenJob(job())).toBe(true);
    expect(jobAcceptingApplications(job({ deadline: "2025-06-09" }))).toBe(false);
  });

  it("accepts applications exactly when the job is open", () => {
    expect(jobAcceptingApplications(job(), "2025-06-10")).toBe(true);
    expect(jobAcceptingApplications(job({ status: "closed" }), "2025-06-10")).toBe(false);
  });
});

describe("openJobs", () => {
  it("lists open roles with the soonest deadline first", () => {
    const records = [
      record("late", { deadline: "2025-08-01" }),
      record("expired", { deadline: "2025-01-01" }),
      record("draft", { status: "draft", deadline: "2025-07-01" }),
      record("soon", { deadline: "2025-06-15" }),
    ];

    expect(openJobs(records, "2025-06-10").map((entry) => entry.slug)).toEqual(["soon", "late"]);
  });

  it("uses today by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-10T00:00:00.000Z"));

    expect(
      openJobs([
        record("a", { deadline: "2025-06-10" }),
        record("b", { deadline: "2025-06-09" }),
      ]).map((entry) => entry.slug),
    ).toEqual(["a"]);
  });
});

describe("daysUntilDeadline", () => {
  it("counts whole days, negative once passed", () => {
    expect(daysUntilDeadline(job({ deadline: "2025-06-13" }), "2025-06-10")).toBe(3);
    expect(daysUntilDeadline(job({ deadline: "2025-06-10" }), "2025-06-10")).toBe(0);
    expect(daysUntilDeadline(job({ deadline: "2025-06-08" }), "2025-06-10")).toBe(-2);
  });

  it("uses today by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-10T20:00:00.000Z"));

    expect(daysUntilDeadline(job({ deadline: "2025-06-11" }))).toBe(1);
  });
});

describe("formatJobDeadline", () => {
  it("uses the long English form", () => {
    expect(formatJobDeadline("2099-12-31")).toBe("Thursday, December 31, 2099");
  });
});
