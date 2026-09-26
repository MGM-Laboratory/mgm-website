"use client";

import { useMemo, useState } from "react";

import {
  LAND_BITS,
  LAND_BOTTOM,
  LAND_COLUMNS,
  LAND_ROWS,
  LAND_TOP,
} from "@/lib/forms/data/world-land";

import { ChartTooltip, TooltipRow, TooltipTitle, formatCount, useSize, useTooltip } from "./viz";

let landCells: [number, number][] | null = null;

/** The land cells of the dot matrix (column, row), decoded once. */
function decodeLand(): [number, number][] {
  if (landCells) return landCells;
  const binary = typeof atob === "function" ? atob(LAND_BITS) : "";
  const cells: [number, number][] = [];
  for (let index = 0; index < LAND_COLUMNS * LAND_ROWS; index += 1) {
    const byte = binary.charCodeAt(index >> 3);
    if (byte & (1 << (index & 7)))
      cells.push([index % LAND_COLUMNS, Math.floor(index / LAND_COLUMNS)]);
  }
  landCells = cells;
  return cells;
}

export type MapPoint = {
  latitude: number;
  longitude: number;
  count: number;
  kind: "view" | "submit";
  label?: string;
};

/**
 * An equirectangular dot-matrix world (land from Natural Earth, rasterized
 * offline) with visits drawn as dots sized by count: views in blue,
 * submissions in green. Points are merged per map cell so a thousand
 * visits from one city read as one dot.
 */
