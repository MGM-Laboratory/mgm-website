import type { ReactNode } from "react";

// The plain full-height message used by the error and not-found pages. It
// reads no data and has no client-only dependency, so it still renders when
// the page it replaces failed because the API is down.
export function StatusPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-[calc(100dvh-4rem)] flex-1 flex-col justify-center bg-[var(--surface-muted)]">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-24 sm:px-10 lg:px-14">
        <p className="text-sm font-semibold tracking-wide text-brand-blue uppercase">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-display text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-[var(--ink)] dark:text-white">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-[var(--ink-2)] dark:text-white/65">{description}</p>
        {children ? <div className="mt-8 flex flex-wrap gap-3">{children}</div> : null}
      </div>
    </main>
  );
}
