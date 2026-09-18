import { Skeleton } from "@/components/ui/skeleton";

function EventRowSkeleton() {
  return (
    <li className="flex gap-5 py-6 sm:gap-6">
      <Skeleton className="aspect-video w-28 shrink-0 rounded-2xl sm:w-40" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-6 w-3/4" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <div className="mt-3 flex gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </li>
  );
}

export default function EventsLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="relative mx-auto flex min-h-[45vh] w-full max-w-[1200px] flex-col justify-center px-6 py-20 sm:px-10 lg:px-14">
            <div className="max-w-2xl">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="mt-5 h-14 w-full" />
              <Skeleton className="mt-2 h-14 w-4/5" />
              <Skeleton className="mt-6 h-6 w-full max-w-xl" />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1200px] px-6 pb-32 sm:px-10 lg:px-14">
          <Skeleton className="h-11 w-full rounded-full" />
          <div className="mt-10">
            <Skeleton className="h-5 w-24" />
            <ul className="mt-2 divide-y divide-[var(--line)] border-y border-[var(--line)] dark:divide-white/10 dark:border-white/10">
              {Array.from({ length: 4 }).map((_, index) => (
                <EventRowSkeleton key={index} />
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
