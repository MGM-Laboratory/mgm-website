"use client";

import { useMemo, useState } from "react";

import { BoxPlot, ColumnChart, StackedRows } from "@/components/admin/forms/charts/bars";
import { CorrelationGrid, MeanCiChart, ScatterPlot } from "@/components/admin/forms/charts/grids";
import {
  ChartCard,
  DataTable,
  EmptyChart,
  OTHER_COLOR,
  formatCount,
  formatNumber,
  formatPercent,
  seriesColor,
} from "@/components/admin/forms/charts/viz";
import {
  cellIds,
  cellText,
  sortKey,
  type DataColumn,
  type WorkingRow,
} from "@/lib/forms/data/columns";
import {
  chiSquareTest,
  describeCorrelation,
  describeCramersV,
  describeP,
  formatP,
  histogram,
  linearRegression,
  oneWayAnova,
  pearson,
  spearman,
  suggestedBinCount,
  summarize,
} from "@/lib/forms/data/stats";

const selectClass =
  "h-9 w-full min-w-0 rounded-xl border border-[#d9dfeb] bg-white px-2.5 text-sm outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045]";
const statLabel =
  "text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a93a6] dark:text-white/35";

/** Columns with one category per response (choices, yes/no, countries, devices, short computed text). */
export function categoricalColumns(columns: DataColumn[], rows: WorkingRow[]) {
  return columns.filter((column) => {
    if (column.answer?.part?.kind === "other") return false;
    if (column.group === "answer") {
      const type = column.field?.type;
      return (
        type === "multiple_choice" ||
        type === "dropdown" ||
        type === "yes_no" ||
        type === "country" ||
        (type === "picture_choice" && column.valueType === "choice") ||
        type === "rating" ||
        type === "opinion_scale"
      );
    }
    if (column.group === "meta")
      return [
        "$country",
        "$device",
        "$browser",
        "$os",
        "$language",
        "$utmSource",
        "$ending",
        "$starred",
        "$flagged",
        "$reviewed",
      ].includes(column.key);
    if (column.valueType === "text" || column.valueType === "boolean") {
      const distinct = new Set(
        rows.slice(0, 2000).map((row) => String(row.extra[column.key] ?? "")),
      );
      return distinct.size > 1 && distinct.size <= 30;
    }
    return false;
  });
}

export function numericColumns(columns: DataColumn[], rows: WorkingRow[]) {
  // Columns that are numeric but empty here (a score on a form without scoring) are left out.
  return columns.filter((column) => {
    if (column.valueType !== "number") return false;
    let seen = 0;
    for (const row of rows) {
      if (typeof sortKey(column, row) === "number" && ++seen >= 3) return true;
    }
    return false;
  });
}

function categoryOf(column: DataColumn, row: WorkingRow): string | null {
  if (column.valueType === "boolean") {
    const key = sortKey(column, row);
    return key === null ? null : key === 1 ? "Yes" : "No";
  }
  if (column.valueType === "number") {
    const key = sortKey(column, row);
    return typeof key === "number" ? String(key) : null;
  }
  const ids = cellIds(column, row);
  if (!ids.length) return null;
  const text = cellText(column, row);
  return text || ids[0];
}

function numberOf(column: DataColumn, row: WorkingRow): number | null {
  const key = sortKey(column, row);
  return typeof key === "number" && Number.isFinite(key) ? key : null;
}

