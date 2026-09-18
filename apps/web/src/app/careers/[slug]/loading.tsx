import { Skeleton } from "@/components/ui/skeleton";
import { RouteLoadingSentinel } from "@/components/transition/route-loading-sentinel";

export default function CareerDetailLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <RouteLoadingSentinel />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[860px] px-6 pt-16 pb-24 sm:px-10">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-10 h-3 w-28" />
          <Skeleton className="mt-3 h-11 w-3/4" />

          <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)]">
            <div className="grid grid-cols-2 gap-px bg-[var(--line)] lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div className="bg-white p-5 dark:bg-[#0e1116]" key={index}>
                  <Skeleton className="h-2.5 w-14" />
                  <Skeleton className="mt-2 h-4 w-20" />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="mt-4 h-12 w-40 rounded-xl" />
          </div>

          <div className="mt-14">
            <Skeleton className="h-3 w-32" />
            <div className="mt-6 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
