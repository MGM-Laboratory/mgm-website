import { Skeleton } from "@/components/ui/skeleton";

export default function MemberDetailLoading() {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-6 pt-24 pb-16 sm:px-10 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Skeleton className="aspect-[4/5] w-full rounded-none" />

        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-10 w-2/3" />
          <Skeleton className="mt-2 h-5 w-1/3" />

          <div className="mt-5 flex gap-2">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>

          <div className="mt-9 space-y-3 border-t border-[var(--line)] pt-9 dark:border-white/10">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