export function WorldMap({
  points,
  title,
  height: heightOverride,
}: {
  points: MapPoint[];
  title: string;
  height?: number;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const { tooltip, show, hide } = useTooltip();
  const [hidden, setHidden] = useState<Set<"view" | "submit">>(new Set());
  const height = heightOverride ?? Math.round((width * LAND_ROWS) / LAND_COLUMNS);
  const cellW = width / LAND_COLUMNS;
  const cellH = height / LAND_ROWS;
  const land = useMemo(() => {
    const radius = Math.max(0.6, Math.min(cellW, cellH) * 0.34);
    let d = "";
    for (const [column, row] of decodeLand()) {
      const cx = (column + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;
      d += `M${(cx - radius).toFixed(1)},${cy.toFixed(1)}a${radius.toFixed(2)},${radius.toFixed(2)} 0 1,0 ${(radius * 2).toFixed(2)},0a${radius.toFixed(2)},${radius.toFixed(2)} 0 1,0 ${(-radius * 2).toFixed(2)},0`;
    }
    return d;
  }, [cellW, cellH]);

  const project = (latitude: number, longitude: number) => ({
    x: ((longitude + 180) / 360) * width,
    y: ((LAND_TOP - latitude) / (LAND_TOP - LAND_BOTTOM)) * height,
  });

  const merged = useMemo(() => {
    const buckets = new Map<
      string,
      { latitude: number; longitude: number; view: number; submit: number; labels: Set<string> }
    >();
    for (const point of points) {
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
      const key = `${Math.round(point.latitude * 2) / 2}:${Math.round(point.longitude * 2) / 2}`;
      const bucket = buckets.get(key) ?? {
        latitude: point.latitude,
        longitude: point.longitude,
        view: 0,
        submit: 0,
        labels: new Set<string>(),
      };
      bucket[point.kind] += point.count;
      if (point.label) bucket.labels.add(point.label);
      buckets.set(key, bucket);
    }
    return [...buckets.values()];
  }, [points]);

  const max = Math.max(1, ...merged.map((bucket) => Math.max(bucket.view, bucket.submit)));
  const radiusOf = (count: number) => 2.5 + Math.sqrt(count / max) * Math.max(6, width / 70);
  const totals = merged.reduce(
    (sum, bucket) => ({ view: sum.view + bucket.view, submit: sum.submit + bucket.submit }),
    { view: 0, submit: 0 },
  );
  const toggle = (kind: "view" | "submit") =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        {(["view", "submit"] as const).map((kind) => (
          <button
            aria-pressed={!hidden.has(kind)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${hidden.has(kind) ? "border-[#e4e8f0] text-[#9ba4b5] dark:border-white/10" : "border-[#d9dfeb] text-[#3b4150] dark:border-white/15 dark:text-white/75"}`}
            key={kind}
            onClick={() => toggle(kind)}
            type="button"
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{
                background: kind === "view" ? "var(--viz-1)" : "var(--viz-4)",
                opacity: hidden.has(kind) ? 0.3 : 1,
              }}
            />
            {kind === "view" ? "Views" : "Submissions"}
            <span className="font-semibold tabular-nums">{formatCount(totals[kind])}</span>
          </button>
        ))}
      </div>
      <div className="relative" ref={ref}>
        <svg aria-label={title} className="block" height={height} role="img" width={width}>
          <title>{title}</title>
          <desc>{`${formatCount(totals.view)} geolocated views and ${formatCount(totals.submit)} submissions in ${merged.length} places.`}</desc>
          <path d={land} fill="var(--viz-land)" />
          {(["view", "submit"] as const).map((kind) =>
            hidden.has(kind)
              ? null
              : merged
                  .filter((bucket) => bucket[kind] > 0)
                  .sort((a, b) => b[kind] - a[kind])
                  .map((bucket, index) => {
                    const { x, y } = project(bucket.latitude, bucket.longitude);
                    const r = radiusOf(bucket[kind]);
                    const tip = () =>
                      show({
                        x,
                        y: y - r,
                        content: (
                          <>
                            <TooltipTitle>
                              {[...bucket.labels].slice(0, 3).join(", ") ||
                                `${bucket.latitude.toFixed(1)}, ${bucket.longitude.toFixed(1)}`}
                            </TooltipTitle>
                            <TooltipRow
                              color="var(--viz-1)"
                              label="views"
                              value={formatCount(bucket.view)}
                            />
                            <TooltipRow
                              color="var(--viz-4)"
                              label="submissions"
                              value={formatCount(bucket.submit)}
                            />
                          </>
                        ),
                      });
                    return (
                      <circle
                        cx={x}
                        cy={y}
                        fill={kind === "view" ? "var(--viz-1)" : "var(--viz-4)"}
                        fillOpacity={kind === "view" ? 0.45 : 0.8}
                        key={`${kind}-${index}`}
                        onPointerEnter={tip}
                        onPointerLeave={hide}
                        r={kind === "submit" ? Math.max(2.5, r * 0.7) : r}
                        stroke="var(--viz-surface)"
                        strokeWidth={1.5}
                      />
                    );
                  }),
          )}
        </svg>
        <ChartTooltip tooltip={tooltip} width={width} />
      </div>
      {!merged.length ? (
        <p className="mt-2 text-xs text-[#9ba4b5] dark:text-white/35">
          No geolocated visits in this range yet.
        </p>
      ) : null}
    </div>
  );
}

/** A small map with one pin, for a single response's location. */
export function MiniMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>(280);
  const height = Math.round((width * LAND_ROWS) / LAND_COLUMNS);
  const cellW = width / LAND_COLUMNS;
  const cellH = height / LAND_ROWS;
  const land = useMemo(() => {
    const radius = Math.max(0.5, Math.min(cellW, cellH) * 0.32);
    let d = "";
    for (const [column, row] of decodeLand()) {
      d += `M${((column + 0.5) * cellW).toFixed(1)},${((row + 0.5) * cellH).toFixed(1)}h0`;
    }
    return { d, radius };
  }, [cellW, cellH]);
  const x = ((longitude + 180) / 360) * width;
  const y = ((LAND_TOP - latitude) / (LAND_TOP - LAND_BOTTOM)) * height;
  return (
    <div ref={ref}>
      <svg
        aria-label={`Location: ${label}`}
        className="block"
        height={height}
        role="img"
        width={width}
      >
        <path
          d={land.d}
          stroke="var(--viz-land)"
          strokeLinecap="round"
          strokeWidth={land.radius * 2}
        />
        <circle cx={x} cy={y} fill="var(--viz-2)" fillOpacity={0.18} r={10} />
        <circle
          cx={x}
          cy={y}
          fill="var(--viz-2)"
          r={4}
          stroke="var(--viz-surface)"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}
