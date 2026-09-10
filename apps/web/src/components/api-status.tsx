"use client";

import { useHealth } from "@/hooks/use-health";
import { cn } from "@/lib/utils";

export function ApiStatus() {
  const { data, isPending, isError } = useHealth();

  const label = isPending ? "Checking API…" : isError ? "API unreachable" : `API ${data.status}`;
  const dotColor = isPending ? "bg-amber-500" : isError ? "bg-red-500" : "bg-emerald-500";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-sm dark:border-white/10">
      <span className={cn("size-2 rounded-full", dotColor)} />
      {label}
    </div>
  );
}
