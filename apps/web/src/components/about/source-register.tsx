import { ExternalLink, Lock } from "lucide-react";

import { SOURCES } from "@/data/about-sources";
import { RESEARCH_CUTOFF } from "@/data/about-content";

// The literal citation index every [Sxx] mark on the page links to. Jumping
// here is plain browser anchor navigation (`#src-S07`) — no JS involved —
// and the target flashes via the `.source-entry:target` rule in
// globals.css, so it works identically with JavaScript disabled.
export function SourceRegister() {
  return (
    <section className="border-t border-[var(--line)] bg-[var(--surface-muted)] px-6 py-20 sm:px-10 sm:py-24 lg:px-16">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold tracking-wide text-brand-red uppercase">
          Source register
        </p>
        <h2 className="mt-3 font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-[var(--ink)] dark:text-white">
          Every citation on this page, in one place
        </h2>
        <p className="mt-4 max-w-xl text-[var(--ink-2)] dark:text-white/65">
          Reviewed {RESEARCH_CUTOFF}. Each source is a literal, live link — click any [Sxx] mark on
          the page to jump straight to its entry here.
        </p>

        <ol className="mt-10 flex flex-col gap-1">
          {SOURCES.map((source) => (
            <li
              key={source.id}
              id={`src-${source.id}`}
              className="source-entry flex scroll-mt-24 items-start gap-4 rounded-lg px-3 py-3"
            >
              <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold text-[var(--ink-3)]">
                {source.id}
              </span>
              {source.locked ? (
                <div className="flex min-w-0 items-start gap-2">
                  <Lock
                    className="mt-0.5 size-3.5 shrink-0 text-[var(--ink-4)]"
                    strokeWidth={2.25}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--ink-2)] dark:text-white/70">{source.title}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-[var(--ink-4)]">
                      {source.url} — password-protected at review
                    </p>
                  </div>
                </div>
              ) : (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-w-0 flex-1 items-start gap-2 text-sm text-[var(--ink-2)] hover:text-brand-blue dark:text-white/70 dark:hover:text-white"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block">{source.title}</span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-[var(--ink-4)] group-hover:text-brand-blue">
                      {source.url}
                    </span>
                  </span>
                  <ExternalLink
                    className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    strokeWidth={2.25}
                  />
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
