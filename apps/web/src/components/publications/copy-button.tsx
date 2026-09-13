"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

/** Copies a value to the clipboard and confirms with a toast. */
export function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success(`${label} copied`, {
        description: "Paste it straight into your reference manager.",
      });
    } catch {
      toast.error(`${label} could not be copied`, {
        description: "Your browser blocked clipboard access — copy it by hand.",
      });
    }
  };

  return (
    <button
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition ${
        copied
          ? "border-brand-green/40 bg-brand-green-50 text-brand-green"
          : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-2)] hover:border-brand-blue/50 hover:text-brand-blue dark:bg-white/[0.03] dark:text-white/70 dark:hover:text-white"
      }`}
      onClick={copy}
      type="button"
    >
      {copied ? <Check size={15} weight="bold" /> : <Copy size={15} />}
      {copied ? "Copied" : label}
    </button>
  );
}
