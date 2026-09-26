"use client";

import { toast } from "sonner";
import { Copy } from "@phosphor-icons/react";

export const labelClass =
  "text-[11px] font-bold uppercase tracking-[0.14em] text-[#7e899d] dark:text-white/35";
export const inputClass =
  "h-10 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";
export const selectClass = inputClass;
export const cardClass =
  "rounded-2xl border border-[#e4e8f0] bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]";
export const chipClass =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]";

export async function copyText(text: string, what = "Link") {
  // Inside the chain, so a missing clipboard API lands in the catch as well.
  return Promise.resolve()
    .then(() => navigator.clipboard.writeText(text))
    .then(() => {
      toast.success(`${what} copied`, {
        description: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      });
    })
    .catch(() => {
      toast.error(`Could not copy the ${what.toLowerCase()}`);
    });
}

export function CopyButton({
  text,
  what = "Link",
  label,
}: {
  text: string;
  what?: string;
  label?: string;
}) {
  return (
    <button
      aria-label={label ?? `Copy ${what.toLowerCase()}`}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm font-semibold text-[#3b4150] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:bg-white/[0.03] dark:text-white/75"
      onClick={() => void copyText(text, what)}
      type="button"
    >
      <Copy size={15} /> <span className="hidden sm:inline">Copy</span>
    </button>
  );
}

export function Section({
  title,
  description,
  children,
  testId,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  testId?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={cardClass} data-testid={testId}>
      <header className="mb-4 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-[#778299] dark:text-white/45">{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function SnippetBox({ code, what }: { code: string; what: string }) {
  return (
    <div className="relative">
      <pre className="max-h-48 overflow-auto rounded-xl bg-[#0e1116] p-3 pr-20 font-mono text-[11px] leading-5 whitespace-pre-wrap break-all text-[#e6e9ef]">
        <code>{code}</code>
      </pre>
      <button
        className="absolute top-2 right-2 inline-flex h-8 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-semibold text-white hover:bg-white/20"
        onClick={() => void copyText(code, what)}
        type="button"
      >
        <Copy size={13} /> Copy
      </button>
    </div>
  );
}
