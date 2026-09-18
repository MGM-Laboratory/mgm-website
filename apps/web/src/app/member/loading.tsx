import { Skeleton } from "@/components/ui/skeleton";

function MemberCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white dark:border-white/10 dark:bg-white/[0.03]">
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
      <div className="p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/2" />
      </div>
    </div>
  );
}

export default function MemberLoading() {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col">
      <section className="relative min-h-[max(76dvh,56.25vw)] overflow-hidden bg-[var(--background)] pt-16">
        <Skeleton className="absolute inset-x-0 top-16 aspect-video w-full rounded-none" />
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 py-16 sm:px-10">
        <Skeleton className="h-11 w-full rounded-full" />
        <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <MemberCardSkeleton key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
