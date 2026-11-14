import { Injectable } from "@nestjs/common";

import {
  isInputType,
  type FormAnalytics,
  type FormAnalyticsRange,
  type FormEventType,
  type FormVisit,
} from "@repo/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { storedDocument } from "./forms.common.js";
import {
  bucketSizeMs,
  mergePoints,
  orderFunnel,
  rangeStart,
  ratio,
  referrerHosts,
  zeroFillSeries,
  type SeriesRow,
} from "./forms.analytics.js";
import { FormsService } from "./forms.service.js";

const TOP_LIMIT = 15;
const POINTS_LIMIT = 2000;
// The admin analytics run on one connection with a limit for each query.
export const ANALYTICS_STATEMENT_TIMEOUT_MS = 15_000;
export const ANALYTICS_QUEUE_WAIT_MS = 5_000;
export const ANALYTICS_TRANSACTION_TIMEOUT_MS = 45_000;

type Point = { latitude: number; longitude: number; count: number };

/** Traffic analytics and the visitor log of one form. */
@Injectable()
export class FormsAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly forms: FormsService,
  ) {}

  async analytics(
    formId: string,
    range: FormAnalyticsRange,
    tzOffset: number,
    now = Date.now(),
  ): Promise<FormAnalytics> {
    const form = await this.forms.require(formId);
    const document = storedDocument(form.data);
    const start = rangeStart(range, form.createdAt, tzOffset, now);
    const size = bucketSizeMs(range);
    const shiftMs = tzOffset * 60_000;

    const views: Prisma.FormEventWhereInput = {
      formId,
      type: "view",
      createdAt: { gte: start },
    };

    const [
      eventSeries,
      responseSeries,
      eventTotals,
      responseTotals,
      heatmap,
      funnel,
      countries,
      cities,
      referrers,
      devices,
      browsers,
      oss,
      languages,
      utmSources,
      viewPoints,
      submitPoints,
    ] = await this.prisma.$transaction(
      async (tx) => {
        // One connection and a time limit for each query, so one slow request cannot hold the pool.
        await tx.$executeRawUnsafe(
          `SET LOCAL statement_timeout = '${ANALYTICS_STATEMENT_TIMEOUT_MS}ms'`,
        );
        return Promise.all([
          tx.$queryRaw<{ bucket: number; views: number; starts: number }[]>`
        SELECT
          floor((extract(epoch FROM "createdAt") * 1000 + ${shiftMs}) / ${size})::int AS "bucket",
          COUNT(*) FILTER (WHERE "type" = 'view')::int AS "views",
          COUNT(*) FILTER (WHERE "type" = 'start')::int AS "starts"
        FROM "FormEvent"
        WHERE "formId" = ${formId} AND "createdAt" >= ${start} AND "type" IN ('view', 'start')
        GROUP BY 1
      `,
          tx.$queryRaw<{ bucket: number; submissions: number }[]>`
        SELECT
          floor((extract(epoch FROM "createdAt") * 1000 + ${shiftMs}) / ${size})::int AS "bucket",
          COUNT(*)::int AS "submissions"
        FROM "FormResponse"
        WHERE "formId" = ${formId} AND "createdAt" >= ${start} AND NOT "spam"
        GROUP BY 1
      `,
          tx.$queryRaw<{ views: number; uniqueVisitors: number; starts: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE "type" = 'view')::int AS "views",
          COUNT(DISTINCT COALESCE("ip", "sessionId")) FILTER (WHERE "type" = 'view')::int
            AS "uniqueVisitors",
          COUNT(*) FILTER (WHERE "type" = 'start')::int AS "starts"
        FROM "FormEvent"
        WHERE "formId" = ${formId} AND "createdAt" >= ${start}
      `,
          tx.$queryRaw<{ submissions: number; median: number | null; average: number | null }[]>`
        SELECT
          COUNT(*)::int AS "submissions",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs")::float8 AS "median",
          AVG("durationMs")::float8 AS "average"
        FROM "FormResponse"
        WHERE "formId" = ${formId} AND "createdAt" >= ${start} AND NOT "spam"
      `,
          tx.$queryRaw<{ weekday: number; hour: number; count: number }[]>`
        SELECT
          extract(dow FROM "createdAt" + ${tzOffset}::int * interval '1 minute')::int AS "weekday",
          extract(hour FROM "createdAt" + ${tzOffset}::int * interval '1 minute')::int AS "hour",
          COUNT(*)::int AS "count"
        FROM "FormEvent"
        WHERE "formId" = ${formId} AND "createdAt" >= ${start} AND "type" = 'view'
        GROUP BY 1, 2
        ORDER BY 1, 2
      `,
          tx.$queryRaw<{ fieldId: string; sessions: number }[]>`
        SELECT "fieldId", COUNT(DISTINCT "sessionId")::int AS "sessions"
        FROM "FormEvent"
        WHERE "formId" = ${formId} AND "createdAt" >= ${start}
          AND "type" = 'progress' AND "fieldId" IS NOT NULL
        GROUP BY 1
      `,
          tx.formEvent.groupBy({
            by: ["country"],
            where: { ...views, country: { not: null } },
            _count: { _all: true },
            orderBy: { _count: { country: "desc" } },
            take: TOP_LIMIT,
          }),
          tx.formEvent.groupBy({
            by: ["city", "country"],
            where: { ...views, city: { not: null } },
            _count: { _all: true },
            orderBy: { _count: { city: "desc" } },
            take: TOP_LIMIT,
          }),
          tx.formEvent.groupBy({
            by: ["referer"],
            where: views,
            _count: { _all: true },
            orderBy: { _count: { referer: "desc" } },
            take: 5000,
          }),
          tx.formEvent.groupBy({
            by: ["device"],
            where: { ...views, device: { not: null } },
            _count: { _all: true },
            orderBy: { _count: { device: "desc" } },
            take: TOP_LIMIT,
          }),
          tx.formEvent.groupBy({
            by: ["browser"],
            where: { ...views, browser: { not: null } },
            _count: { _all: true },
            orderBy: { _count: { browser: "desc" } },
            take: TOP_LIMIT,
          }),
          tx.formEvent.groupBy({
            by: ["os"],
            where: { ...views, os: { not: null } },
            _count: { _all: true },
            orderBy: { _count: { os: "desc" } },
            take: TOP_LIMIT,
          }),
          tx.formEvent.groupBy({
            by: ["language"],
            where: { ...views, language: { not: null } },
            _count: { _all: true },
            orderBy: { _count: { language: "desc" } },
            take: TOP_LIMIT,
          }),
          tx.$queryRaw<{ source: string; count: number }[]>`
        SELECT "utm"->>'source' AS "source", COUNT(*)::int AS "count"
        FROM "FormResponse"
        WHERE "formId" = ${formId} AND "createdAt" >= ${start} AND NOT "spam"
          AND "utm"->>'source' IS NOT NULL
        GROUP BY 1
        ORDER BY 2 DESC, 1
        LIMIT ${TOP_LIMIT}
      `,
          tx.$queryRaw<Point[]>`
        SELECT
          round("latitude"::numeric, 1)::float8 AS "latitude",
          round("longitude"::numeric, 1)::float8 AS "longitude",
          COUNT(*)::int AS "count"
        FROM "FormEvent"
        WHERE "formId" = ${formId} AND "createdAt" >= ${start} AND "type" = 'view'
          AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL
        GROUP BY 1, 2
        ORDER BY 3 DESC
        LIMIT ${POINTS_LIMIT}
      `,
          tx.$queryRaw<Point[]>`
        SELECT
          round("latitude"::numeric, 1)::float8 AS "latitude",
          round("longitude"::numeric, 1)::float8 AS "longitude",
          COUNT(*)::int AS "count"
        FROM "FormResponse"
        WHERE "formId" = ${formId} AND "createdAt" >= ${start} AND NOT "spam"
          AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL
        GROUP BY 1, 2
        ORDER BY 3 DESC
        LIMIT ${POINTS_LIMIT}
      `,
        ]);
      },
      { maxWait: ANALYTICS_QUEUE_WAIT_MS, timeout: ANALYTICS_TRANSACTION_TIMEOUT_MS },
    );

    const seriesRows: SeriesRow[] = [
      ...eventSeries.map((row) => ({ ...row, submissions: 0 })),
      ...responseSeries.map((row) => ({ views: 0, starts: 0, ...row })),
    ];
    const totalsEvents = eventTotals[0] ?? { views: 0, uniqueVisitors: 0, starts: 0 };
    const totalsResponses = responseTotals[0] ?? { submissions: 0, median: null, average: null };
    const questionIds = document.fields
      .filter((field) => isInputType(field.type) && field.type !== "hidden")
      .map((field) => field.id);

    return {
      range,
      totals: {
        views: totalsEvents.views,
        uniqueVisitors: totalsEvents.uniqueVisitors,
        starts: totalsEvents.starts,
        submissions: totalsResponses.submissions,
        conversion: ratio(totalsResponses.submissions, totalsEvents.views),
        completion: ratio(totalsResponses.submissions, totalsEvents.starts),
        medianDurationMs:
          totalsResponses.median === null ? null : Math.round(totalsResponses.median),
        averageDurationMs:
          totalsResponses.average === null ? null : Math.round(totalsResponses.average),
      },
      series: zeroFillSeries(seriesRows, start, tzOffset, size, now),
      heatmap,
      funnel: orderFunnel(questionIds, funnel),
      // The queries above skip null values; the checks below only narrow the types.
      countries: countries.flatMap((row) =>
        row.country === null ? [] : [{ country: row.country, count: row._count._all }],
      ),
      cities: cities.flatMap((row) =>
        row.city === null ? [] : [{ city: row.city, country: row.country, count: row._count._all }],
      ),
      referrers: referrerHosts(
        referrers.map((row) => ({ referer: row.referer, count: row._count._all })),
        TOP_LIMIT,
      ),
      devices: devices.flatMap((row) =>
        row.device === null ? [] : [{ device: row.device, count: row._count._all }],
      ),
      browsers: browsers.flatMap((row) =>
        row.browser === null ? [] : [{ browser: row.browser, count: row._count._all }],
      ),
      oss: oss.flatMap((row) => (row.os === null ? [] : [{ os: row.os, count: row._count._all }])),
      languages: languages.flatMap((row) =>
        row.language === null ? [] : [{ language: row.language, count: row._count._all }],
      ),
      utmSources,
      points: mergePoints(viewPoints, submitPoints, POINTS_LIMIT),
    };
  }

  async visits(formId: string, limit: number): Promise<FormVisit[]> {
    await this.forms.require(formId);
    const rows = await this.prisma.formEvent.findMany({
      where: { formId },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(1000, Number.isFinite(limit) ? Math.floor(limit) : 200)),
    });
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      type: row.type as FormEventType,
      fieldId: row.fieldId,
      ip: row.ip,
      country: row.country,
      region: row.region,
      city: row.city,
      device: row.device,
      browser: row.browser,
      os: row.os,
      referer: row.referer,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
