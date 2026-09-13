"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type Member, type MemberDivision } from "@/data/members";
import { useMemberRecords } from "@/hooks/use-member-records";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";

type Filter = "All" | MemberDivision;

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
    items: ["Website", "Mobile", "HCI/UX", "Game & XR"],
  },
  {
    label: "Laboratory teams",
    items: ["IT & Infrastructure", "Public Relations", "Media", "Curriculum", "Human Resource"],
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
const DIVISION_LOGOS: Record<MemberDivision, string> = {
  Professors: "/logo.svg",
  Website: "/logo/rnd.svg",
  Mobile: "/logo/rnd.svg",
  "HCI/UX": "/logo/rnd.svg",
  "Game & XR": "/logo/rnd.svg",
  "IT & Infrastructure": "/logo/infra.svg",
  "Public Relations": "/logo/pr.svg",
  Media: "/logo/media.svg",
  Curriculum: "/logo/curriculum.svg",
  "Human Resource": "/logo/hr.svg",
};

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

function scoreMember(member: Member, query: string, profileText = "") {
  const normalizedQuery = normalize(query);
  const requiredYears = normalizedQuery.match(/\b(\d+)\s*(?:years?|yrs?)\b/)?.[1];
  const normalizedProfileText = normalize(profileText);

  if (requiredYears && !normalizedProfileText.includes(`${requiredYears} years`)) return -1000;

  const terms = normalizedQuery
    .split(" ")
    .filter(
      (term) =>
        term &&
        !STOP_WORDS.has(term) &&
        term !== requiredYears &&
        term !== "year" &&
        term !== "years" &&
        term !== "yrs",
    );
  if (!terms.length) return 1;

  const fields = [
    member.name,
    member.nickname ?? "",
    member.division,
    member.group,
    member.unit ?? "",
    member.bio,
    ...member.labFocus,
  ].map(normalize);

  return terms.reduce((total, term) => {
    const candidates = SEARCH_ALIASES[term] ?? [term];
    const fuzzyMatch = Math.max(
      ...candidates.flatMap((candidate) => fields.map((field) => fuzzyScore(field, candidate))),
    );
    const profileMatch = Math.max(
      ...candidates.map((candidate) =>
        normalizedProfileText.includes(candidate) ? candidate.length * 4 : 0,
      ),
    );
    const best = Math.max(fuzzyMatch, profileMatch);
    return best ? total + best : -1000;
  }, 0);
}

function matchesFilter(member: Member, filter: Filter) {
  if (filter === "All") return true;
  return member.division === filter;
}

function matchesRequestedExperience(profileText: string | undefined, query: string) {
  const years = normalize(query).match(/\b(\d+)\s*(?:years?|yrs?)\b/)?.[1];
  return !years || normalize(profileText ?? "").includes(`${years} years`);
}

function FilterButton({
  active,
  count,
  filter,
  onClick,
}: {
  active: boolean;
  count: number;
  filter: Filter;
  onClick: () => void;
}) {
  const logo = filter === "All" ? undefined : DIVISION_LOGOS[filter];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-[color,box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none ${
        active
          ? "bg-brand-blue text-white shadow-[0_8px_20px_-14px_rgba(58,109,197,0.8)]"
          : "text-[var(--ink-2)] hover:bg-black/[0.045] dark:text-white/70 dark:hover:bg-white/[0.07]"
      } font-medium`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {logo ? (
          <Image
            src={logo}
            alt=""
            aria-hidden="true"
            width={18}
            height={18}
            className="size-[18px] shrink-0 object-contain"
          />
        ) : null}
        <span>{filter}</span>
      </span>
      <span
        className={`font-mono text-[11px] ${active ? "text-white/70" : "text-[var(--ink-3)] dark:text-white/40"}`}
      >
        {count}
      </span>
    </button>
  );
}

function Portrait({
  member,
  index,
  photoKey,
  recordsReady,
  sourceSlug,
}: {
  member: Member;
  index: number;
  photoKey?: string;
  recordsReady: boolean;
  sourceSlug?: string;
}) {
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
      {photoKey || (recordsReady && member.hasPortrait) ? (
        <Image
          src={
            photoKey
              ? `/api/member-cms/media/${photoKey}`
              : `/members/${sourceSlug ?? member.slug}.png`
          }
          alt=""
          fill
          key={photoKey ?? sourceSlug ?? member.slug}
          sizes="48px"
          unoptimized={Boolean(photoKey)}
          className={`${photoKey ? "object-cover" : "object-contain object-bottom"} transition-transform duration-500 ease-out group-hover/member:scale-105`}
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
  const { members, ready: recordsReady, records } = useMemberRecords();
  const root = useRef<HTMLDivElement>(null);
  const searchAnchor = useRef<HTMLDivElement>(null);
  const searchSurface = useRef<HTMLDivElement>(null);
  const shouldResetDirectoryScroll = useRef(false);
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [profileSearchIndex, setProfileSearchIndex] = useState<Record<string, string>>({});
  const [scrollResetVersion, setScrollResetVersion] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const recordsBySlug = useMemo(
    () => new Map(records.map((record) => [record.slug, record])),
    [records],
  );

  useEffect(() => {
    const controller = new AbortController();
    const loadIndex = () =>
      fetch("/member-profiles/index.json", { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : {}))
        .then((index: Record<string, string>) => {
          setProfileSearchIndex(index);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
        });

    const idleCallback = window.requestIdleCallback?.(loadIndex);
    if (idleCallback === undefined) {
      void loadIndex();
    }

    return () => {
      controller.abort();
      if (idleCallback !== undefined) window.cancelIdleCallback?.(idleCallback);
    };
  }, []);

  const filteredMembers = useMemo(() => {
    return members
      .flatMap((member) => {
        if (!matchesFilter(member, filter)) return [];
        if (!matchesRequestedExperience(profileSearchIndex[member.slug], deferredQuery)) return [];
        const score = scoreMember(member, deferredQuery, profileSearchIndex[member.slug]);
        return score < 0 ? [] : [{ member, record: recordsBySlug.get(member.slug), score }];
      })
      .toSorted((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name));
  }, [deferredQuery, filter, members, profileSearchIndex, recordsBySlug]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;

    const reveal = fadeUpOnScroll(element, ".member-directory-reveal", { stagger: 0.12, y: 26 });
    return () => {
      reveal?.kill();
    };
  }, []);

  const countFor = (candidate: Filter) =>
    members.filter((member) => matchesFilter(member, candidate)).length;
  const isSearching = query !== deferredQuery;
  useLayoutEffect(() => {
    if (!shouldResetDirectoryScroll.current) return;

    const anchor = searchAnchor.current;
    const surface = searchSurface.current;
    if (!anchor || !surface) return;

    const stickyTop = Number.parseFloat(window.getComputedStyle(surface).top) || 0;
    const anchorTop = window.scrollY + anchor.getBoundingClientRect().top;
    window.scrollTo({ behavior: "auto", top: Math.max(0, anchorTop - stickyTop) });
    shouldResetDirectoryScroll.current = false;
  }, [scrollResetVersion]);
  const requestScrollReset = () => {
    shouldResetDirectoryScroll.current = true;
    setScrollResetVersion((version) => version + 1);
  };
  const updateFilter = (nextFilter: Filter) => {
    requestScrollReset();
    setFilter(nextFilter);
  };
  const updateQuery = (nextQuery: string) => {
    requestScrollReset();
    setQuery(nextQuery);
  };

  return (
    <section ref={root} className="relative px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="member-directory-reveal mx-auto max-w-[1440px]">
        <div className="border-b border-[var(--line)] pb-8">
          <div>
            <p className="font-mono text-xs tracking-[0.16em] text-brand-blue uppercase">
              Find your collaborator
            </p>
            <h2 className="mt-3 max-w-none whitespace-nowrap font-display text-[clamp(1.75rem,4vw,3.5rem)] font-semibold tracking-tight text-[var(--ink)] dark:text-white">
              Search our geniuses
            </h2>
          </div>
        </div>

        <div ref={searchAnchor} aria-hidden="true" className="mt-8 h-0" />
        <div
          ref={searchSurface}
          className="member-directory-reveal group/search sticky top-16 z-30 isolate -mx-3 bg-background px-3 py-3 shadow-[0_18px_30px_-28px_rgba(14,17,22,0.28)] dark:shadow-[0_18px_30px_-28px_rgba(0,0,0,0.75)]"
        >
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
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="Try “JavaScript”, “Flutter”, “XR”, or a name"
              className="min-w-0 flex-1 bg-transparent px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none dark:text-white dark:placeholder:text-white/40 sm:text-lg"
            />
            {query ? (
              <button
                type="button"
                onClick={() => updateQuery("")}
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
          <aside className="member-directory-reveal lg:sticky lg:top-[11.5rem]">
            <div className="rounded-2xl border border-[var(--line)] bg-black/[0.015] p-2 dark:bg-white/[0.025]">
              <FilterButton
                active={filter === "All"}
                count={members.length}
                filter="All"
                onClick={() => updateFilter("All")}
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
                      onClick={() => updateFilter(item)}
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
                  onClick={() => updateFilter("All")}
                  className="text-sm font-medium text-brand-blue transition-colors hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none dark:hover:text-white"
                >
                  Reset filter
                </button>
              ) : null}
            </div>

            {filteredMembers.length ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filteredMembers.map(({ member, record }, index) => (
                  <article
                    key={member.slug}
                    className="member-card min-w-0 py-1 [content-visibility:auto]"
                  >
                    <Link
                      href={`/member/${member.slug}`}
                      className="group/member relative z-0 block focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-4 focus-visible:outline-none hover:z-10 dark:focus-visible:ring-offset-[#15181e]"
                    >
                      <div className="relative z-0 rounded-2xl border border-[var(--line)] bg-background p-5 shadow-[var(--shadow-1)] transition-[transform,border-color,box-shadow] duration-300 group-hover/member:z-10 group-hover/member:-translate-y-0.5 group-hover/member:border-brand-blue/45 group-hover/member:shadow-[0_20px_40px_-30px_rgba(14,17,22,0.5)] dark:bg-[#171c24]">
                        <div className="flex gap-4">
                          <Portrait
                            member={member}
                            index={index}
                            photoKey={record?.profile.photoKey}
                            recordsReady={recordsReady}
                            sourceSlug={record?.sourceSlug}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-brand-blue">
                                  {member.division}
                                </p>
                                {member.unit ? (
                                  <p className="mt-0.5 text-[11px] font-medium text-[var(--ink-3)] dark:text-white/45">
                                    {member.unit}
                                  </p>
                                ) : null}
                              </div>
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
                      updateFilter("All");
                      updateQuery("");
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
