import type { Metadata } from "next";

import { EventsExplorer } from "@/components/events/events-explorer";
import { FlairShape } from "@/components/process/pattern-tile";
import { CtaFooter } from "@/components/sections/cta-footer";
import { fetchEventsFeed } from "@/lib/events-cms-server";
import type { CmsEventRecord } from "@/lib/events-cms";

export const metadata: Metadata = {
  title: "Events — MGM Laboratory",
  description: "Talks, workshops, and showcases hosted by MGM Laboratory.",
};

// Events resolves entirely at request time: an admin publishing a new event
// must reach the public page and calendar feed immediately.
export const revalidate = 0;

async function readEvents() {
  try {
    return await fetchEventsFeed();
  } catch {
    return [] as CmsEventRecord[];
  }
}

export default async function EventsPage() {
  const events = await readEvents();

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="relative mx-auto flex min-h-[45vh] w-full max-w-[1200px] flex-col justify-center px-6 py-20 sm:px-10 lg:px-14">
            <FlairShape
              className="pointer-events-none absolute -top-6 -right-8 size-56 opacity-20 sm:size-80 sm:opacity-25 dark:opacity-35"
              kind="fans"
              tone="red"
            />
            <FlairShape
              className="pointer-events-none absolute right-24 bottom-10 size-16 opacity-15 sm:size-24 dark:opacity-30"
              kind="circle"
              tone="red"
            />
            <div className="relative max-w-2xl">
              <p className="text-sm font-bold tracking-[0.12em] text-brand-red uppercase">Events</p>
              <h1 className="mt-5 font-display text-[clamp(2.5rem,6vw+1rem,4.5rem)] leading-[1.02] font-semibold tracking-[-0.03em] text-[#0e1116] dark:text-white">
                Talks, workshops, and showcases.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--ink-2)] dark:text-[#c3c7d1]">
                Where the lab shares what it&apos;s building and learning with the wider community.
                Subscribe once and every new event lands on your own calendar.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1200px] px-6 pb-32 sm:px-10 lg:px-14">
          <EventsExplorer records={events} />
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
