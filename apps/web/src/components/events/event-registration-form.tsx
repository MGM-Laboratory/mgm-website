"use client";

import { CheckCircle, Ticket } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

const inputClass =
  "h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-3)] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:bg-white/[0.04] dark:text-white";

export function EventRegistrationForm({
  eventSlug,
  registrationCapacity,
}: {
  eventSlug: string;
  registrationCapacity?: number;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      toast.error("Please fill in your name, email, and phone number.");
      return;
    }
    setStatus("submitting");
    try {
      const response = await fetch(`/api/events-cms/${encodeURIComponent(eventSlug)}/register`, {
        body: JSON.stringify({ fullName, email, phone }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Could not submit your registration.");
      setStatus("done");
      toast.success("You're registered!");
    } catch (error) {
      setStatus("idle");
      toast.error("Registration failed.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  if (status === "done") {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border border-brand-green/30 bg-brand-green-50 px-5 py-4 text-sm font-medium text-brand-green dark:bg-brand-green/10"
        id="register"
      >
        <CheckCircle size={20} weight="fill" />
        You&apos;re registered for this event. See you there!
      </div>
    );
  }

  return (
    <form
      className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/60 p-6"
      id="register"
      onSubmit={(event) => void submit(event)}
    >
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-[var(--ink)] dark:text-white">
        <Ticket size={19} weight="bold" /> Register for this event
      </h3>
      {registrationCapacity ? (
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          Limited to {registrationCapacity} attendees.
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          className={inputClass}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Full name"
          required
          type="text"
          value={fullName}
        />
        <input
          className={inputClass}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
          type="email"
          value={email}
        />
        <input
          className={`${inputClass} sm:col-span-2`}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Phone number"
          required
          type="tel"
          value={phone}
        />
      </div>
      <button
        className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-blue px-6 text-sm font-semibold text-white transition hover:bg-brand-blue/90 disabled:opacity-60"
        disabled={status === "submitting"}
        type="submit"
      >
        {status === "submitting" ? "Submitting…" : "Register"}
      </button>
    </form>
  );
}
