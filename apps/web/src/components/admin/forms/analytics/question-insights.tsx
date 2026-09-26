"use client";

import { useMemo, useState } from "react";
import {
  OTHER_OPTION_ID,
  isAnswered,
  isFileAnswer,
  isMultiChoiceType,
  optionLabel,
  otherKey,
  type FormField,
  type FormFileAnswer,
} from "@repo/shared";

import {
  BarList,
  BoxPlot,
  ColumnChart,
  SplitBar,
  StackedRows,
} from "@/components/admin/forms/charts/bars";
import {
  ChartCard,
  EmptyChart,
  SERIES,
  formatCount,
  formatNumber,
  formatPercent,
} from "@/components/admin/forms/charts/viz";
import { FileTypeIcon, isImageFile } from "@/components/admin/forms/responses/cells";
import { formFileUrl } from "@/lib/forms/admin-api";
import {
  countryLabel,
  formatDateTime,
  type DataColumn,
  type WorkingRow,
} from "@/lib/forms/data/columns";
import {
  histogram,
  nps as npsBreakdown,
  suggestedBinCount,
  summarize,
} from "@/lib/forms/data/stats";
import { summarizeText } from "@/lib/forms/data/text";

const statLabel =
  "text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a93a6] dark:text-white/35";

function StatRow({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className={statLabel}>{label}</dt>
          <dd className="text-sm font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function answersOf(rows: WorkingRow[], field: FormField) {
  const values: unknown[] = [];
  for (const row of rows) {
    const value = row.answers[field.id];
    if (isAnswered(value)) values.push(value);
  }
  return values;
}

function scaleDomain(field: FormField): [number, number] {
  switch (field.type) {
    case "nps":
      return [0, 10];
    case "rating":
      return [1, field.max ?? 5];
    case "opinion_scale":
      return [field.min ?? 1, field.max ?? 10];
    default:
      return [field.min ?? 0, field.max ?? 100];
  }
}

function ChoiceInsight({
  field,
  rows,
  answered,
}: {
  field: FormField;
  rows: WorkingRow[];
  answered: unknown[];
}) {
  const multi = isMultiChoiceType(field.type, field);
  const counts = new Map<string, number>();
  for (const value of answered) {
    const ids = Array.isArray(value) ? value.map(String) : [String(value)];
    for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const options = [
    ...(field.options ?? []).map((option) => option.id),
    ...(field.allowOther ? [OTHER_OPTION_ID] : []),
  ];
  for (const id of counts.keys()) if (!options.includes(id)) options.push(id);
  const barRows = options
    .map((id) => ({ key: id, label: optionLabel(field, id), value: counts.get(id) ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const others = field.allowOther
    ? rows
        .map((row) => row.answers[otherKey(field.id)])
        .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
  const otherCounts = new Map<string, number>();
  for (const text of others) otherCounts.set(text.trim(), (otherCounts.get(text.trim()) ?? 0) + 1);
  return (
    <>
      <BarList rows={barRows} total={answered.length} />
      {multi ? (
        <p className="mt-2 text-[11px] text-[#8a93a6]">
          Share of the {formatCount(answered.length)} people who answered; one person can pick
          several.
        </p>
      ) : null}
      {others.length ? (
        <div className="mt-3">
          <p className={statLabel}>“{optionLabel(field, OTHER_OPTION_ID)}” answers</p>
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {[...otherCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 24)
              .map(([text, count]) => (
                <li
                  className="rounded-full bg-[#eef1f6] px-2 py-0.5 text-[11px] dark:bg-white/10"
                  key={text}
                >
                  {text}{" "}
                  {count > 1 ? <span className="tabular-nums text-[#8a93a6]">×{count}</span> : null}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function RankingInsight({ field, answered }: { field: FormField; answered: unknown[] }) {
  const totals = new Map<string, { sum: number; n: number; first: number }>();
  for (const value of answered) {
    if (!Array.isArray(value)) continue;
    value.forEach((id, index) => {
      const entry = totals.get(String(id)) ?? { sum: 0, n: 0, first: 0 };
      entry.sum += index + 1;
      entry.n += 1;
      if (index === 0) entry.first += 1;
      totals.set(String(id), entry);
    });
  }
  const size = field.options?.length ?? 1;
  const rows = (field.options ?? [])
    .map((option) => {
      const entry = totals.get(option.id);
      const average = entry && entry.n ? entry.sum / entry.n : size;
      return {
        key: option.id,
        label: option.label,
        value: size + 1 - average,
        note: `avg rank ${average.toFixed(2)}`,
        first: entry?.first ?? 0,
      };
    })
    .sort((a, b) => b.value - a.value);
  return (
    <>
      <BarList max={size} rows={rows} valueFormat={() => ""} />
      <p className="mt-2 text-[11px] text-[#8a93a6]">
        Longer bars were ranked higher (1 is best).{" "}
        {rows[0] ? `${rows[0].label} came first ${rows[0].first} times.` : ""}
      </p>
    </>
  );
}

function ScaleInsight({ field, answered }: { field: FormField; answered: unknown[] }) {
  const values = answered.filter((value): value is number => typeof value === "number");
  const [low, high] = scaleDomain(field);
  const counts = new Map<number, number>();
  for (const value of values)
    counts.set(Math.round(value), (counts.get(Math.round(value)) ?? 0) + 1);
  const data = [];
  for (let value = low; value <= high; value += 1)
    data.push({
      key: String(value),
      label: String(value),
      value: counts.get(value) ?? 0,
      detail: `${formatPercent((counts.get(value) ?? 0) / Math.max(1, values.length))} of answers`,
    });
  const summary = summarize(values);
  const isNps = field.type === "nps";
  const breakdown = isNps ? npsBreakdown(values) : null;
  return (
    <>
      {breakdown ? (
        <div className="mb-4">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-[-0.02em]">
              {Number.isFinite(breakdown.score) ? Math.round(breakdown.score) : "–"}
            </span>
            <span className="text-xs text-[#5c6679] dark:text-white/55">
              NPS (promoters − detractors, −100 to 100)
            </span>
          </div>
          <SplitBar
            label="Net promoter split"
            segments={[
              {
                key: "d",
                label: "Detractors 0–6",
                value: breakdown.detractors,
                color: "var(--viz-bad)",
              },
              {
                key: "p",
                label: "Passives 7–8",
                value: breakdown.passives,
                color: "var(--viz-neutral)",
              },
              {
                key: "r",
                label: "Promoters 9–10",
                value: breakdown.promoters,
                color: "var(--viz-good)",
              },
            ]}
          />
        </div>
      ) : null}
      <ColumnChart
        color={SERIES[0]}
        data={
          isNps
            ? data.map((item) => ({
                ...item,
                color:
                  Number(item.key) >= 9
                    ? "var(--viz-good)"
                    : Number(item.key) >= 7
                      ? "var(--viz-neutral)"
                      : "var(--viz-bad)",
              }))
            : data
        }
        height={150}
        showValues={data.length <= 11}
        title={`${field.label}: distribution`}
      />
      <StatRow
        items={[
          ["Mean", formatNumber(summary.mean)],
          ["Median", formatNumber(summary.median)],
          ["Std dev", formatNumber(summary.sd)],
          ["Min", formatNumber(summary.min)],
          ["Max", formatNumber(summary.max)],
          ["n", formatCount(summary.n)],
        ]}
      />
    </>
  );
}

function NumberInsight({ field, answered }: { field: FormField; answered: unknown[] }) {
  const values = answered.filter((value): value is number => typeof value === "number");
  const [bins, setBins] = useState(() => suggestedBinCount(values));
  const summary = useMemo(() => summarize(values), [values]);
  const integers = useMemo(
    () =>
      values.length > 0 &&
      values.every(Number.isInteger) &&
      Math.max(...values) - Math.min(...values) <= 40,
    [values],
  );
  const data = useMemo(
    () => histogram(values, bins, { integer: integers }),
    [values, bins, integers],
  );
  if (!values.length) return <EmptyChart />;
  const digits =
    field.decimals ?? (Number.isInteger(summary.min) && Number.isInteger(summary.max) ? 0 : 1);
  return (
    <>
      <label className="mb-2 flex items-center gap-2 text-[11px] text-[#5c6679] dark:text-white/55">
        Bins
        <input
          aria-label="Number of bins"
          className="w-28 accent-brand-blue"
          max={40}
          min={2}
          onChange={(event) => setBins(Number(event.target.value))}
          type="range"
          value={bins}
        />
        <span className="tabular-nums">{bins}</span>
      </label>
      <ColumnChart
        data={data.map((bin, index) => ({
          key: String(index),
          label: bin.x0.toFixed(digits),
          value: bin.count,
          detail: `${bin.x0.toFixed(digits)} to ${bin.x1.toFixed(digits)}`,
        }))}
        height={150}
        title={`${field.label}: histogram`}
      />
      <div className="mt-3">
        <BoxPlot
          label={`${field.label}: box plot`}
          mean={summary.mean}
          median={summary.median}
          outliers={summary.outliers}
          q1={summary.q1}
          q3={summary.q3}
          whiskers={summary.whiskers}
        />
      </div>
      <StatRow
        items={[
          ["Mean", formatNumber(summary.mean)],
          ["Median", formatNumber(summary.median)],
          ["Std dev", formatNumber(summary.sd)],
          ["Min", formatNumber(summary.min)],
          ["Max", formatNumber(summary.max)],
          ["Outliers", formatCount(summary.outliers.length)],
        ]}
      />
    </>
  );
}

function BooleanInsight({ field, answered }: { field: FormField; answered: unknown[] }) {
  const yes = answered.filter((value) => value === true).length;
  const no = answered.filter((value) => value === false).length;
  return (
    <SplitBar
      height={18}
      label={field.label}
      segments={[
        {
          key: "yes",
          label: field.type === "consent" ? "Agreed" : "Yes",
          value: yes,
          color: SERIES[0],
        },
        ...(field.type === "consent"
          ? []
          : [{ key: "no", label: "No", value: no, color: SERIES[1] }]),
      ]}
    />
  );
}

function DateInsight({ field, answered }: { field: FormField; answered: unknown[] }) {
  const counts = new Map<string, number>();
  for (const value of answered) {
    const text = String(value);
    const key = field.type === "time" ? text.slice(0, 2) : text.slice(0, 7);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort();
  const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" });
  const data = keys.map((key) => {
    const label =
      field.type === "time"
        ? `${key}:00`
        : monthFormat.format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
    return {
      key,
      label,
      value: counts.get(key) ?? 0,
      detail: field.type === "time" ? "answers in this hour" : "answers in this month",
    };
  });
  return data.length ? (
    <ColumnChart
      data={data}
      height={150}
      showValues={data.length <= 12}
      title={`${field.label}: timeline`}
    />
  ) : (
    <EmptyChart />
  );
}

function MatrixInsight({ field, answered }: { field: FormField; answered: unknown[] }) {
  const columns = field.columnsList ?? [];
  const rows = (field.rowsList ?? []).map((row) => {
    const values = columns.map(() => 0);
    for (const value of answered) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const cell = (value as Record<string, string | string[]>)[row.id];
      const ids = cell === undefined ? [] : Array.isArray(cell) ? cell : [cell];
      for (const id of ids) {
        const index = columns.findIndex((column) => column.id === id);
        if (index >= 0) values[index] += 1;
      }
    }
    return { key: row.id, label: row.label, values };
  });
  // Ordered columns (Poor → Excellent) read best as a ramp of one hue.
  const categories = columns.map((column, index) => ({
    key: column.id,
    label: column.label,
    color: `color-mix(in oklab, var(--viz-1) ${Math.round(25 + (index / Math.max(1, columns.length - 1)) * 75)}%, var(--viz-surface))`,
  }));
  return <StackedRows categories={categories} label={field.label} rows={rows} />;
}

function TextInsight({ field, rows }: { field: FormField; rows: WorkingRow[] }) {
  const [query, setQuery] = useState("");
  const entries = useMemo(
    () =>
      rows
        .map((row) => ({ row, text: textOf(field, row.answers[field.id]) }))
        .filter((entry) => entry.text.trim())
        .sort((a, b) => Date.parse(b.row.record.createdAt) - Date.parse(a.row.record.createdAt)),
    [rows, field],
  );
  const summary = useMemo(() => summarizeText(entries.map((entry) => entry.text)), [entries]);
  if (field.type === "email" || field.type === "url") {
    const hosts = new Map<string, number>();
    for (const entry of entries) {
      const host =
        field.type === "email" ? entry.text.split("@")[1]?.toLowerCase() : safeHost(entry.text);
      if (host) hosts.set(host, (hosts.get(host) ?? 0) + 1);
    }
    return (
      <>
        <p className={`${statLabel} mb-2`}>{field.type === "email" ? "Email domains" : "Sites"}</p>
        <BarList
          rows={[...hosts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([host, count]) => ({ key: host, label: host, value: count }))}
          total={entries.length}
        />
      </>
    );
  }
  const filtered = query
    ? entries.filter((entry) => entry.text.toLowerCase().includes(query.toLowerCase()))
    : entries;
  const wordy = field.type === "long_text" || field.type === "short_text";
  return (
    <>
      {wordy ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className={`${statLabel} mb-2`}>Top words</p>
              <BarList
                limit={8}
                rows={summary.topWords.map((item) => ({
                  key: item.term,
                  label: item.term,
                  value: item.count,
                }))}
                total={summary.answered}
                emptyLabel="Not enough text yet."
              />
            </div>
            <div>
              <p className={`${statLabel} mb-2`}>Top phrases</p>
              <BarList
                color={SERIES[3]}
                limit={8}
                rows={summary.topPhrases.map((item) => ({
                  key: item.term,
                  label: item.term,
                  value: item.count,
                }))}
                total={summary.answered}
                emptyLabel="No repeated phrases yet."
              />
            </div>
          </div>
          <StatRow
            items={[
              ["Answers", formatCount(summary.answered)],
              ["Avg words", formatNumber(summary.averageWords, 1)],
              ["Avg chars", formatNumber(summary.averageCharacters, 0)],
            ]}
          />
        </>
      ) : null}
      <div className="mt-3">
        <div className="mb-2 flex items-center gap-2">
          <p className={`${statLabel} flex-1`}>Latest answers</p>
          <input
            aria-label={`Search answers to ${field.label}`}
            className="h-7 w-40 rounded-lg border border-[#e4e8f0] bg-transparent px-2 text-xs outline-none focus:border-brand-blue dark:border-white/10"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            type="search"
            value={query}
          />
        </div>
        <ul className="max-h-56 space-y-1.5 overflow-auto pr-1">
          {filtered.slice(0, 60).map((entry) => (
            <li
              className="rounded-lg bg-[#f7f8fa] px-2.5 py-1.5 text-xs leading-5 dark:bg-white/[0.04]"
              key={entry.row.id}
            >
              <span className="whitespace-pre-wrap break-words">{entry.text}</span>
              <span className="mt-0.5 block text-[10px] text-[#9ba4b5]">
                {formatDateTime(entry.row.record.createdAt)}
              </span>
            </li>
          ))}
          {!filtered.length ? <li className="text-xs text-[#9ba4b5]">No answers match.</li> : null}
        </ul>
      </div>
    </>
  );
}

function safeHost(text: string) {
  try {
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return null;
  }
}

function textOf(field: FormField, value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    const parts = value as Record<string, string>;
    if (field.type === "name") return [parts.first, parts.last].filter(Boolean).join(" ");
    return Object.values(parts).filter(Boolean).join(", ");
  }
  return String(value);
}

function FileInsight({ formId, answered }: { formId: string; answered: unknown[] }) {
  const files: FormFileAnswer[] = answered.flatMap((value) => (isFileAnswer(value) ? value : []));
  const types = new Map<string, number>();
  for (const file of files) {
    const kind = isImageFile(file)
      ? "Images"
      : file.type.startsWith("video/")
        ? "Videos"
        : file.type === "application/pdf"
          ? "PDF"
          : file.type.split("/")[1]?.toUpperCase() || "Other";
    types.set(kind, (types.get(kind) ?? 0) + 1);
  }
  const images = files.filter(isImageFile).slice(0, 12);
  return (
    <>
      <BarList
        rows={[...types.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([kind, count]) => ({ key: kind, label: kind, value: count }))}
        total={files.length}
      />
      <p className="mt-2 text-[11px] text-[#8a93a6]">
        {formatCount(files.length)} files in {formatCount(answered.length)} responses
      </p>
      {images.length ? (
        <div className="mt-3 grid grid-cols-6 gap-1.5">
          {images.map((file) => (
            <a
              className="block aspect-square overflow-hidden rounded-lg border border-[#e4e8f0] dark:border-white/10"
              href={formFileUrl(formId, file.key)}
              key={file.key}
              rel="noreferrer"
              target="_blank"
              title={file.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed per-response file */}
              <img
                alt={file.name}
                className="size-full object-cover"
                loading="lazy"
                src={formFileUrl(formId, file.key)}
              />
            </a>
          ))}
        </div>
      ) : files.length ? (
        <ul className="mt-2 flex flex-wrap gap-1">
          {files.slice(0, 10).map((file) => (
            <li
              className="inline-flex items-center gap-1 rounded-full bg-[#eef1f6] px-2 py-0.5 text-[11px] dark:bg-white/10"
              key={file.key}
            >
              <FileTypeIcon file={file} size={12} /> {file.name}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function ColorInsight({ answered }: { answered: unknown[] }) {
  const counts = new Map<string, number>();
  for (const value of answered) {
    const color = String(value).toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(color)) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  const max = Math.max(1, ...counts.values());
  return (
    <ul aria-label="Chosen colours" className="flex flex-wrap items-end gap-2">
      {[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([color, count]) => {
          const size = 18 + Math.sqrt(count / max) * 34;
          return (
            <li
              className="flex flex-col items-center gap-1"
              key={color}
              title={`${color}: ${count}`}
            >
              <span
                className="rounded-xl border border-black/10 dark:border-white/15"
                style={{ background: color, width: size, height: size }}
              />
              <span className="font-mono text-[10px] text-[#5c6679] uppercase dark:text-white/50">
                {color}
              </span>
              <span className="text-[10px] font-semibold tabular-nums">{count}</span>
            </li>
          );
        })}
    </ul>
  );
}

function CountryInsight({ answered }: { answered: unknown[] }) {
  const counts = new Map<string, number>();
  for (const value of answered) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  return (
    <BarList
      rows={[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => ({ key: code, label: countryLabel(code), value: count }))}
      total={answered.length}
    />
  );
}

export function QuestionCard({
  field,
  index,
  rows,
  formId,
}: {
  field: FormField;
  index: number;
  rows: WorkingRow[];
  formId: string;
}) {
  const answered = useMemo(() => answersOf(rows, field), [rows, field]);
  const skipped = rows.length - answered.length;
  let body: React.ReactNode;
  if (!answered.length) body = <EmptyChart height={80}>No answers in these responses.</EmptyChart>;
  else {
    switch (field.type) {
      case "multiple_choice":
      case "dropdown":
      case "picture_choice":
      case "checkboxes":
      case "multiselect":
        body = <ChoiceInsight answered={answered} field={field} rows={rows} />;
        break;
      case "ranking":
        body = <RankingInsight answered={answered} field={field} />;
        break;
      case "rating":
      case "opinion_scale":
      case "nps":
        body = <ScaleInsight answered={answered} field={field} />;
        break;
      case "number":
      case "slider":
        body = <NumberInsight answered={answered} field={field} />;
        break;
      case "yes_no":
      case "consent":
        body = <BooleanInsight answered={answered} field={field} />;
        break;
      case "date":
      case "datetime":
      case "time":
        body = <DateInsight answered={answered} field={field} />;
        break;
      case "matrix":
        body = <MatrixInsight answered={answered} field={field} />;
        break;
      case "file_upload":
      case "image_upload":
      case "signature":
        body = <FileInsight answered={answered} formId={formId} />;
        break;
      case "color":
        body = <ColorInsight answered={answered} />;
        break;
      case "country":
        body = <CountryInsight answered={answered} />;
        break;
      default:
        body = <TextInsight field={field} rows={rows} />;
    }
  }
  const wide = ["long_text", "short_text", "matrix", "number", "slider", "nps"].includes(
    field.type,
  );
  return (
    <ChartCard
      className={wide ? "lg:col-span-2" : ""}
      subtitle={
        <>
          {formatCount(answered.length)} answered · {formatCount(skipped)} skipped
          <span className="ml-1.5 rounded bg-[#eef1f6] px-1.5 py-px text-[10px] font-semibold text-[#5c6679] dark:bg-white/10 dark:text-white/50">
            {field.type.replace(/_/g, " ")}
          </span>
        </>
      }
      testId="question-card"
      title={`Q${index + 1}. ${field.label || field.id}`}
    >
      {body}
    </ChartCard>
  );
}

export function QuestionInsights({
  columns,
  rows,
  formId,
}: {
  columns: DataColumn[];
  rows: WorkingRow[];
  formId: string;
}) {
  const fields = columns
    .filter((column) => column.group === "answer" && !column.answer?.part && column.field)
    .map((column) => column.field as FormField);
  if (!fields.length) return <EmptyChart>This form has no questions yet.</EmptyChart>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {fields.map((field, index) => (
        <QuestionCard field={field} formId={formId} index={index} key={field.id} rows={rows} />
      ))}
    </div>
  );
}