function ColumnSelect({
  label,
  columns,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  columns: DataColumn[];
  value: string;
  onChange: (key: string) => void;
  allowNone?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className={`${statLabel} mb-1 block`}>{label}</span>
      <select
        className={selectClass}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      >
        {allowNone ? <option value="">{allowNone}</option> : null}
        {columns.map((column) => (
          <option key={column.key} value={column.key}>
            {column.group === "meta"
              ? `Meta: ${column.label}`
              : column.group === "extra"
                ? `Computed: ${column.label}`
                : column.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Reading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-xl bg-brand-blue-50/70 px-3 py-2 text-xs leading-5 text-[#2a3a5a] dark:bg-brand-blue/10 dark:text-white/75">
      {children}
    </p>
  );
}

function Stats({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className={statLabel}>{label}</dt>
          <dd className="text-sm font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Crosstab({ categorical, rows }: { categorical: DataColumn[]; rows: WorkingRow[] }) {
  const [aKey, setA] = useState(categorical[0]?.key ?? "");
  const [bKey, setB] = useState(categorical[1]?.key ?? categorical[0]?.key ?? "");
  const [mode, setMode] = useState<"count" | "row" | "column">("count");
  const a = categorical.find((column) => column.key === aKey);
  const b = categorical.find((column) => column.key === bKey);
  const result = useMemo(() => {
    if (!a || !b || a.key === b.key) return null;
    const table = new Map<string, Map<string, number>>();
    const columnTotals = new Map<string, number>();
    for (const row of rows) {
      const x = categoryOf(a, row);
      const y = categoryOf(b, row);
      if (x === null || y === null) continue;
      const line = table.get(x) ?? new Map<string, number>();
      line.set(y, (line.get(y) ?? 0) + 1);
      table.set(x, line);
      columnTotals.set(y, (columnTotals.get(y) ?? 0) + 1);
    }
    const numericRows = [...table.keys()].every(
      (key) => key !== "" && Number.isFinite(Number(key)),
    );
    const rowKeys = [...table.keys()].sort((p, q) =>
      numericRows ? Number(p) - Number(q) : sumMap(table.get(q)) - sumMap(table.get(p)),
    );
    // Numeric categories (ratings, scales) keep their natural order; others go by size.
    const numericColumnKeys = [...columnTotals.keys()].every(
      (key) => key !== "" && Number.isFinite(Number(key)),
    );
    const columnKeys = [...columnTotals.keys()].sort((p, q) =>
      numericColumnKeys
        ? Number(p) - Number(q)
        : (columnTotals.get(q) ?? 0) - (columnTotals.get(p) ?? 0),
    );
    const matrix = rowKeys.map((x) => columnKeys.map((y) => table.get(x)?.get(y) ?? 0));
    return {
      rowKeys,
      columnKeys,
      matrix,
      test: chiSquareTest(matrix),
      columnTotals: columnKeys.map((y) => columnTotals.get(y) ?? 0),
    };
  }, [a, b, rows]);

  if (categorical.length < 2)
    return (
      <EmptyChart>
        Crosstabs need two questions with categories (choices, yes/no, scales or countries).
      </EmptyChart>
    );
  const shown = result;
  const cell = (value: number, rowTotal: number, columnTotal: number) =>
    mode === "count"
      ? formatCount(value)
      : mode === "row"
        ? formatPercent(rowTotal ? value / rowTotal : 0, 0)
        : formatPercent(columnTotal ? value / columnTotal : 0, 0);
  // Ordered numeric categories (a 1-5 scale) read as one hue from light to dark, all shown.
  const ordinal = Boolean(
    shown &&
    shown.columnKeys.length > 1 &&
    shown.columnKeys.every((key) => Number.isFinite(Number(key))),
  );
  const chartCategories =
    ordinal && shown
      ? shown.columnKeys.map((key, index) => ({
          key,
          label: key,
          color: `color-mix(in oklab, var(--viz-1) ${Math.round(22 + (index / Math.max(1, shown.columnKeys.length - 1)) * 78)}%, var(--viz-surface))`,
        }))
      : shown
        ? shown.columnKeys
            .slice(0, 4)
            .map((key, index) => ({ key, label: key, color: seriesColor(index) }))
            .concat(
              shown.columnKeys.length > 4
                ? [{ key: "__rest", label: "Other", color: OTHER_COLOR }]
                : [],
            )
        : [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <ColumnSelect columns={categorical} label="Rows" onChange={setA} value={aKey} />
        <ColumnSelect columns={categorical} label="Columns" onChange={setB} value={bKey} />
        <label className="block">
          <span className={`${statLabel} mb-1 block`}>Show</span>
          <select
            className={selectClass}
            onChange={(event) => {
              setMode(event.target.value as typeof mode);
            }}
            value={mode}
          >
            <option value="count">Counts</option>
            <option value="row">Row %</option>
            <option value="column">Column %</option>
          </select>
        </label>
      </div>
      {!shown ? (
        <EmptyChart>Pick two different questions.</EmptyChart>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-[#eef0f4] dark:border-white/10">
            <table
              aria-label={`${a?.label} by ${b?.label}`}
              className="w-full border-collapse text-xs"
            >
              <thead className="bg-[#fbfbfa] dark:bg-white/[0.03]">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-[#7e899d]" scope="col">
                    {a?.label} \ {b?.label}
                  </th>
                  {shown.columnKeys.map((key) => (
                    <th
                      className="px-3 py-2 text-right font-semibold text-[#7e899d]"
                      key={key}
                      scope="col"
                    >
                      {key}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold text-[#7e899d]" scope="col">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.rowKeys.map((key, rowIndex) => {
                  const rowTotal = shown.matrix[rowIndex].reduce((p, q) => p + q, 0);
                  return (
                    <tr className="border-t border-[#eef0f4] dark:border-white/5" key={key}>
                      <th className="px-3 py-1.5 text-left font-medium" scope="row">
                        {key}
                      </th>
                      {shown.matrix[rowIndex].map((value, columnIndex) => {
                        const expected = shown.test.expected[rowIndex]?.[columnIndex];
                        const over = expected ? (value - expected) / Math.sqrt(expected) : 0;
                        return (
                          <td
                            className={`px-3 py-1.5 text-right tabular-nums ${over > 2 ? "font-semibold text-brand-blue" : over < -2 ? "text-brand-red" : ""}`}
                            key={columnIndex}
                            title={
                              expected ? `Expected ${expected.toFixed(1)} if unrelated` : undefined
                            }
                          >
                            {cell(value, rowTotal, shown.columnTotals[columnIndex])}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                        {formatCount(rowTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[#8a93a6]">
            Blue cells are well above what independence predicts, red ones well below (standardized
            residual beyond ±2).
          </p>
          <StackedRows
            categories={chartCategories}
            label={`${a?.label} by ${b?.label}`}
            rows={shown.rowKeys.map((key, rowIndex) => {
              const values = shown.matrix[rowIndex];
              return {
                key,
                label: key,
                values: ordinal
                  ? values
                  : [
                      ...values.slice(0, 4),
                      ...(values.length > 4 ? [values.slice(4).reduce((p, q) => p + q, 0)] : []),
                    ],
              };
            })}
          />
          <Stats
            items={[
              ["Chi-square", formatNumber(shown.test.statistic, 3)],
              ["df", String(shown.test.df)],
              ["p-value", formatP(shown.test.p)],
              ["Cramér's V", formatNumber(shown.test.cramersV, 3)],
            ]}
          />
          <Reading>
            Across {formatCount(shown.test.n)} responses there is {describeP(shown.test.p)} that{" "}
            {a?.label} and {b?.label} are related (χ² = {formatNumber(shown.test.statistic, 2)}, df
            = {shown.test.df}, p = {formatP(shown.test.p)}). The association is{" "}
            {describeCramersV(
              shown.test.cramersV,
              Math.min(shown.rowKeys.length, shown.columnKeys.length) - 1,
            )}{" "}
            (V = {formatNumber(shown.test.cramersV, 2)}).
            {shown.test.lowExpectedShare > 0.2
              ? ` Careful: ${formatPercent(shown.test.lowExpectedShare, 0)} of the cells expect fewer than 5 responses, so the test is approximate.`
              : ""}
          </Reading>
        </>
      )}
    </div>
  );
}

function sumMap(map: Map<string, number> | undefined) {
  let total = 0;
  for (const value of map?.values() ?? []) total += value;
  return total;
}

function NumericExplorer({ numeric, rows }: { numeric: DataColumn[]; rows: WorkingRow[] }) {
  const [key, setKey] = useState(numeric[0]?.key ?? "");
  const column = numeric.find((item) => item.key === key);
  const values = useMemo(
    () =>
      column
        ? rows
            .map((row) => numberOf(column, row))
            .filter((value): value is number => value !== null)
        : [],
    [column, rows],
  );
  const summary = useMemo(() => summarize(values), [values]);
  const [bins, setBins] = useState<number | null>(null);
  const binCount = bins ?? suggestedBinCount(values);
  const integers = useMemo(
    () =>
      values.length > 0 &&
      values.every(Number.isInteger) &&
      Math.max(...values) - Math.min(...values) <= 40,
    [values],
  );
  const data = useMemo(
    () => histogram(values, binCount, { integer: integers }),
    [values, binCount, integers],
  );
  if (!numeric.length) return <EmptyChart>No numeric questions or computed columns.</EmptyChart>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <ColumnSelect
          columns={numeric}
          label="Numeric column"
          onChange={(next) => {
            setKey(next);
            setBins(null);
          }}
          value={key}
        />
        <label className="block">
          <span className={`${statLabel} mb-1 block`}>Bins: {binCount}</span>
          <input
            aria-label="Number of bins"
            className="mt-2 w-40 accent-brand-blue"
            max={40}
            min={2}
            onChange={(event) => {
              setBins(Number(event.target.value));
            }}
            type="range"
            value={binCount}
          />
        </label>
      </div>
      {!values.length ? (
        <EmptyChart>No numbers in these responses.</EmptyChart>
      ) : (
        <>
          <ColumnChart
            data={data.map((bin, index) => ({
              key: String(index),
              label: formatNumber(bin.x0, 1),
              value: bin.count,
              detail: `${formatNumber(bin.x0, 2)} to ${formatNumber(bin.x1, 2)}`,
            }))}
            title={`${column?.label}: histogram`}
          />
          <BoxPlot
            label={`${column?.label}: box plot`}
            mean={summary.mean}
            median={summary.median}
            outliers={summary.outliers}
            q1={summary.q1}
            q3={summary.q3}
            whiskers={summary.whiskers}
          />
          <Stats
            items={[
              ["n", formatCount(summary.n)],
              ["Mean", formatNumber(summary.mean, 3)],
              ["Median", formatNumber(summary.median, 3)],
              [
                "Mode",
                summary.modes.length
                  ? summary.modes
                      .slice(0, 3)
                      .map((value) => formatNumber(value))
                      .join(", ") + (summary.modes.length > 3 ? "…" : "")
                  : "none",
              ],
              ["Std dev", formatNumber(summary.sd, 3)],
              ["Variance", formatNumber(summary.variance, 3)],
              ["Min", formatNumber(summary.min, 3)],
              ["Max", formatNumber(summary.max, 3)],
              ["Range", formatNumber(summary.range, 3)],
              ["Q1", formatNumber(summary.q1, 3)],
              ["Q3", formatNumber(summary.q3, 3)],
              ["IQR", formatNumber(summary.iqr, 3)],
              ["Skewness", formatNumber(summary.skewness, 3)],
              ["Excess kurtosis", formatNumber(summary.kurtosis, 3)],
              [
                "95% CI of mean",
                `${formatNumber(summary.ci[0], 2)} – ${formatNumber(summary.ci[1], 2)}`,
              ],
              ["Outliers (IQR)", formatCount(summary.outliers.length)],
            ]}
          />
          <Reading>
            Half of the answers fall between {formatNumber(summary.q1)} and{" "}
            {formatNumber(summary.q3)}. With 95% confidence the true mean lies between{" "}
            {formatNumber(summary.ci[0], 2)} and {formatNumber(summary.ci[1], 2)}.
            {Number.isFinite(summary.skewness) && Math.abs(summary.skewness) > 0.5
              ? ` The distribution leans ${summary.skewness > 0 ? "right (a tail of high values)" : "left (a tail of low values)"}.`
              : " The distribution is roughly symmetric."}
            {summary.outliers.length
              ? ` ${summary.outliers.length} value${summary.outliers.length === 1 ? " is" : "s are"} outside the 1.5 × IQR fences (${formatNumber(summary.fences[0])} to ${formatNumber(summary.fences[1])}).`
              : ""}
          </Reading>
        </>
      )}
    </div>
  );
}

function pairs(x: DataColumn, y: DataColumn, rows: WorkingRow[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  const kept: WorkingRow[] = [];
  for (const row of rows) {
    const a = numberOf(x, row);
    const b = numberOf(y, row);
    if (a === null || b === null) continue;
    xs.push(a);
    ys.push(b);
    kept.push(row);
  }
  return { xs, ys, kept };
}

function Scatter({
  numeric,
  categorical,
  rows,
  initial,
}: {
  numeric: DataColumn[];
  categorical: DataColumn[];
  rows: WorkingRow[];
  initial?: [string, string] | null;
}) {
  const [xKey, setX] = useState(initial?.[0] ?? numeric[0]?.key ?? "");
  const [yKey, setY] = useState(initial?.[1] ?? numeric[1]?.key ?? numeric[0]?.key ?? "");
  const [groupKey, setGroup] = useState("");
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial && initial !== lastInitial) {
    setLastInitial(initial);
    setX(initial[0]);
    setY(initial[1]);
  }
  const x = numeric.find((column) => column.key === xKey);
  const y = numeric.find((column) => column.key === yKey);
  const group = categorical.find((column) => column.key === groupKey);
  const data = useMemo(
    () => (x && y ? pairs(x, y, rows) : { xs: [], ys: [], kept: [] }),
    [x, y, rows],
  );
  const fit = useMemo(() => linearRegression(data.xs, data.ys), [data]);
  const r = useMemo(() => pearson(data.xs, data.ys), [data]);
  const groups = useMemo(() => {
    if (!group) return undefined;
    const counts = new Map<string, number>();
    for (const row of data.kept) {
      const value = categoryOf(group, row);
      if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
    return ordered.map((key, index) => ({
      key,
      label: index < 4 ? key : "Other",
      color: seriesColor(index),
    }));
  }, [group, data.kept]);
  if (numeric.length < 2) return <EmptyChart>Scatter plots need two numeric columns.</EmptyChart>;
  const points = data.xs.map((value, index) => {
    const row = data.kept[index];
    const g = group ? (categoryOf(group, row) ?? undefined) : undefined;
    const slot = g && groups ? groups.findIndex((item) => item.key === g) : -1;
    return {
      x: value,
      y: data.ys[index],
      id: row.id,
      group: slot >= 4 ? "__other" : g,
      label: new Date(row.record.createdAt).toLocaleDateString(),
    };
  });
  const legend = groups
    ? [
        ...groups.slice(0, 4),
        ...(groups.length > 4 ? [{ key: "__other", label: "Other", color: OTHER_COLOR }] : []),
      ]
    : undefined;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <ColumnSelect columns={numeric} label="X axis" onChange={setX} value={xKey} />
        <ColumnSelect columns={numeric} label="Y axis" onChange={setY} value={yKey} />
        <ColumnSelect
          allowNone="No colour"
          columns={categorical}
          label="Colour by"
          onChange={setGroup}
          value={groupKey}
        />
      </div>
      {data.xs.length < 3 ? (
        <EmptyChart>Fewer than three responses answered both.</EmptyChart>
      ) : (
        <>
          <ScatterPlot
            groups={legend}
            line={fit}
            points={points}
            title={`${y?.label} against ${x?.label}`}
            xLabel={x?.label ?? ""}
            yLabel={y?.label ?? ""}
          />
          <Stats
            items={[
              ["n", formatCount(r.n)],
              ["Pearson r", formatNumber(r.r, 3)],
              ["R²", formatNumber(fit.r2, 3)],
              ["p-value", formatP(r.p)],
              ["Slope", formatNumber(fit.slope, 4)],
              ["Intercept", formatNumber(fit.intercept, 3)],
            ]}
          />
          <Reading>
            A {describeCorrelation(r.r)} (r = {formatNumber(r.r, 2)}, p = {formatP(r.p)}): the
            fitted line explains {formatPercent(fit.r2)} of the variation in {y?.label}. Each extra
            unit of {x?.label} goes with {formatNumber(fit.slope, 3)} more {y?.label} on average.
            Correlation is not causation.
          </Reading>
        </>
      )}
    </div>
  );
}

function Correlations({
  numeric,
  rows,
  onPick,
}: {
  numeric: DataColumn[];
  rows: WorkingRow[];
  onPick: (x: string, y: string) => void;
}) {
  const [method, setMethod] = useState<"pearson" | "spearman">("pearson");
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const columns = numeric.slice(0, 12);
  const matrix = useMemo(
    () =>
      columns.map((a, i) =>
        columns.map((b, j) => {
          if (i === j) return 1;
          const { xs, ys } = pairs(a, b, rows);
          return (method === "pearson" ? pearson(xs, ys) : spearman(xs, ys)).r;
        }),
      ),
    [columns, rows, method],
  );
  if (columns.length < 2)
    return <EmptyChart>Correlations need at least two numeric columns.</EmptyChart>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["pearson", "spearman"] as const).map((item) => (
          <button
            aria-pressed={method === item}
            className={`h-8 rounded-full px-3 text-xs font-semibold capitalize ${method === item ? "bg-[#171b25] text-white dark:bg-white dark:text-[#171b25]" : "border border-[#d9dfeb] text-[#5c6679] dark:border-white/10 dark:text-white/60"}`}
            key={item}
            onClick={() => {
              setMethod(item);
            }}
            type="button"
          >
            {item}
          </button>
        ))}
        <span className="text-[11px] text-[#8a93a6]">
          {method === "pearson"
            ? "Linear relationships"
            : "Rank based, robust to outliers and curves"}{" "}
          · click a cell for its scatter plot
        </span>
      </div>
      <CorrelationGrid
        labels={columns.map((column) => column.label)}
        onPick={(i, j) => {
          setSelected([i, j]);
          onPick(columns[j].key, columns[i].key);
        }}
        selected={selected}
        title={`${method === "pearson" ? "Pearson" : "Spearman"} correlation matrix`}
        values={matrix}
      />
    </div>
  );
}

function GroupComparison({
  numeric,
  categorical,
  rows,
}: {
  numeric: DataColumn[];
  categorical: DataColumn[];
  rows: WorkingRow[];
}) {
  const [valueKey, setValue] = useState(numeric[0]?.key ?? "");
  const [groupKey, setGroup] = useState(categorical[0]?.key ?? "");
  const valueColumn = numeric.find((column) => column.key === valueKey);
  const groupColumn = categorical.find((column) => column.key === groupKey);
  const result = useMemo(() => {
    if (!valueColumn || !groupColumn) return null;
    const groups = new Map<string, number[]>();
    for (const row of rows) {
      const value = numberOf(valueColumn, row);
      const group = categoryOf(groupColumn, row);
      if (value === null || group === null) continue;
      const list = groups.get(group) ?? [];
      list.push(value);
      groups.set(group, list);
    }
    const list = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([label, values]) => ({ label, values }));
    return oneWayAnova(list);
  }, [valueColumn, groupColumn, rows]);
  if (!numeric.length || !categorical.length)
    return <EmptyChart>Group comparison needs a numeric column and a categorical one.</EmptyChart>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ColumnSelect columns={numeric} label="Compare" onChange={setValue} value={valueKey} />
        <ColumnSelect
          columns={categorical}
          label="Across groups of"
          onChange={setGroup}
          value={groupKey}
        />
      </div>
      {!result || result.groups.length < 2 ? (
        <EmptyChart>Need at least two groups with answers.</EmptyChart>
      ) : (
        <>
          <MeanCiChart
            groups={result.groups}
            title={`Mean ${valueColumn?.label} by ${groupColumn?.label}`}
          />
          <DataTable
            table={{
              columns: ["Group", "n", "Mean", "Std dev", "95% CI"],
              rows: result.groups.map((group) => [
                group.label,
                group.n,
                formatNumber(group.mean, 3),
                formatNumber(group.sd, 3),
                `${formatNumber(group.ci[0], 2)} – ${formatNumber(group.ci[1], 2)}`,
              ]),
            }}
          />
          <Stats
            items={[
              ["F", formatNumber(result.f, 3)],
              ["df", `${result.dfBetween}, ${result.dfWithin}`],
              ["p-value", formatP(result.p)],
              ["η²", formatNumber(result.etaSquared, 3)],
            ]}
          />
          <Reading>
            One-way ANOVA: there is {describeP(result.p)} that the mean {valueColumn?.label} differs
            between the {result.groups.length} groups of {groupColumn?.label} (F({result.dfBetween},{" "}
            {result.dfWithin}) = {formatNumber(result.f, 2)}, p = {formatP(result.p)}). Group
            membership accounts for {formatPercent(result.etaSquared)} of the variance (η²).
          </Reading>
        </>
      )}
    </div>
  );
}

export function AnalysisLab({
  columns,
  rows,
  total,
}: {
  columns: DataColumn[];
  rows: WorkingRow[];
  total: number;
}) {
  const categorical = useMemo(() => categoricalColumns(columns, rows), [columns, rows]);
  const numeric = useMemo(() => numericColumns(columns, rows), [columns, rows]);
  const [scatterPick, setScatterPick] = useState<[string, string] | null>(null);
  return (
    <div className="space-y-4" data-testid="analysis-lab">
      <p className="text-xs text-[#5c6679] dark:text-white/55">
        Using <b className="tabular-nums">{formatCount(rows.length)}</b> of {formatCount(total)}{" "}
        responses: the Responses tab&apos;s filters, segment and cleaning steps apply here.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          subtitle="Two categorical questions: are they related?"
          testId="lab-crosstab"
          title="Crosstab and chi-square test"
        >
          <Crosstab categorical={categorical} rows={rows} />
        </ChartCard>
        <ChartCard
          subtitle="Every descriptive statistic for one number"
          testId="lab-numeric"
          title="Numeric explorer"
        >
          <NumericExplorer numeric={numeric} rows={rows} />
        </ChartCard>
        <ChartCard
          subtitle="Pairwise, over the responses that answered both"
          testId="lab-correlation"
          title="Correlation matrix"
        >
          <Correlations
            numeric={numeric}
            onPick={(x, y) => {
              setScatterPick([x, y]);
            }}
            rows={rows}
          />
        </ChartCard>
        <ChartCard
          subtitle="Two numbers against each other, with a least-squares line"
          testId="lab-scatter"
          title="Scatter plot"
        >
          <Scatter categorical={categorical} initial={scatterPick} numeric={numeric} rows={rows} />
        </ChartCard>
        <ChartCard
          className="xl:col-span-2"
          subtitle="A number across the groups of a category, one-way ANOVA"
          testId="lab-anova"
          title="Group comparison"
        >
          <GroupComparison categorical={categorical} numeric={numeric} rows={rows} />
        </ChartCard>
      </div>
    </div>
  );
}
