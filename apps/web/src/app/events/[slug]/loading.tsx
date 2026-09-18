import { Skeleton } from "@/components/ui/skeleton";
import { RouteLoadingSentinel } from "@/components/transition/route-loading-sentinel";

export default function EventDetailLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <RouteLoadingSentinel />
      <main className="flex-1">
        <article className="mx-auto max-w-[900px] px-6 pt-[91px] pb-16 sm:px-10">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-8 h-11 w-3/4" />
          <Skeleton className="mt-4 h-5 w-1/2" />

          <Skeleton className="mt-10 aspect-video w-full rounded-2xl" />

          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="mt-2 h-4 w-20" />
              </div>
            ))}
          </div>

          <div className="mt-10 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </article>
      </main>
    </div>
  );
}
