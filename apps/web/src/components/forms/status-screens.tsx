"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import type { FormLanguage, FormUnavailableReason, PublicFormPayload } from "@repo/shared";

import { unlockForm } from "@/lib/forms/public-client";
import { formCopy } from "@/lib/forms/public-copy";

import { ShapeSvg } from "./scene/scene-dom";
import type { ShapeKind } from "./scene/vocabulary";

/**
 * The screens around the form itself: the passphrase gate, not open yet
 * (with a live countdown), closed, full, already responded, a failed
 * load, and not found. Each wears a small Bauhaus composition that says
 * the same thing as its title.
 */

export type StatusGlyph = "lock" | "soon" | "closed" | "full" | "done" | "broken" | "missing";

const GLYPHS: Record<StatusGlyph, { kind: ShapeKind; color: number; turn?: number }[]> = {
  // A keyhole: a circle over a triangle, with a ring beside.
  lock: [
    { kind: "ring", color: 0 },
    { kind: "circle", color: 1 },
    { kind: "triangle", color: 3, turn: 1 },
    { kind: "square", color: 2 },
  ],
  // A sun that hasn't risen: half discs stacked.
  soon: [
    { kind: "quarter", color: 3, turn: 1 },
    { kind: "half", color: 0 },
    { kind: "square", color: 2 },
    { kind: "quarter", color: 1, turn: 0 },
  ],
  closed: [
    { kind: "square", color: 2 },
    { kind: "x", color: 0 },
    { kind: "half", color: 3, turn: 2 },
    { kind: "square", color: 1 },
  ],
  full: [
    { kind: "circle", color: 0 },
    { kind: "leaf", color: 1 },
    { kind: "fan", color: 3 },
    { kind: "domes", color: 4 },
  ],
  done: [
    { kind: "leaf", color: 3 },
    { kind: "circle", color: 0 },
    { kind: "plus", color: 1 },
    { kind: "half", color: 4, turn: 2 },
  ],
  broken: [
    { kind: "triangle", color: 0, turn: 2 },
    { kind: "quarter", color: 3, turn: 3 },
    { kind: "x", color: 1 },
    { kind: "half", color: 2, turn: 1 },
  ],
  missing: [
    { kind: "circle", color: 0 },
    { kind: "square", color: 2 },
    { kind: "ring", color: 3 },
    { kind: "plus", color: 1 },
  ],
};

export function StatusComposition({ glyph }: { glyph: StatusGlyph }) {
  return (
    <div className="fx-status-glyph" data-glyph={glyph} aria-hidden>
      {GLYPHS[glyph].map((piece, index) => (
        <span
          key={index}
          style={{
            color: `var(--fx-piece-${piece.color})`,
            rotate: `${(piece.turn ?? 0) * 90}deg`,
          }}
        >
          <ShapeSvg kind={piece.kind} />
        </span>
      ))}
    </div>
  );
}

