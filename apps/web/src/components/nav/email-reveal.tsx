"use client";

import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Check, Copy, Mail, Plus } from "lucide-react";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// Hover/focus opens a small dropdown offering "copy" or "open in mail
// client" instead of the email itself being a plain mailto link — the "+"
// rotates into a "×" to read as an expand affordance, matching the trigger
// used elsewhere in the panel (kaizin's own "Let's Talk" email row).
export function EmailReveal({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const openRef = useRef(false);
  const plusRef = useRef<SVGSVGElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (dropdownRef.current) gsap.set(dropdownRef.current, { autoAlpha: 0, y: 6 });
  }, []);

  function openDropdown() {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
    if (openRef.current) return;
    openRef.current = true;
    setOpen(true);
    const d = reducedMotion() ? 0 : 1;
    gsap.to(dropdownRef.current, { autoAlpha: 1, y: 0, duration: 0.3 * d, ease: "power3.out" });
    gsap.to(plusRef.current, { rotate: 45, duration: 0.3 * d, ease: "back.out(2)" });
  }

  function closeDropdown() {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    const d = reducedMotion() ? 0 : 1;
    gsap.to(dropdownRef.current, { autoAlpha: 0, y: 6, duration: 0.2 * d, ease: "power2.in" });
    gsap.to(plusRef.current, { rotate: 0, duration: 0.25 * d, ease: "power2.out" });
  }

  function scheduleClose() {
    closeTimeout.current = setTimeout(closeDropdown, 150);
  }

  function cancelScheduledClose() {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      if (copyResetTimeout.current) clearTimeout(copyResetTimeout.current);
      copyResetTimeout.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API blocked (permissions/non-secure context) — the
      // "Open in Mail app" option below still works either way.
    }
  }

  return (
    <div className="relative" onMouseLeave={scheduleClose}>
      <button
        type="button"
        onClick={() => (openRef.current ? closeDropdown() : openDropdown())}
        onMouseEnter={openDropdown}
        onFocus={openDropdown}
        aria-expanded={open}
        aria-haspopup="true"
        className="group flex items-center gap-[0.35em] font-display text-[1.6em] font-bold tracking-tight text-foreground"
      >
        {email}
        <Plus ref={plusRef} className="size-[0.6em] text-foreground/50" />
      </button>

      <div
        ref={dropdownRef}
        onMouseEnter={cancelScheduledClose}
        onMouseLeave={scheduleClose}
        className="absolute bottom-full left-0 z-10 mb-2 flex w-max min-w-[10rem] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] py-1 text-sm shadow-lg"
      >
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-2 text-left text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          {copied ? (
            <Check className="size-4 text-brand-green" />
          ) : (
            <Copy className="size-4 text-foreground/50" />
          )}
          {copied ? "Copied!" : "Copy email"}
        </button>
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-2 px-3 py-2 text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <Mail className="size-4 text-foreground/50" />
          Open in Mail app
        </a>
      </div>
    </div>
  );
}
