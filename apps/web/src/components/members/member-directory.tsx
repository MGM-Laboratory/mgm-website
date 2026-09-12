"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Search, SlidersHorizontal, X } from "lucide-react";
import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from "react";

import { MEMBERS, type Member, type MemberDivision } from "@/data/members";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";

type Filter = "All" | "Research and Development" | MemberDivision;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "is",
  "looking",
  "mastered",
  "of",
  "or",
  "the",
  "to",
  "with",
]);

const SEARCH_ALIASES: Record<string, readonly string[]> = {
  android: ["android", "mobile"],
  flutter: ["flutter", "mobile"],
  game: ["game", "xr", "interactive"],
  javascript: ["javascript", "website", "web"],
  js: ["javascript", "website", "web"],
  mobile: ["mobile", "flutter", "android"],
  research: ["research", "ux", "hci"],
  ux: ["ux", "hci", "research"],
  vr: ["vr", "xr", "game"],
  xr: ["xr", "game", "interactive"],
};

const FILTER_GROUPS: ReadonlyArray<{
  label: string;
  items: readonly Filter[];
}> = [
  { label: "People", items: ["Professors"] },
  {
    label: "Research and Development",
    items: ["Research and Development", "Website", "Mobile", "HCI/UX", "Game & XR"],
  },
  {
    label: "Laboratory teams",
    items: [
      "IT & Infrastructure",
      "Public Relations",
      "Media",
      "Curriculum",
      "Human Resource",
      "Academic Support",
      "Secretariat",
    ],
  },
];

const CARD_SURFACES = [
  "bg-brand-blue-50 dark:bg-[#1b2944]",
  "bg-brand-yellow-50 dark:bg-[#342d19]",
  "bg-brand-red-50 dark:bg-[#3a2429]",
  "bg-brand-green-50 dark:bg-[#1c3029]",
];
const ACCENT_COLORS = {
  blue: "bg-brand-blue",
  yellow: "bg-brand-yellow",
  red: "bg-brand-red",
  green: "bg-brand-green",
} as const;

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fuzzyScore(value: string, query: string) {
  if (value.includes(query)) return query.length * 4;

  let cursor = 0;
  let streak = 0;
  let score = 0;

  for (const character of query) {
    const match = value.indexOf(character, cursor);
    if (match === -1) return 0;
    streak = match === cursor ? streak + 1 : 1;
    score += streak * 2;
    cursor = match + 1;
  }

  return score;
}

function scoreMember(member: Member, query: string) {
  const normalizedQuery = normalize(query);
  const requiredYears = normalizedQuery.match(/\b(\d+)\s*(?:years?|yrs?)\b/)?.[1];

  if (requiredYears) {
    return -1;
  }

  const terms = normalizedQuery.split(" ").filter((term) => term && !STOP_WORDS.has(term));
  if (!terms.length) return 1;

  const fields = [
    member.name,
    member.nickname ?? "",
    member.division,
    member.group,
    member.bio,
    ...member.labFocus,
  ].map(normalize);

  return terms.reduce((total, term) => {
    const candidates = SEARCH_ALIASES[term] ?? [term];
    const best = Math.max(
      ...candidates.flatMap((candidate) => fields.map((field) => fuzzyScore(field, candidate))),
    );
    return best ? total + best : -1000;
  }, 0);
}

function matchesFilter(member: Member, filter: Filter) {
  if (filter === "All") return true;
  if (filter === "Research and Development") return member.group === filter;
  return member.division === filter;
}

