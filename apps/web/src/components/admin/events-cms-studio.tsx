"use client";

import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { EventEditor } from "@/components/admin/event-editor";
import { EventRegistrationsInbox } from "@/components/admin/event-registrations-inbox";
import { useEventRecords } from "@/hooks/use-event-records";
import { useEventRegistrations } from "@/hooks/use-event-registrations";
import type { CmsEventRecord, CmsEventRegistrationRecord } from "@/lib/events-cms";

const inputClass =
  "h-10 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";

/**
 * The events workspace: events on one tab, the registrations inbox on the
 * other. Renders full-bleed (no aside rail) — mirrors CareersCmsStudio's
 * layout exactly.
 */
export function EventsCmsStudio({
  initialEvents = [],
  initialRegistrations = [],
}: {
  initialEvents?: CmsEventRecord[];
  initialRegistrations?: CmsEventRegistrationRecord[];
}) {
  const [tab, setTab] = useState<"events" | "registrations">("events");
  const { ready, records, setRecords } = useEventRecords(initialEvents);
  const { records: registrations, setRecords: setRegistrations } =
    useEventRegistrations(initialRegistrations);

  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState(0);
  const [dirty, setDirty] = useState(false);

  const sorted = useMemo(
    () => [...records].sort((left, right) => right.startAt.localeCompare(left.startAt)),
    [records],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return sorted;
    return sorted.filter((record) =>
      `${record.title} ${record.slug} ${record.location ?? ""}`
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [query, sorted]);

  const unreadCount = registrations.filter(
    (record) => record.registration.status === "inbox" && !record.registration.read,
  ).length;

  const select = (slug: string) => {
    if (
      (showNew || slug !== selectedSlug) &&
      dirty &&
      !window.confirm("Discard unsaved changes?")
    ) {
      return;
    }
    setShowNew(false);
    setSelectedSlug(slug);
  };

  const startNew = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setSelectedSlug(undefined);
    setShowNew(true);
    setNewKey((current) => current + 1);
  };

  const selected = sorted.find((record) => record.slug === selectedSlug);

  return (
    <div className="mx-auto w-full max-w-[1680px] px-6 pt-8 pb-20 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-green uppercase">
            Events
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Events workspace
          </h1>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[#dfe4ee] bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]">
          <button
            aria-current={tab === "events" ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === "events" ? "bg-[#171b25] text-white dark:bg-white dark:text-[#0e1116]" : "text-[#5d687d] hover:text-[#171b25] dark:text-white/55 dark:hover:text-white"}`}
            onClick={() => setTab("events")}
            type="button"
          >
            Events
          </button>
          <button
            aria-current={tab === "registrations" ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === "registrations" ? "bg-[#171b25] text-white dark:bg-white dark:text-[#0e1116]" : "text-[#5d687d] hover:text-[#171b25] dark:text-white/55 dark:hover:text-white"}`}
            onClick={() => setTab("registrations")}
            type="button"
          >
            Registrations
            {unreadCount > 0 ? (
              <span className="ml-2 rounded-full bg-brand-red px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {tab === "events" ? (
        <div className="mt-8 grid lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="border-b border-[#dee4ef] p-4 dark:border-white/10 lg:sticky lg:top-[69px] lg:h-[calc(100dvh-69px)] lg:overflow-hidden lg:border-b-0 lg:border-r">
            <div className="flex min-h-0 flex-col lg:h-full">
              <div className="shrink-0">
                <div className="relative">
                  <MagnifyingGlass
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
                    size={17}
                  />
                  <input
                    className={`${inputClass} pl-9`}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find an event"
                    value={query}
                  />
                </div>
                <button
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-blue/45 bg-brand-blue/[0.04] text-sm font-semibold text-brand-blue transition hover:bg-brand-blue hover:text-white active:scale-[0.98]"
                  onClick={startNew}
                  type="button"
                >
                  <Plus size={17} weight="bold" />
                  New event
                </button>
                <p className="mt-6 px-2 font-mono text-[10px] font-bold tracking-[0.16em] text-[#7e899d] uppercase dark:text-white/35">
                  Events · {ready ? records.length : "…"}
                </p>
              </div>
              <nav className="mt-2 min-h-0 space-y-1 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                {visible.map((record) => (
                  <button
                    className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${record.slug === selectedSlug && !showNew ? "bg-white shadow-[0_10px_24px_-20px_rgba(20,32,58,0.5)] dark:bg-white/10" : "hover:bg-white/70 dark:hover:bg-white/[0.05]"}`}
                    key={record.slug}
                    onClick={() => select(record.slug)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {record.title || "Untitled event"}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-[#778299] dark:text-white/45">
                        <span>{record.startAt ? record.startAt.slice(0, 10) : "no date"}</span>
                        {record.draft ? (
                          <span className="rounded-full bg-brand-yellow-50 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-[#a97b1c] uppercase">
                            Draft
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                ))}
                {!visible.length ? (
                  <p className="px-2 py-4 text-xs leading-5 text-[#9ba4b5]">
                    No events yet. Start one with &ldquo;New event&rdquo;.
                  </p>
                ) : null}
              </nav>
            </div>
          </aside>

          <section className="admin-editor-enter min-w-0 p-5 sm:p-8 lg:p-10">
            <div className="mx-auto max-w-5xl">
              {showNew || selected ? (
                <EventEditor
                  initialRecord={showNew ? undefined : selected}
                  key={
                    showNew ? `new-${newKey}` : `${selected?.slug}-${selected?.updatedAt ?? "base"}`
                  }
                  onDeleted={(slug) => {
                    setRecords((current) => current.filter((record) => record.slug !== slug));
                    setSelectedSlug(undefined);
                    setDirty(false);
                  }}
                  onDirtyChange={setDirty}
                  onSaved={(record) => {
                    setRecords((current) => [
                      ...current.filter((item) => item.slug !== record.slug),
                      record,
                    ]);
                    setSelectedSlug(record.slug);
                    setShowNew(false);
                    setDirty(false);
                  }}
                />
              ) : (
                <div className="grid h-full min-h-96 place-items-center rounded-2xl border border-dashed border-[#d9dfeb] px-8 text-center dark:border-white/10">
                  <div>
                    <p className="font-display text-xl font-semibold tracking-[-0.03em]">
                      Select an event
                    </p>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-[#778299] dark:text-white/45">
                      Pick an event from the sidebar, or create a new one. Published events show up
                      on the public events page immediately.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <EventRegistrationsInbox records={registrations} setRecords={setRegistrations} />
      )}
    </div>
  );
}
