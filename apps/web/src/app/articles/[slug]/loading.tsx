import { Skeleton } from "@/components/ui/skeleton";
import { RouteLoadingSentinel } from "@/components/transition/route-loading-sentinel";

export default function ArticleDetailLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <RouteLoadingSentinel />
      <main className="flex-1">
        <article className="mx-auto max-w-[1200px] pt-[91px] pb-16">
          <header className="flex flex-col items-center text-center">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-5 h-11 w-3/4 max-w-2xl" />
            <Skeleton className="mt-4 h-8 w-1/2 max-w-xl" />
            <div className="mt-6 flex gap-2">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-16" />
            </div>
          </header>

          <Skeleton className="mt-[58px] aspect-[1200/482] w-full rounded-[24px]" />

          <div className="mt-[58px] grid grid-cols-[128px_minmax(0,1fr)] gap-x-[111px] px-6 sm:px-10 lg:px-14 max-lg:grid-cols-1 max-lg:gap-x-0">
            <div className="min-w-0">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-5 w-24" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
