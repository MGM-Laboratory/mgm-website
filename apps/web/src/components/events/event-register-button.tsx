"use client";

import { CheckCircle, Ticket, X } from "@phosphor-icons/react";
import gsap from "gsap";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { COUNTRY_CODES, countryFlag, DEFAULT_COUNTRY } from "@/lib/country-codes";

const inputClass =
  "h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-3)] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:bg-white/[0.06] dark:text-white";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

function RegisterModal({
  eventSlug,
  registrationCapacity,
  onClose,
}: {
  eventSlug: string;
  registrationCapacity?: number;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY.dial);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  // Fades/scales the panel in on mount — a fresh useLayoutEffect run every
  // time this component mounts, since the parent only renders it while open.
  useLayoutEffect(() => {
    if (!backdropRef.current || !panelRef.current) return;
    const d = reducedMotion() ? 0 : 1;
    gsap.set(backdropRef.current, { autoAlpha: 0 });
    gsap.set(panelRef.current, { autoAlpha: 0, scale: 0.96, y: 16 });
    gsap.to(backdropRef.current, { autoAlpha: 1, duration: 0.2 * d, ease: "power1.out" });
    gsap.to(panelRef.current, {
      autoAlpha: 1,
      delay: 0.03 * d,
      duration: 0.32 * d,
      ease: "back.out(1.4)",
      scale: 1,
      y: 0,
    });
  }, []);

  // Plays the exit tween before actually unmounting (the plain onClose prop
  // would unmount immediately and skip the animation entirely).
  const requestClose = () => {
    if (closingRef.current || !backdropRef.current || !panelRef.current) return;
    closingRef.current = true;
    const d = reducedMotion() ? 0 : 1;
    gsap.to(panelRef.current, {
      autoAlpha: 0,
      duration: 0.2 * d,
      ease: "power2.in",
      scale: 0.97,
      y: 10,
    });
    gsap.to(backdropRef.current, {
      autoAlpha: 0,
      duration: 0.2 * d,
      ease: "power2.in",
      onComplete: onClose,
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim() || !email.trim() || !phoneNumber.trim()) {
      toast.error("Please fill in your name, email, and phone number.");
      return;
    }
    if (!agreed) {
      toast.error("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }
    setStatus("submitting");
    try {
      const response = await fetch(`/api/events-cms/${encodeURIComponent(eventSlug)}/register`, {
        body: JSON.stringify({
          agreedToTerms: true,
          email: email.trim(),
          fullName: fullName.trim(),
          phone: `${phoneCountry}${phoneNumber.trim()}`,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Could not submit your registration.");
      setStatus("done");
    } catch (error) {
      setStatus("idle");
      toast.error("Registration failed.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div
      aria-labelledby="event-register-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
      onMouseDown={requestClose}
      ref={backdropRef}
      role="dialog"
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#12151c]"
        onMouseDown={(event) => event.stopPropagation()}
        ref={panelRef}
      >
        {status === "done" ? (
          <div className="py-4 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-green-50 text-brand-green dark:bg-brand-green/15">
              <CheckCircle size={26} weight="fill" />
            </span>
            <p className="mt-4 font-display text-lg font-semibold text-[var(--ink)] dark:text-white">
              You&apos;re registered!
            </p>
            <p className="mt-1.5 text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
              See you at the event.
            </p>
            <button
              className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-[#171b25] px-5 text-sm font-semibold text-white transition hover:bg-brand-blue dark:bg-white dark:text-[#0e1116]"
              onClick={requestClose}
              type="button"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  className="flex items-center gap-2 font-display text-lg font-semibold text-[var(--ink)] dark:text-white"
                  id="event-register-title"
                >
                  <Ticket size={19} weight="bold" /> Register for this event
                </h3>
                {registrationCapacity ? (
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    Limited to {registrationCapacity} attendees.
                  </p>
                ) : null}
              </div>
              <button
                aria-label="Close"
                className="rounded-lg p-1.5 text-[var(--ink-3)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] dark:hover:bg-white/10 dark:hover:text-white"
                onClick={requestClose}
                type="button"
              >
                <X size={17} weight="bold" />
              </button>
            </div>

            <form className="mt-5 space-y-3" onSubmit={(event) => void submit(event)}>
              <input
                autoComplete="name"
                className={inputClass}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Full name"
                required
                type="text"
                value={fullName}
              />
              <input
                autoComplete="email"
                className={inputClass}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                required
                type="email"
                value={email}
              />
              <div className="flex gap-2">
                <select
                  aria-label="Country code"
                  className="h-11 w-[6.5rem] shrink-0 rounded-xl border border-[var(--line)] bg-white px-2 text-sm text-[var(--ink)] outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:bg-white/[0.06] dark:text-white"
                  onChange={(event) => setPhoneCountry(event.target.value)}
                  value={phoneCountry}
                >
                  {COUNTRY_CODES.map((country) => (
                    <option key={country.code} title={country.name} value={country.dial}>
                      {countryFlag(country.code)} {country.dial}
                    </option>
                  ))}
                </select>
                <input
                  autoComplete="tel"
                  className={inputClass}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="81234567890"
                  required
                  type="tel"
                  value={phoneNumber}
                />
              </div>
              <label className="flex items-start gap-2.5 text-xs leading-5 text-[var(--ink-3)]">
                <input
                  checked={agreed}
                  className="mt-0.5 size-3.5 shrink-0 accent-brand-blue"
                  onChange={(event) => setAgreed(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  I agree to the{" "}
                  <Link
                    className="font-medium text-brand-blue hover:underline"
                    href="/terms-of-services"
                    target="_blank"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    className="font-medium text-brand-blue hover:underline"
                    href="/privacy-policy"
                    target="_blank"
                  >
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-blue text-sm font-semibold text-white transition hover:bg-brand-blue/90 disabled:opacity-60"
                disabled={status === "submitting"}
                type="submit"
              >
                {status === "submitting" ? "Submitting…" : "Register"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export function EventRegisterButton({
  eventSlug,
  registrationCapacity,
}: {
  eventSlug: string;
  registrationCapacity?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-blue px-4 text-sm font-semibold text-white transition hover:bg-brand-blue/90"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Ticket size={16} weight="bold" />
        Register
      </button>
      {open ? (
        <RegisterModal
          eventSlug={eventSlug}
          onClose={() => setOpen(false)}
          registrationCapacity={registrationCapacity}
        />
      ) : null}
    </>
  );
}
