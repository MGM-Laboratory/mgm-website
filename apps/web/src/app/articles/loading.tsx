import { Skeleton } from "@/components/ui/skeleton";
import { RouteLoadingSentinel } from "@/components/transition/route-loading-sentinel";

function ArticleCardSkeleton() {
  return (
    <div className="block min-w-0">
      <Skeleton className="aspect-[370/230] w-full rounded-none" />
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="mt-3 h-7 w-4/5" />
      <Skeleton className="mt-2 h-4 w-2/5" />
    </div>
  );
}

export default function ArticlesLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <RouteLoadingSentinel />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1200px] px-6 pt-24 pb-20 sm:px-10 lg:px-14">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-4 h-12 w-56" />
          <Skeleton className="mt-5 h-6 w-full max-w-2xl" />
          <Skeleton className="mt-2 h-6 w-3/5 max-w-2xl" />
          <Skeleton className="mt-8 h-12 w-full rounded-full" />
        </section>

        <section className="mx-auto w-full max-w-[1200px] px-6 pb-32 sm:px-10 lg:px-14">
          <div className="grid grid-cols-1 gap-x-[25px] gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <ArticleCardSkeleton key={index} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
