"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useMemberRecords } from "@/hooks/use-member-records";
import type { CmsMemberRecord } from "@/lib/member-cms";
import DriftWall, { type DriftWallItem } from "./drift-wall/drift-wall";
import { RevealSection } from "./reveal-section";

/**
 * All four edges fade to the section's own background color (not just to
 * transparent) so the wall reads as emerging from the page rather than
 * being cropped by a hard rectangle — layered on top of DriftWall's own
 * internal vignette mask, which only fades tiles, not into a real color.
 * Top/bottom are deliberately deep (pulled in toward the middle) so the
 * wall reads as a shorter band even though the container itself is tall.
 */
function EdgeFade() {
  const edge = "var(--surface-muted)";
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        className="absolute inset-x-0 top-0 h-[30%]"
        style={{ background: `linear-gradient(to bottom, ${edge}, transparent)` }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[30%]"
        style={{ background: `linear-gradient(to top, ${edge}, transparent)` }}
      />
      <div
        className="absolute inset-y-0 left-0 w-[8%]"
        style={{ background: `linear-gradient(to right, ${edge}, transparent)` }}
      />
      <div
        className="absolute inset-y-0 right-0 w-[8%]"
        style={{ background: `linear-gradient(to left, ${edge}, transparent)` }}
      />
    </div>
  );
}

const WALL_COLUMNS = 12;

// The wall reads better dense than sparse. When there aren't enough distinct
// member photos to fill it, repeat them — but spread the repeats out (a
// golden-ratio offset per lap, then a swap pass) so the same face never
// starts out beside or above/below itself, including the seam where
// DriftWall loops a column's list back to its own start. This is a
// best-effort layout at construction time, not a runtime guarantee — columns
// drift continuously at different speeds, so which faces end up horizontally
// next to each other keeps changing after mount.
function buildWallItems(
  unique: DriftWallItem[],
  columns: number,
  minRows: number,
): DriftWallItem[] {
  if (unique.length === 0) return [];
  const target = Math.max(unique.length, columns * minRows);
  const extended: DriftWallItem[] = [];
  const lapOffset = Math.max(1, Math.ceil(unique.length / 2));
  let lap = 0;
  while (extended.length < target) {
    const offset = (lap * lapOffset) % unique.length;
    for (let i = 0; i < unique.length && extended.length < target; i++) {
      extended.push(unique[(i + offset) % unique.length]);
    }
    lap++;
  }

  const clashesAt = (index: number, image: string) => {
    const left = index % columns !== 0 && extended[index - 1]?.image === image;
    const above = index >= columns && extended[index - columns]?.image === image;
    return left || above;
  };

  for (let i = 0; i < extended.length; i++) {
    if (!clashesAt(i, extended[i].image)) continue;
    for (let j = i + 1; j < extended.length; j++) {
      if (clashesAt(i, extended[j].image) || clashesAt(j, extended[i].image)) continue;
      [extended[i], extended[j]] = [extended[j], extended[i]];
      break;
    }
  }

  // DriftWall renders each column's slice of this list as several stacked
  // copies back-to-back to loop seamlessly, so that column's last entry sits
  // directly above its own first entry at every loop boundary.
  for (let c = 0; c < columns; c++) {
    const colIndexes: number[] = [];
    for (let i = c; i < extended.length; i += columns) colIndexes.push(i);
    if (colIndexes.length < 2) continue;
    const first = colIndexes[0];
    const last = colIndexes[colIndexes.length - 1];
    if (extended[first].image !== extended[last].image) continue;
    for (let k = 1; k < colIndexes.length - 1; k++) {
      const mid = colIndexes[k];
      if (extended[mid].image === extended[first].image) continue;
      [extended[last], extended[mid]] = [extended[mid], extended[last]];
      break;
    }
  }

  return extended;
}

export function TeamSpotlight({
  initialRecords = [],
}: {
  initialRecords?: readonly CmsMemberRecord[];
}) {
  const { members, records } = useMemberRecords(initialRecords);

  const photoKeyBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of records) {
      if (!record.profile.photoKey) continue;
      map.set(record.slug, record.profile.photoKey);
      if (record.sourceSlug) map.set(record.sourceSlug, record.profile.photoKey);
    }
    return map;
  }, [records]);

  // Every real member, not a curated handful — the wall only works with an
  // actual photo, so anyone without one still appears via the "meet the
  // whole team" link below instead of a blank tile in the middle of it.
  const wallItems = useMemo<DriftWallItem[]>(() => {
    const unique = members
      .filter((m) => photoKeyBySlug.has(m.slug))
      .map((m) => ({
        image: `/api/member-cms/media/${photoKeyBySlug.get(m.slug)}`,
        title: m.name,
        href: `/member/${m.slug}`,
      }));
    return buildWallItems(unique, WALL_COLUMNS, 6);
  }, [members, photoKeyBySlug]);

  if (members.length === 0) return null;

  return (
    <section className="bg-[var(--surface-muted)] py-20 sm:py-28">
      <RevealSection className="mx-auto max-w-5xl px-6 sm:px-10 lg:px-16" stagger={0.06}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="reveal-item text-sm font-semibold tracking-wide text-brand-yellow uppercase opacity-0">
              Our people
            </p>
            <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
              Everyone who actually builds this
            </h2>
          </div>
          <Link
            href="/member"
            className="reveal-item group flex items-center gap-1.5 text-sm font-medium text-[var(--ink)] opacity-0 dark:text-white"
          >
            Meet the whole team
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </RevealSection>

      {wallItems.length > 0 ? (
        <RevealSection className="mt-10">
          <div className="reveal-item relative h-[600px] w-full overflow-hidden opacity-0 sm:h-[720px]">
            <DriftWall
              items={wallItems}
              columns={WALL_COLUMNS}
              tileWidth={130}
              tileHeight={130}
              gap={12}
              radius={14}
              tilt={10}
              turn={-8}
              perspective={1300}
              depth={90}
              speed={26}
              direction="up"
              variance={0.4}
              parallax={0.35}
              lift={40}
              fade={0.45}
              dim={0.92}
              overlayColor="var(--ink)"
              overlayOpacity={0.12}
            />
            <EdgeFade />
          </div>
        </RevealSection>
      ) : null}
    </section>
  );
}