function FilterButton({
  active,
  count,
  filter,
  onClick,
  nested = false,
}: {
  active: boolean;
  count: number;
  filter: Filter;
  nested?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-[color,box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none ${
        active
          ? "bg-brand-blue text-white shadow-[0_8px_20px_-14px_rgba(58,109,197,0.8)]"
          : "text-[var(--ink-2)] hover:bg-black/[0.045] dark:text-white/70 dark:hover:bg-white/[0.07]"
      } ${nested ? "ml-3 w-[calc(100%-0.75rem)] text-[13px]" : "font-medium"}`}
    >
      <span>{filter}</span>
      <span
        className={`font-mono text-[11px] ${active ? "text-white/70" : "text-[var(--ink-3)] dark:text-white/40"}`}
      >
        {count}
      </span>
    </button>
  );
}

function Portrait({ member, index }: { member: Member; index: number }) {
  const initials = member.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");

  return (
    <div
      className={`relative size-12 shrink-0 overflow-hidden rounded-xl border border-white/55 ${CARD_SURFACES[index % CARD_SURFACES.length]}`}
    >
      <div
        aria-hidden="true"
        className={`absolute -right-3 -bottom-3 size-8 rounded-full ${ACCENT_COLORS[member.accent]} opacity-90`}
      />
      {member.hasPortrait ? (
        <Image
          src={`/members/${member.slug}.webp`}
          alt=""
          fill
          sizes="48px"
          className="object-contain object-bottom transition-transform duration-500 ease-out group-hover/member:scale-105"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center font-display text-sm font-semibold tracking-tight text-[var(--ink)]/80 dark:text-white/80">
          {initials}
        </span>
      )}
    </div>
  );
}

export function MemberDirectory() {
  const root = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filteredMembers = useMemo(() => {
    return MEMBERS.flatMap((member) => {
      if (!matchesFilter(member, filter)) return [];
      const score = scoreMember(member, deferredQuery);
      return score < 0 ? [] : [{ member, score }];
    }).toSorted((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name));
  }, [deferredQuery, filter]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;

    const reveal = fadeUpOnScroll(element, ".member-directory-reveal", { stagger: 0.12, y: 26 });
    return () => {
      reveal?.kill();
    };
  }, []);

  const countFor = (candidate: Filter) =>
    MEMBERS.filter((member) => matchesFilter(member, candidate)).length;
  const isSearching = query !== deferredQuery;

  return (
    <section ref={root} className="relative px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="member-directory-reveal mx-auto max-w-[1440px]">
        <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.16em] text-brand-blue uppercase">
              Find your collaborator
            </p>
            <h2 className="mt-3 max-w-xl font-display text-[clamp(2rem,4vw,3.5rem)] font-semibold tracking-tight text-[var(--ink)] dark:text-white">
              Search the people behind the work.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
            Search names, divisions, or lab focus. Fuzzy matching helps with imperfect spelling and
            related terms.
          </p>
        </div>

        <div className="member-directory-reveal group/search relative mt-8">
          <div className="absolute -inset-2 rounded-[1.35rem] bg-brand-blue/10 opacity-0 blur-xl transition-opacity duration-500 group-focus-within/search:opacity-100" />
          <div className="relative flex items-center rounded-2xl border border-[var(--line-strong)] bg-background px-4 py-3 shadow-[var(--shadow-1)] transition-[border-color,box-shadow,background-color] duration-300 focus-within:border-brand-blue focus-within:bg-white focus-within:shadow-[0_16px_45px_-28px_rgba(58,109,197,0.75)] dark:focus-within:bg-[#1b202a]">
            <Search
              aria-hidden="true"
              size={22}
              strokeWidth={2.25}
              className="shrink-0 text-brand-blue"
            />
            <label htmlFor="member-search" className="sr-only">
              Search MGM Laboratory members
            </label>
            <input
              id="member-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “JavaScript”, “Flutter”, “XR”, or a name"
              className="min-w-0 flex-1 bg-transparent px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none dark:text-white dark:placeholder:text-white/40 sm:text-lg"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--ink-2)] transition-colors hover:bg-black/[0.06] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Clear member search"
              >
                <X size={18} strokeWidth={2.25} />
              </button>
            ) : null}
          </div>
          <div
            className="mt-3 flex min-h-5 items-center justify-between px-1 text-xs text-[var(--ink-3)] dark:text-white/45"
            aria-live="polite"
          >
            <span>
              {query
                ? `${filteredMembers.length} result${filteredMembers.length === 1 ? "" : "s"} for “${query}”`
                : "Search is ready"}
            </span>
            {isSearching ? (
              <span className="member-search-pulse text-brand-blue">Matching</span>
            ) : null}
          </div>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
          <aside className="member-directory-reveal lg:sticky lg:top-24">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)] dark:text-white">
              <SlidersHorizontal size={18} strokeWidth={2.25} className="text-brand-blue" />
              Filter by division
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--line)] bg-black/[0.015] p-2 dark:bg-white/[0.025]">
              <FilterButton
                active={filter === "All"}
                count={MEMBERS.length}
                filter="All"
                onClick={() => setFilter("All")}
              />
              {FILTER_GROUPS.map((group) => (
                <div key={group.label} className="mt-4 first:mt-2">
                  <p className="px-3 pb-1 font-mono text-[10px] tracking-[0.14em] text-[var(--ink-3)] uppercase dark:text-white/40">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <FilterButton
                      key={item}
                      active={filter === item}
                      count={countFor(item)}
                      filter={item}
                      nested={
                        group.label === "Research and Development" &&
                        item !== "Research and Development"
                      }
                      onClick={() => setFilter(item)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="member-directory-reveal flex items-center justify-between gap-4 pb-5">
              <p className="text-sm text-[var(--ink-2)] dark:text-white/60">
                <span className="font-semibold text-[var(--ink)] dark:text-white">
                  {filteredMembers.length}
                </span>{" "}
                members shown
              </p>
              {filter !== "All" ? (
                <button
                  type="button"
                  onClick={() => setFilter("All")}
                  className="text-sm font-medium text-brand-blue transition-colors hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none dark:hover:text-white"
                >
                  Reset filter
                </button>
              ) : null}
            </div>

            {filteredMembers.length ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filteredMembers.map(({ member }, index) => (
                  <article
                    key={member.slug}
                    className="member-card min-w-0 [content-visibility:auto]"
                  >
                    <Link
                      href={`/member/${member.slug}`}
                      className="group/member block focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-4 focus-visible:outline-none dark:focus-visible:ring-offset-[#15181e]"
                    >
                      <div className="rounded-2xl border border-[var(--line)] bg-background p-5 shadow-[var(--shadow-1)] transition-[transform,border-color,box-shadow] duration-300 group-hover/member:-translate-y-0.5 group-hover/member:border-brand-blue/45 group-hover/member:shadow-[0_20px_40px_-30px_rgba(14,17,22,0.5)] dark:bg-[#171c24]">
                        <div className="flex gap-4">
                          <Portrait member={member} index={index} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-xs font-medium text-brand-blue">
                                {member.division}
                              </p>
                              <ArrowUpRight
                                aria-hidden="true"
                                size={18}
                                strokeWidth={2.25}
                                className="mt-0.5 shrink-0 text-brand-blue transition-transform duration-300 group-hover/member:-translate-y-1 group-hover/member:translate-x-1"
                              />
                            </div>
                            <h3 className="mt-1 font-display text-xl font-semibold tracking-tight text-[var(--ink)] dark:text-white">
                              {member.name}
                            </h3>
                            <p className="mt-2 line-clamp-2 text-sm leading-5 text-[var(--ink-2)] dark:text-white/65">
                              {member.bio}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-3">
                          {member.labFocus.slice(0, 3).map((focus) => (
                            <span
                              key={focus}
                              className="rounded-full bg-black/[0.045] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-2)] dark:bg-white/[0.07] dark:text-white/65"
                            >
                              {focus}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="member-directory-reveal grid min-h-80 place-items-center border border-dashed border-[var(--line-strong)] px-6 text-center">
                <div>
                  <p className="font-display text-2xl font-semibold tracking-tight text-[var(--ink)] dark:text-white">
                    No published profile matches that search.
                  </p>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
                    Try a name, division, or lab focus. Experience and individual skill history will
                    appear here when those CMS fields are published.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("All");
                      setQuery("");
                    }}
                    className="mt-5 font-medium text-brand-blue transition-colors hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none dark:hover:text-white"
                  >
                    View every member
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
