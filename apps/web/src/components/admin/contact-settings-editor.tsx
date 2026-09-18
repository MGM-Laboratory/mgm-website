"use client";

import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  Check,
  DotsSixVertical,
  FloppyDisk,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDismissableOpen } from "@/hooks/use-dismissable-open";
import { cn } from "@/lib/utils";
import {
  MAIL_PROVIDER_IDS,
  MAIL_STRATEGIES,
  type ContactSettings,
  type MailLongPeriod,
  type MailProviderId,
  type MailProviderLimitConfig,
  type MailProviderLimits,
  type MailProviderWeights,
  type MailStrategy,
} from "@repo/shared";

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

type ListboxGroup<T extends string> = {
  label?: string;
  options: { value: T; label: string }[];
};

// A fully custom dropdown (not a native <select>) so the closed trigger and
// the open menu both match the CMS's own design language instead of the
// browser's own, unstyleable select chrome and OS-rendered option list.
function Listbox<T extends string>({
  value,
  disabled,
  groups,
  onChange,
}: Readonly<{
  value: T;
  disabled?: boolean;
  groups: ListboxGroup<T>[];
  onChange: (value: T) => void;
}>) {
  const [open, setOpen] = useState(false);
  // Flips the panel above the trigger (and caps its height to whichever side
  // actually has room) when there isn't enough space below, so a dropdown
  // opened near the bottom of the viewport never requires scrolling the page
  // to reach its own options.
  const [placement, setPlacement] = useState({ maxHeight: 448, openUpward: false });
  const ref = useRef<HTMLDivElement>(null);
  const selected = groups
    .flatMap((group) => group.options)
    .find((option) => option.value === value);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 16;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
    const available = openUpward ? spaceAbove : spaceBelow;
    setPlacement({ maxHeight: Math.max(160, Math.min(448, available)), openUpward });
  }, [open]);

  useDismissableOpen(ref, open, setOpen);

  return (
    <div className="relative" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          inputClass,
          "flex cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60",
        )}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="truncate">{selected?.label ?? "Select…"}</span>
        <CaretDown
          className={cn(
            "size-3.5 shrink-0 text-[#69748a] transition-transform duration-200 dark:text-white/40",
            open && "rotate-180",
          )}
          weight="bold"
        />
      </button>
      {open ? (
        <div
          className={cn(
            "absolute left-0 z-40 w-full min-w-max overflow-auto rounded-xl border border-[#d9dfeb] bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-[#12151c]",
            placement.openUpward ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]",
          )}
          role="listbox"
          style={{ maxHeight: placement.maxHeight }}
        >
          {groups.map((group, groupIndex) => (
            <div key={group.label ?? groupIndex}>
              {group.label ? (
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-[0.08em] text-[#9aa3b5] uppercase dark:text-white/35">
                  {group.label}
                </p>
              ) : null}
              {group.options.map((option) => (
                <button
                  aria-selected={option.value === value}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors hover:bg-[#eef1f6] dark:hover:bg-white/[0.06]",
                    option.value === value ? "text-brand-blue" : "text-[#171b25] dark:text-white",
                  )}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  {option.label}
                  {option.value === value ? <Check size={14} weight="bold" /> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ProviderStatusEntry = {
  configured: boolean;
  windowMode?: "calendar" | "rolling";
  dailyLimit?: number;
  dailyRemaining?: number;
  longLimit?: number;
  longPeriod?: MailLongPeriod;
  longRemaining?: number;
};

type MailProviderStatus = {
  fromEmailConfigured: boolean;
  providers: Record<MailProviderId, ProviderStatusEntry>;
};

const MAIL_PROVIDER_LABELS: Record<MailProviderId, string> = {
  resend: "Resend",
  smtp: "SMTP",
  ses: "Amazon SES",
};

const SINGLE_STRATEGIES: MailStrategy[] = ["resend", "smtp", "ses"];

const MAIL_STRATEGY_LABELS: Record<MailStrategy, string> = {
  resend: "Resend only",
  smtp: "SMTP only",
  ses: "Amazon SES only",
  failover: "Failover (try in order)",
  loadBalanceEqual: "Load balance — equal rotation",
  loadBalanceWeighted: "Load balance — weighted",
  loadBalanceLimit: "Load balance — per-provider limits",
};

function isMultiProviderStrategy(strategy: MailStrategy) {
  return !SINGLE_STRATEGIES.includes(strategy);
}

function normalizeOrder(order: MailProviderId[]): MailProviderId[] {
  const seen = order.filter((id) => MAIL_PROVIDER_IDS.includes(id));
  const missing = MAIL_PROVIDER_IDS.filter((id) => !seen.includes(id));
  return [...new Set([...seen, ...missing])];
}

function formatRemaining(entry: ProviderStatusEntry | undefined) {
  if (!entry?.windowMode) return null;
  const parts: string[] = [];
  if (entry.dailyLimit) parts.push(`${entry.dailyRemaining ?? 0}/${entry.dailyLimit} today`);
  if (entry.longLimit) {
    const period = entry.longPeriod === "30day" ? "30 days" : "month";
    parts.push(`${entry.longRemaining ?? 0}/${entry.longLimit} this ${period}`);
  }
  if (!parts.length) return null;
  return `${parts.join(" · ")} (${entry.windowMode})`;
}

// Just a dot + the label at a glance — the full sentence (configured?
// remaining quota?) lives in the title tooltip instead of always on-screen,
// since three or four spelled-out sentences side by side read as noise.
function StatusBadge({
  label,
  entry,
}: Readonly<{ label: string; entry: ProviderStatusEntry | undefined }>) {
  const configured = entry?.configured ?? false;
  const remaining = formatRemaining(entry);
  const remainingSuffix = remaining ? ` — ${remaining}` : "";
  const detail = `${label}: ${configured ? "configured" : "not configured"}${remainingSuffix}`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        configured
          ? "bg-brand-green-50 text-brand-green dark:bg-brand-green/15"
          : "bg-[#eef1f6] text-[#69748a] dark:bg-white/[0.06] dark:text-white/45"
      }`}
      title={detail}
    >
      <span className={`size-1.5 rounded-full ${configured ? "bg-brand-green" : "bg-current"}`} />
      {label}
    </span>
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

type FormState = {
  emails: string[];
  address: string;
  lat: string;
  lng: string;
  mailStrategy: MailStrategy;
  mailProviderOrder: MailProviderId[];
  mailProviderWeights: MailProviderWeights;
  mailProviderLimits: MailProviderLimits;
};

const toForm = (settings: ContactSettings): FormState => ({
  emails: settings.emails.length ? [...settings.emails] : [""],
  address: settings.address,
  lat: String(settings.lat),
  lng: String(settings.lng),
  mailStrategy: settings.mailStrategy,
  mailProviderOrder: normalizeOrder(settings.mailProviderOrder),
  mailProviderWeights: settings.mailProviderWeights,
  mailProviderLimits: settings.mailProviderLimits,
});

function numOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateContactSettingsForm(form: FormState): string | null {
  const emails = form.emails.map((email) => email.trim()).filter(Boolean);
  if (!emails.length) return "Add at least one recipient email.";
  const invalid = emails.find((email) => !EMAIL_PATTERN.test(email));
  if (invalid) return `"${invalid}" is not a valid email address.`;
  if (!form.address.trim()) return "Address is required.";
  const lat = Number(form.lat);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return "Latitude must be a number between -90 and 90.";
  }
  const lng = Number(form.lng);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return "Longitude must be a number between -180 and 180.";
  }
  return null;
}

// Recipient emails — every configured address receives a copy of each new
// inquiry notification (see MailService.sendEmail, which already accepts
// `to: string[]`). At least one row always stays on screen so the list can
// never be emptied down to nothing from the UI itself.
function EmailListEditor({
  emails,
  disabled,
  onChange,
}: Readonly<{
  emails: string[];
  disabled: boolean;
  onChange: (emails: string[]) => void;
}>) {
  return (
    <div className="space-y-2">
      {emails.map((email, index) => (
        // skipcq: JS-0437 -- rows are edited by index, not reordered/keyed by identity
        <div className="flex items-center gap-2" key={index}>
          <input
            className={inputClass}
            disabled={disabled}
            onChange={(event) => {
              const next = [...emails];
              next[index] = event.target.value;
              onChange(next);
            }}
            placeholder="hi@labmgm.org"
            type="email"
            value={email}
          />
          <button
            aria-label={`Remove recipient ${index + 1}`}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[#69748a] transition hover:bg-[#eef1f6] disabled:cursor-not-allowed disabled:opacity-30 dark:text-white/50 dark:hover:bg-white/[0.06]"
            disabled={disabled || emails.length <= 1}
            onClick={() => onChange(emails.filter((_, i) => i !== index))}
            type="button"
          >
            <Trash size={16} weight="bold" />
          </button>
        </div>
      ))}
      <button
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#d9dfeb] px-3 py-2 text-sm font-semibold text-brand-blue transition hover:bg-brand-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/[0.06]"
        disabled={disabled}
        onClick={() => onChange([...emails, ""])}
        type="button"
      >
        <Plus size={14} weight="bold" /> Add recipient
      </button>
    </div>
  );
}

function ProviderOrderList({
  order,
  disabled,
  onReorder,
}: Readonly<{
  order: MailProviderId[];
  disabled: boolean;
  onReorder: (from: number, to: number) => void;
}>) {
  const [draggingId, setDraggingId] = useState<MailProviderId | null>(null);

  return (
    <div className="space-y-2">
      {order.map((id, index) => (
        <div
          className={cn(
            "flex items-center justify-between rounded-xl border bg-white px-3 py-2 text-sm transition dark:bg-white/[0.045]",
            draggingId === id
              ? "border-brand-blue bg-brand-blue/5 opacity-70"
              : "border-[#d9dfeb] dark:border-white/10",
          )}
          draggable={!disabled}
          key={id}
          onDragEnd={() => setDraggingId(null)}
          onDragOver={(event) => {
            if (disabled || draggingId === null || draggingId === id) return;
            event.preventDefault();
            // Reorders live as the pointer crosses another row, the way a
            // sortable list is expected to behave — not just on drop.
            const from = order.indexOf(draggingId);
            const to = order.indexOf(id);
            if (from !== -1 && to !== -1 && from !== to) onReorder(from, to);
          }}
          onDragStart={(event) => {
            if (disabled) return;
            setDraggingId(id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDraggingId(null);
          }}
        >
          <span className="flex items-center gap-2 font-medium text-[#171b25] dark:text-white">
            <DotsSixVertical
              className={cn(
                "size-4 text-[#9aa3b5] dark:text-white/30",
                disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
              )}
              weight="bold"
            />
            <span className="flex size-5 items-center justify-center rounded-full bg-[#eef1f6] text-[11px] font-bold text-[#69748a] dark:bg-white/[0.08] dark:text-white/60">
              {index + 1}
            </span>
            {MAIL_PROVIDER_LABELS[id]}
          </span>
          <span className="flex items-center gap-1">
            <button
              aria-label={`Move ${MAIL_PROVIDER_LABELS[id]} up`}
              className="flex size-7 items-center justify-center rounded-lg text-[#69748a] transition hover:bg-[#eef1f6] disabled:cursor-not-allowed disabled:opacity-30 dark:text-white/50 dark:hover:bg-white/[0.06]"
              disabled={disabled || index === 0}
              onClick={() => onReorder(index, index - 1)}
              type="button"
            >
              <ArrowUp size={14} weight="bold" />
            </button>
            <button
              aria-label={`Move ${MAIL_PROVIDER_LABELS[id]} down`}
              className="flex size-7 items-center justify-center rounded-lg text-[#69748a] transition hover:bg-[#eef1f6] disabled:cursor-not-allowed disabled:opacity-30 dark:text-white/50 dark:hover:bg-white/[0.06]"
              disabled={disabled || index === order.length - 1}
              onClick={() => onReorder(index, index + 1)}
              type="button"
            >
              <ArrowDown size={14} weight="bold" />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function ProviderLimitEditor({
  id,
  config,
  disabled,
  onChange,
}: Readonly<{
  id: MailProviderId;
  config: MailProviderLimitConfig;
  disabled: boolean;
  onChange: (patch: Partial<MailProviderLimitConfig>) => void;
}>) {
  const isRolling = config.windowMode === "rolling";
  return (
    <div className="rounded-xl border border-[#d9dfeb] p-4 dark:border-white/10">
      <p className="text-sm font-semibold text-[#171b25] dark:text-white">
        {MAIL_PROVIDER_LABELS[id]}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Window mode">
          <Listbox
            disabled={disabled}
            groups={[
              {
                options: [
                  { label: "Calendar (resets daily / monthly / 30-day)", value: "calendar" },
                  { label: "Rolling window (trailing)", value: "rolling" },
                ],
              },
            ]}
            onChange={(value) => onChange({ windowMode: value })}
            value={config.windowMode}
          />
        </Field>
        <div className="hidden sm:block" />

        <Field label="Daily limit">
          <input
            className={inputClass}
            disabled={disabled}
            inputMode="numeric"
            min={1}
            onChange={(event) => onChange({ dailyLimit: numOrUndefined(event.target.value) })}
            placeholder="Unlimited"
            type="number"
            value={config.dailyLimit ?? ""}
          />
        </Field>
        {isRolling ? (
          <p className="flex items-end pb-2 text-xs text-[#8b93a6] dark:text-white/40">
            Remaining is computed live from sends in the trailing 24 hours.
          </p>
        ) : (
          <Field label="Daily remaining (starting value)">
            <input
              className={inputClass}
              disabled={disabled}
              inputMode="numeric"
              min={0}
              onChange={(event) => onChange({ dailyRemaining: numOrUndefined(event.target.value) })}
              placeholder={config.dailyLimit ? String(config.dailyLimit) : "Full limit"}
              type="number"
              value={config.dailyRemaining ?? ""}
            />
          </Field>
        )}

        {isRolling ? (
          <Field label="Long window">
            <div className={`${inputClass} flex items-center text-[#8b93a6] dark:text-white/40`}>
              Trailing 30 days (fixed)
            </div>
          </Field>
        ) : (
          <Field label="Long period">
            <Listbox
              disabled={disabled}
              groups={[
                {
                  options: [
                    { label: "Monthly", value: "monthly" },
                    { label: "Every 30 days", value: "30day" },
                  ],
                },
              ]}
              onChange={(value: MailLongPeriod) => onChange({ longPeriod: value })}
              value={config.longPeriod ?? "monthly"}
            />
          </Field>
        )}
        <Field label="Long-period limit">
          <input
            className={inputClass}
            disabled={disabled}
            inputMode="numeric"
            min={1}
            onChange={(event) => onChange({ longLimit: numOrUndefined(event.target.value) })}
            placeholder="Unlimited"
            type="number"
            value={config.longLimit ?? ""}
          />
        </Field>
        {isRolling ? (
          <p className="flex items-end pb-2 text-xs text-[#8b93a6] dark:text-white/40">
            Remaining is computed live from sends in the trailing 30 days.
          </p>
        ) : (
          <Field label="Long-period remaining (starting value)">
            <input
              className={inputClass}
              disabled={disabled}
              inputMode="numeric"
              min={0}
              onChange={(event) => onChange({ longRemaining: numOrUndefined(event.target.value) })}
              placeholder={config.longLimit ? String(config.longLimit) : "Full limit"}
              type="number"
              value={config.longRemaining ?? ""}
            />
          </Field>
        )}
      </div>
    </div>
  );
}

function MailRoutingFields({
  form,
  routingDisabled,
  isSuperadmin,
  showProviderOrder,
  providerStatus,
  onStrategyChange,
  onReorder,
  onWeightChange,
  onLimitChange,
}: Readonly<{
  form: FormState;
  routingDisabled: boolean;
  isSuperadmin: boolean;
  showProviderOrder: boolean;
  providerStatus: MailProviderStatus | undefined;
  onStrategyChange: (value: MailStrategy) => void;
  onReorder: (from: number, to: number) => void;
  onWeightChange: (id: MailProviderId, value: string) => void;
  onLimitChange: (id: MailProviderId, patch: Partial<MailProviderLimitConfig>) => void;
}>) {
  return (
    <div className="mt-10 border-t border-[#dee4ef] pt-7 dark:border-white/10">
      <h2 className="font-display text-xl font-semibold tracking-[-0.03em]">Mail routing</h2>
      <p className="mt-1 text-sm text-[#69748a] dark:text-white/50">
        {isSuperadmin
          ? "Choose how outgoing contact-form emails are routed across Resend, SMTP, and Amazon SES. Every multi-provider strategy fails over to the next configured provider automatically."
          : "Only the superadmin can change mail routing settings."}
      </p>

      <div className="mt-5 grid gap-5">
        <Field label="Delivery strategy">
          <Listbox
            disabled={routingDisabled}
            groups={[
              {
                label: "Single provider",
                options: SINGLE_STRATEGIES.map((strategy) => ({
                  label: MAIL_STRATEGY_LABELS[strategy],
                  value: strategy,
                })),
              },
              {
                label: "Multi-provider (automatic failover)",
                options: MAIL_STRATEGIES.filter(isMultiProviderStrategy).map((strategy) => ({
                  label: MAIL_STRATEGY_LABELS[strategy],
                  value: strategy,
                })),
              },
            ]}
            onChange={onStrategyChange}
            value={form.mailStrategy}
          />
        </Field>

        {showProviderOrder ? (
          <div>
            <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
              Provider order
            </span>
            <ProviderOrderList
              disabled={routingDisabled}
              onReorder={onReorder}
              order={form.mailProviderOrder}
            />
            <p className="mt-2 text-xs text-[#8b93a6] dark:text-white/40">
              Determines failover priority, rotation start, and which eligible provider is tried
              first.
            </p>
          </div>
        ) : null}

        {form.mailStrategy === "loadBalanceWeighted" ? (
          <div>
            <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
              Provider weights
            </span>
            <div className="grid gap-3 sm:grid-cols-3">
              {form.mailProviderOrder.map((id) => (
                <Field key={id} label={MAIL_PROVIDER_LABELS[id]}>
                  <input
                    className={inputClass}
                    disabled={routingDisabled}
                    inputMode="decimal"
                    min={0}
                    onChange={(event) => onWeightChange(id, event.target.value)}
                    placeholder="1"
                    type="number"
                    value={form.mailProviderWeights[id] ?? ""}
                  />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#8b93a6] dark:text-white/40">
              Higher weight means a provider is picked more often. Unset defaults to 1.
            </p>
          </div>
        ) : null}

        {form.mailStrategy === "loadBalanceLimit" ? (
          <div>
            <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
              Provider limits
            </span>
            <div className="grid gap-3">
              {form.mailProviderOrder.map((id) => (
                <ProviderLimitEditor
                  config={form.mailProviderLimits[id] ?? { windowMode: "calendar" }}
                  disabled={routingDisabled}
                  id={id}
                  key={id}
                  onChange={(patch) => onLimitChange(id, patch)}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-[#8b93a6] dark:text-white/40">
              A provider with no limit set is treated as unlimited. A provider that has hit its
              limit is skipped automatically.
            </p>
          </div>
        ) : null}

        {providerStatus ? (
          <div className="grid gap-4">
            <div>
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
                Sender address
              </span>
              <StatusBadge
                entry={{ configured: providerStatus.fromEmailConfigured }}
                label={providerStatus.fromEmailConfigured ? "Configured" : "Not configured"}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
                Provider status
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {MAIL_PROVIDER_IDS.map((id) => (
                  <StatusBadge
                    entry={providerStatus.providers[id]}
                    key={id}
                    label={MAIL_PROVIDER_LABELS[id]}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-[#8b93a6] dark:text-white/40">
                Hover a badge for configuration and quota details.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SaveBar({
  isDirty,
  status,
  saveLabel,
  error,
  ready,
  onSave,
}: Readonly<{
  isDirty: boolean;
  status: "idle" | "saved" | "saving" | "error";
  saveLabel: string;
  error: string | undefined;
  ready: boolean;
  onSave: () => void;
}>) {
  return (
    <>
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
            onClick={onSave}
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
    </>
  );
}

export function ContactSettingsEditor({
  onDirtyChange,
  isSuperadmin,
}: Readonly<{
  onDirtyChange: (dirty: boolean) => void;
  isSuperadmin: boolean;
}>) {
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<FormState>({
    emails: [""],
    address: "",
    lat: "",
    lng: "",
    mailStrategy: "failover",
    mailProviderOrder: [...MAIL_PROVIDER_IDS],
    mailProviderWeights: {},
    mailProviderLimits: {},
  });
  const [baseline, setBaseline] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [providerStatus, setProviderStatus] = useState<MailProviderStatus>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      setLoadError(undefined); // skipcq: JS-W1042 -- required: the Dispatch<SetStateAction> setter has no optional parameter
      try {
        const response = await fetch("/api/admin/contact-settings");
        if (!response.ok) {
          throw new Error(await responseError(response, "The settings request failed."));
        }
        const data = (await response.json()) as { record?: ContactSettings };
        if (!data.record) throw new Error("The settings response did not include a record.");
        if (cancelled) return;
        const next = toForm(data.record);
        setForm(next);
        setBaseline(JSON.stringify(next));
        setReady(true);
      } catch (loadFailure) {
        if (cancelled) return;
        const detail =
          loadFailure instanceof Error ? loadFailure.message : "The settings request failed.";
        setLoadError(`Contact settings could not be loaded. ${detail}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/admin/contact-settings/mail-provider-status");
      if (!response.ok || cancelled) return;
      setProviderStatus((await response.json()) as MailProviderStatus);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStatus = async () => {
    const response = await fetch("/api/admin/contact-settings/mail-provider-status");
    if (!response.ok) return;
    setProviderStatus((await response.json()) as MailProviderStatus);
  };

  const isDirty = ready && JSON.stringify(form) !== baseline;

  const update = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    onDirtyChange(JSON.stringify(next) !== baseline);
  };

  const moveProvider = (from: number, to: number) => {
    const next = [...form.mailProviderOrder];
    if (to < 0 || to >= next.length) return;
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    update({ mailProviderOrder: next });
  };

  const updateWeight = (id: MailProviderId, value: string) => {
    update({
      mailProviderWeights: { ...form.mailProviderWeights, [id]: numOrUndefined(value) },
    });
  };

  const updateLimit = (id: MailProviderId, patch: Partial<MailProviderLimitConfig>) => {
    const current: MailProviderLimitConfig = form.mailProviderLimits[id] ?? {
      windowMode: "calendar",
    };
    update({
      mailProviderLimits: { ...form.mailProviderLimits, [id]: { ...current, ...patch } },
    });
  };

  let saveLabel = "Save settings";
  if (status === "saving") saveLabel = "Saving…";
  else if (status === "saved" && !isDirty) saveLabel = "Saved";

  const save = async () => {
    const validationError = validateContactSettingsForm(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    setStatus("saving");
    setError(undefined); // skipcq: JS-W1042 -- required: the Dispatch<SetStateAction> setter has no optional parameter
    try {
      const response = await fetch("/api/admin/contact-settings", {
        body: JSON.stringify({
          address: form.address.trim(),
          emails: form.emails.map((email) => email.trim()).filter(Boolean),
          lat,
          lng,
          mailStrategy: form.mailStrategy,
          mailProviderOrder: form.mailProviderOrder,
          mailProviderWeights: form.mailProviderWeights,
          mailProviderLimits: form.mailProviderLimits,
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
      await refreshStatus();
    } catch (saveError) {
      setStatus("error");
      const message =
        saveError instanceof Error ? saveError.message : "The changes could not be saved.";
      setError(message);
      toast.error("Settings were not saved", { description: message });
    }
  };

  const multiProvider = isMultiProviderStrategy(form.mailStrategy);
  // Equal rotation cycles every configured provider automatically — a
  // priority order doesn't mean much there, so only surface the reordering
  // UI for strategies where the order actually changes behavior.
  const showProviderOrder = multiProvider && form.mailStrategy !== "loadBalanceEqual";
  const routingDisabled = !ready || !isSuperadmin;

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
            The recipient inboxes and HQ address shown on the public /contact page. Coordinates
            power the &ldquo;Open in Maps&rdquo; link only — no map is embedded on the site.
          </p>
        </div>
      </div>

      {loadError ? (
        <div
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-red-50 px-4 py-3 text-sm text-brand-red dark:bg-brand-red/15 dark:text-brand-red-100"
          role="alert"
        >
          <span>{loadError}</span>
          <button
            className="rounded-lg border border-current px-3 py-1.5 font-semibold transition hover:bg-white/50 dark:hover:bg-white/10"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45">
            Recipient emails
          </span>
          <EmailListEditor
            disabled={!ready}
            emails={form.emails}
            onChange={(emails) => update({ emails })}
          />
          <p className="mt-2 text-xs text-[#8b93a6] dark:text-white/40">
            Every address here gets a copy of each new inquiry notification.
          </p>
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

      <MailRoutingFields
        form={form}
        isSuperadmin={isSuperadmin}
        onLimitChange={updateLimit}
        onReorder={moveProvider}
        onStrategyChange={(value) => update({ mailStrategy: value })}
        onWeightChange={updateWeight}
        providerStatus={providerStatus}
        routingDisabled={routingDisabled}
        showProviderOrder={showProviderOrder}
      />

      <div className="h-24" aria-hidden />

      <SaveBar
        error={error}
        isDirty={isDirty}
        onSave={save}
        ready={ready}
        saveLabel={saveLabel}
        status={status}
      />
    </div>
  );
}
