"use client";

import { useState } from "react";
import { Check, Clock, Copy, Mail, MapPin, Navigation, Send } from "lucide-react";
import type { ContactSettings } from "@repo/shared";

import { HqMap } from "@/components/contact/hq-map";

type IconType = typeof Mail;

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: IconType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-brand-green" strokeWidth={2.25} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-foreground/45 uppercase">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

const actionClass =
  "inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-brand-blue hover:text-brand-blue";

function ActionButton({
  icon: Icon,
  onClick,
  children,
}: {
  icon: IconType;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={actionClass}>
      <Icon className="size-4" strokeWidth={2.25} />
      {children}
    </button>
  );
}

function ActionLink({
  icon: Icon,
  href,
  children,
}: {
  icon: IconType;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={actionClass}>
      <Icon className="size-4" strokeWidth={2.25} />
      {children}
    </a>
  );
}

// Click-to-copy (rather than the nav menu's hover-reveal) works on touch
// devices too. Each row gets its own copied-state so copying the address
// doesn't flip the email button's label, and vice versa.
function useCopy() {
  const [copied, setCopied] = useState(false);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API blocked — the other action (mailto/maps link) still works.
    }
  }
  return { copied, copy };
}

export function ContactInfoCard({ settings }: { settings: ContactSettings }) {
  const emailCopy = useCopy();
  const addressCopy = useCopy();
  const addressLines = settings.address.split("\n");
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${settings.lat}%2C${settings.lng}`;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-6 sm:p-8">
      <p className="text-xs font-semibold tracking-wide text-foreground/45 uppercase">
        Reach us directly
      </p>

      <div className="mt-4 flex flex-col divide-y divide-[var(--line)]">
        <div className="pb-5">
          <InfoRow icon={Mail} label="Email">
            <p className="font-display text-base font-semibold text-foreground">{settings.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <ActionButton
                icon={emailCopy.copied ? Check : Copy}
                onClick={() => emailCopy.copy(settings.email)}
              >
                {emailCopy.copied ? "Copied!" : "Copy"}
              </ActionButton>
              <ActionLink icon={Send} href={`mailto:${settings.email}`}>
                Send email
              </ActionLink>
            </div>
          </InfoRow>
        </div>

        <div className="py-5">
          <InfoRow icon={MapPin} label="Based in">
            <p className="text-sm text-foreground/70">
              {addressLines.map((line, i) => (
                <span key={line}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </p>
            <div className="mt-3">
              <HqMap lat={settings.lat} lng={settings.lng} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <ActionButton
                icon={addressCopy.copied ? Check : Copy}
                onClick={() => addressCopy.copy(settings.address)}
              >
                {addressCopy.copied ? "Copied!" : "Copy address"}
              </ActionButton>
              <ActionLink icon={Navigation} href={directionsUrl}>
                Open in Maps
              </ActionLink>
            </div>
          </InfoRow>
        </div>

        <div className="pt-5">
          <InfoRow icon={Clock} label="Response time">
            <p className="text-sm text-foreground/70">
              We read every message and reply as soon as we can, usually within a few business days.
            </p>
          </InfoRow>
        </div>
      </div>
    </div>
  );
}