export function StatusCard({
  glyph,
  eyebrow,
  title,
  children,
  titleId,
}: {
  glyph: StatusGlyph;
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  titleId?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className="fx-status" aria-labelledby={titleId ?? "fx-status-title"}>
      <StatusComposition glyph={glyph} />
      {eyebrow ? <p className="fx-eyebrow">{eyebrow}</p> : null}
      <h1 id={titleId ?? "fx-status-title"} ref={headingRef} tabIndex={-1} className="fx-title">
        {title}
      </h1>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- locked

export function LockedGate({
  slug,
  title,
  language,
  onUnlocked,
}: {
  slug: string;
  title: string;
  language: FormLanguage;
  onUnlocked: (payload: PublicFormPayload) => void;
}) {
  const copy = formCopy(language);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !value.trim()) {
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await unlockForm(slug, value.trim());
    setBusy(false);
    if (outcome.kind === "ok" && outcome.payload.state !== "locked") {
      onUnlocked(outcome.payload);
      return;
    }
    setError(outcome.kind === "failed" ? copy.unlockFailed : copy.wrongPassphrase);
    setShake((count) => count + 1);
    inputRef.current?.select();
  }

  return (
    <StatusCard glyph="lock" eyebrow={copy.lockedEyebrow} title={title}>
      <p className="fx-status-body">{copy.lockedBody}</p>
      <form className="fx-gate" onSubmit={submit} noValidate>
        <label htmlFor="fx-passphrase" className="fx-gate-label">
          <LockKeyhole aria-hidden strokeWidth={2.25} size={16} />
          {copy.passphrase}
        </label>
        <div className="fx-gate-row" data-shake={shake || undefined} key={shake}>
          <input
            ref={inputRef}
            id="fx-passphrase"
            className="fx-input"
            type="password"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "fx-passphrase-error" : undefined}
          />
          <button type="submit" className="fx-button" data-variant="primary" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle aria-hidden className="fx-spin" strokeWidth={2.25} size={18} />
                {copy.unlocking}
              </>
            ) : (
              <>
                {copy.unlock}
                <ArrowRight aria-hidden strokeWidth={2.25} size={18} />
              </>
            )}
          </button>
        </div>
        <p id="fx-passphrase-error" className="fx-error" role="alert" aria-live="assertive">
          {error ?? ""}
        </p>
      </form>
    </StatusCard>
  );
}

// ------------------------------------------------------------ unavailable

function useCountdown(target: string | undefined) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!target) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [target]);
  if (!target || now === null) return null;
  return Math.max(0, Date.parse(target) - now);
}

function Countdown({ opensAt, language }: { opensAt: string; language: FormLanguage }) {
  const copy = formCopy(language);
  const remaining = useCountdown(opensAt);
  const router = useRouter();
  const opened = remaining === 0;
  useEffect(() => {
    if (opened) router.refresh();
  }, [opened, router]);
  const parts =
    remaining === null
      ? null
      : {
          d: Math.floor(remaining / 86_400_000),
          h: Math.floor(remaining / 3_600_000) % 24,
          m: Math.floor(remaining / 60_000) % 60,
          s: Math.floor(remaining / 1000) % 60,
        };
  const units = language === "id" ? ["hari", "jam", "mnt", "dtk"] : ["days", "hrs", "min", "sec"];
  const when = new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(opensAt));
  return (
    <div className="fx-countdown">
      <p className="fx-eyebrow">{copy.opensIn}</p>
      <div className="fx-countdown-row" role="timer" aria-live="off">
        {(["d", "h", "m", "s"] as const).map((unit, index) => (
          <div key={unit} className="fx-countdown-cell">
            <span className="fx-countdown-value">
              {parts ? String(parts[unit]).padStart(2, "0") : "--"}
            </span>
            <span className="fx-countdown-unit">{units[index]}</span>
          </div>
        ))}
      </div>
      <p className="fx-status-body">
        <time dateTime={opensAt} suppressHydrationWarning>
          {copy.opensAt(when)}
        </time>
      </p>
    </div>
  );
}

export function UnavailableScreen({
  reason,
  title,
  closedTitle,
  closedMessage,
  opensAt,
  language,
  closedLabel,
}: {
  reason: FormUnavailableReason;
  title: string;
  closedTitle?: string;
  closedMessage?: string;
  opensAt?: string;
  language: FormLanguage;
  closedLabel: string;
}) {
  const copy = formCopy(language);
  if (reason === "not_open_yet") {
    return (
      <StatusCard glyph="soon" eyebrow={title} title={copy.notOpenTitle}>
        <p className="fx-status-body">{copy.notOpenBody}</p>
        {opensAt ? <Countdown opensAt={opensAt} language={language} /> : null}
      </StatusCard>
    );
  }
  if (reason === "limit_reached") {
    return (
      <StatusCard glyph="full" eyebrow={title} title={closedTitle || copy.fullTitle}>
        <p className="fx-status-body">{closedMessage || copy.fullBody}</p>
      </StatusCard>
    );
  }
  return (
    <StatusCard glyph="closed" eyebrow={title} title={closedTitle || closedLabel}>
      <p className="fx-status-body">{closedMessage || copy.closedBody}</p>
    </StatusCard>
  );
}
