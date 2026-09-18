import { Skeleton } from "@/components/ui/skeleton";

function JobCardSkeleton() {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-2xl border border-[var(--line)] bg-white p-6 dark:bg-white/[0.045]">
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="mt-4 h-6 w-4/5" />
      <Skeleton className="mt-3 h-4 w-3/5" />
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Skeleton className="h-5 w-16 rounded-md" />
        <Skeleton className="h-5 w-14 rounded-md" />
        <Skeleton className="h-5 w-12 rounded-md" />
      </div>
    </div>
  );
}

export default function CareersLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1200px] px-[55px] pt-24 pb-20">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-12 w-64" />
          <Skeleton className="mt-5 h-6 w-full max-w-2xl" />
          <Skeleton className="mt-2 h-6 w-4/5 max-w-2xl" />
          <Skeleton className="mt-10 h-24 w-full rounded-2xl" />
          <Skeleton className="mt-8 h-12 w-full rounded-full" />
        </section>

        <section className="mx-auto w-full max-w-[1200px] px-[55px] pb-40">
          <Skeleton className="h-4 w-32" />
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <JobCardSkeleton key={index} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
