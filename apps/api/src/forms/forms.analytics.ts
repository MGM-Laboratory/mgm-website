import type { FormAnalyticsRange } from "@repo/shared";

import { referrerHost } from "./forms.utils.js";

/**
 * Pure pieces of the forms analytics: the time window, the bucket math in
 * the admin's local time, zero-filling, and small aggregations done after
 * the grouped queries.
 */

export const ANALYTICS_RANGES = ["24h", "7d", "30d", "90d", "365d", "all"] as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function rangeDays(range: Exclude<FormAnalyticsRange, "24h" | "all">): number {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "365d":
      return 365;
  }
}

/** Minutes east of UTC, clamped to the real-world span (UTC-14 … UTC+14). */
export function clampTzOffset(value: unknown): number {
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(-840, Math.min(840, minutes));
}

export function parseRange(value: unknown): FormAnalyticsRange {
  return (ANALYTICS_RANGES as readonly string[]).includes(String(value))
    ? (value as FormAnalyticsRange)
    : "30d";
}

/** Hours for the last day, days for everything longer. */
export function bucketSizeMs(range: FormAnalyticsRange): number {
  return range === "24h" ? HOUR_MS : DAY_MS;
}

/**
 * The first instant the range covers. Day ranges start at the admin's local
 * midnight so the first bucket is a whole day: `7d` is today plus the six
 * days before it.
 */
export function rangeStart(
  range: FormAnalyticsRange,
  formCreatedAt: Date,
  tzOffsetMinutes: number,
  now = Date.now(),
): Date {
  if (range === "24h") {
    // The 24 whole local hours ending with the current one.
    const current = bucketIndex(now, tzOffsetMinutes, HOUR_MS);
    return new Date(bucketStart(current - 23, tzOffsetMinutes, HOUR_MS));
  }
  const today = bucketIndex(now, tzOffsetMinutes, DAY_MS);
  if (range === "all") {
    const first = bucketIndex(formCreatedAt.getTime(), tzOffsetMinutes, DAY_MS);
    return new Date(bucketStart(Math.min(first, today), tzOffsetMinutes, DAY_MS));
  }
  return new Date(bucketStart(today - (rangeDays(range) - 1), tzOffsetMinutes, DAY_MS));
}

/** Which local bucket an instant falls in (the SQL computes the same number). */
export function bucketIndex(instantMs: number, tzOffsetMinutes: number, sizeMs: number): number {
  return Math.floor((instantMs + tzOffsetMinutes * 60_000) / sizeMs);
}

/** The UTC instant a local bucket starts at. */
export function bucketStart(index: number, tzOffsetMinutes: number, sizeMs: number): number {
  return index * sizeMs - tzOffsetMinutes * 60_000;
}

export type SeriesRow = { bucket: number; views: number; starts: number; submissions: number };
export type SeriesPoint = { bucket: string; views: number; starts: number; submissions: number };

/** One point per bucket from `start` through the bucket holding `now`, zeros where nothing happened. */
export function zeroFillSeries(
  rows: readonly SeriesRow[],
  start: Date,
  tzOffsetMinutes: number,
  sizeMs: number,
  now = Date.now(),
): SeriesPoint[] {
  const byBucket = new Map<number, SeriesRow>();
  for (const row of rows) {
    const existing = byBucket.get(row.bucket);
    byBucket.set(row.bucket, {
      bucket: row.bucket,
      views: (existing?.views ?? 0) + row.views,
      starts: (existing?.starts ?? 0) + row.starts,
      submissions: (existing?.submissions ?? 0) + row.submissions,
    });
  }
  const first = bucketIndex(start.getTime(), tzOffsetMinutes, sizeMs);
  const last = bucketIndex(now, tzOffsetMinutes, sizeMs);
  const points: SeriesPoint[] = [];
  for (let index = first; index <= last; index += 1) {
    const row = byBucket.get(index);
    points.push({
      bucket: new Date(bucketStart(index, tzOffsetMinutes, sizeMs)).toISOString(),
      views: row?.views ?? 0,
      starts: row?.starts ?? 0,
      submissions: row?.submissions ?? 0,
    });
  }
  return points;
}

/** `part / whole` as 0..1, 0 when there is no whole. */
export function ratio(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.max(0, Math.min(1, part / whole));
}

/** Folds raw referrer counts into host counts (`direct` for none), largest first. */
export function referrerHosts(
  rows: readonly { referer: string | null; count: number }[],
  limit = 15,
): { host: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const host = referrerHost(row.referer);
    counts.set(host, (counts.get(host) ?? 0) + row.count);
  }
  return [...counts.entries()]
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host))
    .slice(0, limit);
}

/** Session counts per question, in the form's field order, zero for untouched ones. */
export function orderFunnel(
  fieldIds: readonly string[],
  rows: readonly { fieldId: string; sessions: number }[],
): { fieldId: string; sessions: number }[] {
  const byField = new Map(rows.map((row) => [row.fieldId, row.sessions]));
  return fieldIds.map((fieldId) => ({ fieldId, sessions: byField.get(fieldId) ?? 0 }));
}

/** Map points of both kinds, largest clusters first, at most `limit` in total. */
export function mergePoints(
  views: readonly { latitude: number; longitude: number; count: number }[],
  submits: readonly { latitude: number; longitude: number; count: number }[],
  limit = 2000,
): { latitude: number; longitude: number; count: number; kind: "view" | "submit" }[] {
  return [
    ...views.map((point) => ({ ...point, kind: "view" as const })),
    ...submits.map((point) => ({ ...point, kind: "submit" as const })),
  ]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
