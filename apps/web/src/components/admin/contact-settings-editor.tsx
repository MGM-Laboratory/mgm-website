"use client";

import { Check, FloppyDisk } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ContactSettings } from "@repo/shared";

const inputClass =
  "h-10 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";
const textareaClass =
  "w-full rounded-xl border border-[#d9dfeb] bg-white px-3 py-2.5 text-sm leading-6 text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";

function Field({ children, label }: Readonly<{ children: React.ReactNode; label: string }>) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
        {label}
      </span>
      {children}
    </label>
  );
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string; message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    return message || body.error || fallback;
  } catch {
    return fallback;
  }
}

type FormState = { email: string; address: string; lat: string; lng: string };

const toForm = (settings: ContactSettings): FormState => ({
  email: settings.email,
  address: settings.address,
  lat: String(settings.lat),
  lng: String(settings.lng),
});

export function ContactSettingsEditor({
  onDirtyChange,
}: Readonly<{
  onDirtyChange: (dirty: boolean) => void;
}>) {
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<FormState>({ email: "", address: "", lat: "", lng: "" });
  const [baseline, setBaseline] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/admin/contact-settings");
      if (!response.ok || cancelled) return;
      const data = (await response.json()) as { record?: ContactSettings };
      if (!data.record || cancelled) return;
      const next = toForm(data.record);
      setForm(next);
      setBaseline(JSON.stringify(next));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = ready && JSON.stringify(form) !== baseline;

  const update = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    onDirtyChange(JSON.stringify(next) !== baseline);
  };

  let saveLabel = "Save settings";
  if (status === "saving") saveLabel = "Saving…";
  else if (status === "saved" && !isDirty) saveLabel = "Saved";

  const save = async () => {
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (!form.email.trim()) {
      toast.error("Email is required.");
      return;
    }
    if (!form.address.trim()) {
      toast.error("Address is required.");
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      toast.error("Latitude must be a number between -90 and 90.");
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      toast.error("Longitude must be a number between -180 and 180.");
      return;
    }
    setStatus("saving");
    setError(undefined);
    try {
      const response = await fetch("/api/admin/contact-settings", {
        body: JSON.stringify({
          address: form.address.trim(),
          email: form.email.trim(),
          lat,
          lng,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) throw new Error(await responseError(response, "Settings save failed."));
      const data = (await response.json()) as { record: ContactSettings };
      const next = toForm(data.record);
      setForm(next);
      setBaseline(JSON.stringify(next));
      onDirtyChange(false);
      setStatus("saved");
      toast.success("Contact settings saved");
    } catch (saveError) {
      setStatus("error");
      const message =
        saveError instanceof Error ? saveError.message : "The changes could not be saved.";
      setError(message);
      toast.error("Settings were not saved", { description: message });
    }
  };

  return (
    <div>
      <div className="mt-10 flex flex-wrap items-start justify-between gap-5 border-b border-[#dee4ef] pb-7 dark:border-white/10">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-green uppercase">
            Contact Settings
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            Contact Settings
          </h1>
          <p className="mt-2 text-sm text-[#69748a] dark:text-white/50">
            The recipient inbox, HQ address, and map coordinates shown on the public /contact page.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Recipient email">
            <input
              className={inputClass}
              disabled={!ready}
              onChange={(event) => update({ email: event.target.value })}
              placeholder="hi@labmgm.org"
              type="email"
              value={form.email}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="HQ address">
            <textarea
              className={`${textareaClass} min-h-28`}
              disabled={!ready}
              onChange={(event) => update({ address: event.target.value })}
              value={form.address}
            />
          </Field>
        </div>
        <Field label="Latitude">
          <input
            className={inputClass}
            disabled={!ready}
            inputMode="decimal"
            onChange={(event) => update({ lat: event.target.value })}
            value={form.lat}
          />
        </Field>
        <Field label="Longitude">
          <input
            className={inputClass}
            disabled={!ready}
            inputMode="decimal"
            onChange={(event) => update({ lng: event.target.value })}
            value={form.lng}
          />
        </Field>
      </div>

      <div className="pointer-events-none sticky top-[7.5rem] z-30 mt-5 flex justify-end">
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {isDirty ? (
            <span className="rounded-full bg-[#171b25]/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              Unsaved changes
            </span>
          ) : null}
          <button
            aria-label="Save contact settings"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-blue active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            disabled={status === "saving" || !ready}
            onClick={save}
            type="button"
          >
            {status === "saved" && !isDirty ? (
              <Check size={18} weight="bold" />
            ) : (
              <FloppyDisk size={18} weight="bold" />
            )}
            {saveLabel}
          </button>
        </div>
      </div>

      {status === "error" ? (
        <p className="mt-4 rounded-xl bg-brand-red-50 px-4 py-3 text-sm text-brand-red dark:bg-brand-red/15 dark:text-brand-red-100">
          {error ?? "The changes could not be saved."}
        </p>
      ) : null}
    </div>
  );
}
