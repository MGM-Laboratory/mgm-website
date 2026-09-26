"use client";

import {
  ArrowCounterClockwise,
  CaretDown,
  Eye,
  EyeSlash,
  LockSimple,
  LockSimpleOpen,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  FORM_LABEL_KEYS,
  FORM_LIMITS,
  formLabels,
  maxScore,
  type FormLabelKey,
  type FormRecord,
  type FormSettings,
} from "@repo/shared";

import { formsAdminApi } from "@/lib/forms/admin-api";
import { isoToLocalInput, localInputToIso } from "@/lib/forms/builder-document";

import { MediaPicker } from "./media-picker";
import { AdminDatePicker } from "./admin-pickers";
import type { TabProps } from "./types";
import {
  ConfirmDialog,
  Counter,
  NumberInput,
  Segmented,
  Switch,
  cardClass,
  dangerButtonClass,
  eyebrowClass,
  primaryButtonClass,
  secondaryButtonClass,
  smallInputClass,
  textareaClass,
} from "./ui";

const labelText = "mb-1 block text-[11px] font-semibold text-[#687187] dark:text-white/45";

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "schedule", label: "Schedule & limits" },
  { id: "privacy", label: "Privacy" },
  { id: "notifications", label: "Notifications" },
  { id: "scoring", label: "Scoring" },
  { id: "seo", label: "SEO" },
  { id: "security", label: "Security" },
  { id: "danger", label: "Danger zone" },
] as const;

const LABEL_NAMES = new Map<FormLabelKey, string>([
  ["start", "Start button"],
  ["next", "Next button"],
  ["back", "Back button"],
  ["submit", "Submit button"],
  ["required", "Required marker"],
  ["optional", "Optional marker"],
  ["other", "“Other” option"],
  ["pressEnter", "Press Enter hint"],
  ["chooseFile", "Choose file"],
  ["dropFiles", "Drop files hint"],
  ["uploading", "Uploading"],
  ["selectPlaceholder", "Dropdown placeholder"],
  ["searchPlaceholder", "Search placeholder"],
  ["clear", "Clear"],
  ["closed", "Closed title"],
  ["resume", "Resume prompt"],
  ["startOver", "Start over"],
]);

/** A plain email shape check (no user-built patterns). */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Card({
  children,
  description,
  id,
  title,
  tone,
}: {
  children: React.ReactNode;
  description?: React.ReactNode;
  id: string;
  title: string;
  tone?: "danger";
}) {
  return (
    <section
      aria-labelledby={`settings-${id}-title`}
      className={`${cardClass} scroll-mt-40 !p-5 ${tone === "danger" ? "!border-brand-red/40" : ""}`}
      id={`settings-${id}`}
    >
      <h2
        className={`font-display text-lg font-semibold tracking-[-0.03em] ${tone === "danger" ? "text-brand-red" : ""}`}
        id={`settings-${id}-title`}
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-[#8490a5] dark:text-white/40">{description}</p>
      ) : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function EmailChips({
  disabled,
  onChange,
  values,
}: {
  disabled: boolean;
  onChange: (values: string[]) => void;
  values: string[];
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const inputId = useId();
  const commit = () => {
    const parts = text
      .split(/[,\s;]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;
    const bad = parts.find((part) => !EMAIL_SHAPE.test(part) || part.length > 254);
    if (bad) {
      setError(`“${bad}” isn't an email address.`);
      return;
    }
    const next = [...new Set([...values, ...parts])];
    if (next.length > FORM_LIMITS.notifyEmailsMax) {
      setError(`At most ${FORM_LIMITS.notifyEmailsMax} addresses.`);
      return;
    }
    setError(undefined);
    onChange(next);
    setText("");
  };
  return (
    <div>
      <label className={labelText} htmlFor={inputId}>
        Notify these addresses about every response
      </label>
      <div
        className={`flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border bg-white px-2 py-1.5 transition focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/10 dark:bg-white/[0.045] ${error ? "border-brand-red/70" : "border-[#d9dfeb] dark:border-white/10"}`}
      >
        {values.map((email) => (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-brand-blue-50 py-0.5 pr-1 pl-2.5 text-xs font-semibold text-brand-blue dark:bg-brand-blue/15"
            key={email}
          >
            {email}
            <button
              aria-label={`Remove ${email}`}
              className="grid size-5 place-items-center rounded-full transition hover:bg-brand-blue/15 hover:text-brand-red"
              disabled={disabled}
              onClick={() => {
                onChange(values.filter((item) => item !== email));
              }}
              type="button"
            >
              <X size={10} weight="bold" />
            </button>
          </span>
        ))}
        <input
          aria-describedby={error ? `${inputId}-error` : `${inputId}-hint`}
          aria-invalid={Boolean(error) || undefined}
          className="h-7 min-w-40 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-[#9ba4b5] dark:text-white"
          disabled={disabled || values.length >= FORM_LIMITS.notifyEmailsMax}
          id={inputId}
          onBlur={commit}
          onChange={(event) => {
            setText(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            } else if (event.key === "Backspace" && !text && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          placeholder={values.length ? "" : "name@example.com"}
          type="email"
          value={text}
        />
      </div>
      {error ? (
        <p
          className="mt-1.5 text-[11px] font-semibold text-brand-red"
          id={`${inputId}-error`}
          role="alert"
        >
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-[#9ba4b5] dark:text-white/35" id={`${inputId}-hint`}>
          Press Enter or a comma after each address. Up to {FORM_LIMITS.notifyEmailsMax}.
        </p>
      )}
    </div>
  );
}

function PassphraseCard({
  onRecordChange,
  readOnly,
  record,
}: {
  onRecordChange: (record: FormRecord) => void;
  readOnly: boolean;
  record: FormRecord;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const id = useId();
  const tooShort = value.length > 0 && value.length < 4;
  const mismatch = confirm.length > 0 && confirm !== value;
  const valid = value.length >= 4 && value === confirm;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const { form } = await formsAdminApi.update(record.id, {
        passphraseAction: "set",
        passphrase: value,
      });
      onRecordChange(form);
      toast.success(record.hasPassphrase ? "Passphrase changed." : "Passphrase set.");
      setEditing(false);
      setValue("");
      setConfirm("");
    } catch (error) {
      toast.error("Could not set the passphrase.", { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const { form } = await formsAdminApi.update(record.id, { passphraseAction: "remove" });
      onRecordChange(form);
      toast.success("Passphrase removed. Anyone with the link can open the form.");
      setRemoving(false);
    } catch (error) {
      toast.error("Could not remove the passphrase.", { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`grid size-9 place-items-center rounded-xl ${record.hasPassphrase ? "bg-brand-green-50 text-brand-green dark:bg-brand-green/15" : "bg-[#eef1f6] text-[#5d687d] dark:bg-white/10 dark:text-white/55"}`}
        >
          {record.hasPassphrase ? (
            <LockSimple size={17} weight="bold" />
          ) : (
            <LockSimpleOpen size={17} weight="bold" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {record.hasPassphrase ? "Protected by a passphrase" : "Open to anyone with the link"}
          </p>
          <p className="text-xs text-[#8490a5] dark:text-white/40">
            {record.hasPassphrase
              ? "Respondents type the passphrase before they see the questions."
              : "Add a passphrase to limit the form to people you tell it to."}
          </p>
        </div>
        {!editing ? (
          <div className="flex gap-2">
            <button
              className={secondaryButtonClass}
              disabled={readOnly}
              onClick={() => {
                setEditing(true);
              }}
              type="button"
            >
              {record.hasPassphrase ? "Change" : "Set passphrase"}
            </button>
            {record.hasPassphrase ? (
              <button
                className={secondaryButtonClass}
                disabled={readOnly}
                onClick={() => {
                  setRemoving(true);
                }}
                type="button"
              >
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {editing ? (
        <div className="space-y-3 rounded-xl bg-[#f5f7fb] p-3.5 dark:bg-white/[0.03]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelText}>New passphrase</span>
              <div className="relative">
                <input
                  aria-describedby={tooShort ? `${id}-short` : undefined}
                  aria-invalid={tooShort || undefined}
                  autoComplete="new-password"
                  className={`${smallInputClass} pr-10`}
                  data-autofocus=""
                  maxLength={200}
                  onChange={(event) => {
                    setValue(event.target.value);
                  }}
                  type={show ? "text" : "password"}
                  value={value}
                />
                <button
                  aria-label={show ? "Hide passphrase" : "Show passphrase"}
                  className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-[#8490a5] hover:text-brand-blue"
                  onClick={() => {
                    setShow((current) => !current);
                  }}
                  type="button"
                >
                  {show ? <EyeSlash size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
            <label className="block">
              <span className={labelText}>Type it again</span>
              <input
                aria-describedby={mismatch ? `${id}-mismatch` : undefined}
                aria-invalid={mismatch || undefined}
                autoComplete="new-password"
                className={smallInputClass}
                maxLength={200}
                onChange={(event) => {
                  setConfirm(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void save();
                }}
                type={show ? "text" : "password"}
                value={confirm}
              />
            </label>
          </div>
          {tooShort ? (
            <p className="text-[11px] font-semibold text-brand-red" id={`${id}-short`} role="alert">
              Use at least 4 characters.
            </p>
          ) : null}
          {mismatch ? (
            <p
              className="text-[11px] font-semibold text-brand-red"
              id={`${id}-mismatch`}
              role="alert"
            >
              The two passphrases don&rsquo;t match.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              className={secondaryButtonClass}
              onClick={() => {
                setEditing(false);
                setValue("");
                setConfirm("");
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={!valid || busy}
              onClick={() => {
                void save();
              }}
              type="button"
            >
              {busy ? "Saving…" : "Save passphrase"}
            </button>
          </div>
        </div>
      ) : null}
      {removing ? (
        <ConfirmDialog
          body="Anyone with the link will be able to open and answer the form."
          busy={busy}
          confirmLabel="Remove passphrase"
          onCancel={() => {
            setRemoving(false);
          }}
          onConfirm={() => {
            void remove();
          }}
          title="Remove the passphrase?"
        />
      ) : null}
    </div>
  );
}

/** The Settings tab: language, labels, schedule, privacy, notifications, SEO, security. */
export function SettingsTab({
  canDelete,
  change,
  document,
  onDeleteForm,
  onRecordChange,
  readOnly,
  record,
}: TabProps & {
  canDelete: boolean;
  onDeleteForm: () => void;
  onRecordChange: (record: FormRecord) => void;
}) {
  const settings = document.settings;
  const [labelsOpen, setLabelsOpen] = useState(() => Object.keys(settings.labels).length > 0);
  const defaults = useMemo(() => formLabels(settings.language), [settings.language]);
  const defaultLabels = useMemo(() => new Map(Object.entries(defaults)), [defaults]);
  const customLabels = new Map(Object.entries(settings.labels));
  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "local time";
    }
  }, []);
  const computedMax = useMemo(() => maxScore(document), [document]);
  const emailFields = document.fields.filter((field) => field.type === "email");

  const update = (patch: Partial<FormSettings>, coalesce?: string) => {
    change((current) => ({ ...current, settings: { ...current.settings, ...patch } }), coalesce);
  };

  const opensLocal = isoToLocalInput(settings.opensAt);
  const closesLocal = isoToLocalInput(settings.closesAt);
  const scheduleError =
    settings.opensAt &&
    settings.closesAt &&
    new Date(settings.closesAt).getTime() <= new Date(settings.opensAt).getTime()
      ? "The closing time must be after the opening time."
      : undefined;

  const seoTitle = settings.seo.title || document.title;
  const seoDescription = settings.seo.description || "Fill in this form from MGM Laboratory.";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-[calc(var(--builder-top)+1rem)] space-y-0.5">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  className={`block rounded-lg px-3 py-1.5 text-sm font-semibold transition hover:bg-white hover:text-[#171b25] dark:hover:bg-white/[0.06] dark:hover:text-white ${section.id === "danger" ? "text-brand-red" : "text-[#5d687d] dark:text-white/55"}`}
                  href={`#settings-${section.id}`}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <fieldset className="mx-auto w-full max-w-3xl min-w-0 space-y-5" disabled={readOnly}>
          <Card id="general" title="General">
            <div>
              <span className={labelText}>Language of the form&rsquo;s interface</span>
              <Segmented
                label="Language"
                onChange={(language) => {
                  update({ language });
                }}
                options={[
                  { value: "en", label: "English" },
                  { value: "id", label: "Bahasa Indonesia" },
                ]}
                value={settings.language}
              />
            </div>
            <Switch
              checked={settings.showQuestionNumbers}
              label="Number the questions"
              onChange={(showQuestionNumbers) => {
                update({ showQuestionNumbers });
              }}
            />
            <Switch
              checked={settings.autosave}
              description="Unfinished answers stay in the respondent's browser, so a reload doesn't lose them."
              label="Keep progress while answering"
              onChange={(autosave) => {
                update({ autosave });
              }}
            />
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className={labelText} htmlFor="settings-note">
                  Internal note (only admins see it)
                </label>
                <Counter max={2000} value={(document.internalNote ?? "").length} />
              </div>
              <textarea
                className={textareaClass}
                id="settings-note"
                maxLength={2000}
                onChange={(event) => {
                  change(
                    (current) => ({ ...current, internalNote: event.target.value || undefined }),
                    "settings.internalNote",
                  );
                }}
                placeholder="Who owns this form, when to archive it…"
                value={document.internalNote ?? ""}
              />
            </div>
            <div className="rounded-xl border border-[#e3e7f0] dark:border-white/10">
              <button
                aria-controls="settings-labels"
                aria-expanded={labelsOpen}
                className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
                onClick={() => {
                  setLabelsOpen((current) => !current);
                }}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Interface labels</span>
                  <span className="block text-xs text-[#8490a5] dark:text-white/40">
                    {Object.keys(settings.labels).length
                      ? `${Object.keys(settings.labels).length} changed`
                      : "Buttons and hints use the defaults for the chosen language."}
                  </span>
                </span>
                <CaretDown
                  className={`shrink-0 text-[#8490a5] transition ${labelsOpen ? "rotate-180" : ""}`}
                  size={15}
                />
              </button>
              {labelsOpen ? (
                <div
                  className="border-t border-[#e3e7f0] p-3.5 dark:border-white/10"
                  id="settings-labels"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    {FORM_LABEL_KEYS.map((key) => (
                      <label className="block" key={key}>
                        <span className={labelText}>{LABEL_NAMES.get(key)}</span>
                        <input
                          className={smallInputClass}
                          maxLength={80}
                          onChange={(event) => {
                            const value = event.target.value;
                            const labels = Object.fromEntries(
                              Object.entries(settings.labels).filter(([name]) => name !== key),
                            ) as FormSettings["labels"];
                            update(
                              { labels: value ? { ...labels, [key]: value } : labels },
                              `settings.labels.${key}`,
                            );
                          }}
                          placeholder={defaultLabels.get(key)}
                          value={customLabels.get(key) ?? ""}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    className={`${secondaryButtonClass} mt-3`}
                    disabled={!Object.keys(settings.labels).length}
                    onClick={() => {
                      update({ labels: {} });
                    }}
                    type="button"
                  >
                    <ArrowCounterClockwise size={15} />
                    Reset all
                  </button>
                </div>
              ) : null}
            </div>
          </Card>

          <Card
            description={`Times are in your time zone (${timezone}) and stored in UTC.`}
            id="schedule"
            title="Schedule & limits"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["opensAt", "Opens", opensLocal],
                  ["closesAt", "Closes", closesLocal],
                ] as const
              ).map(([key, label, local]) => (
                <div className="block" key={key}>
                  <span className={labelText}>{label}</span>
                  <AdminDatePicker
                    ariaLabel={`${label} at`}
                    describedBy={key === "closesAt" && scheduleError ? "schedule-error" : undefined}
                    invalid={key === "closesAt" && Boolean(scheduleError)}
                    kind="datetime"
                    onChange={(next) => {
                      update(
                        key === "opensAt"
                          ? { opensAt: localInputToIso(next ?? "") }
                          : { closesAt: localInputToIso(next ?? "") },
                      );
                    }}
                    value={local}
                  />
                </div>
              ))}
            </div>
            {scheduleError ? (
              <p
                className="text-[11px] font-semibold text-brand-red"
                id="schedule-error"
                role="alert"
              >
                {scheduleError}
              </p>
            ) : null}
            <label className="block sm:max-w-xs">
              <span className={labelText}>Response limit</span>
              <NumberInput
                min={1}
                onChange={(value) => {
                  update(
                    { responseLimit: value && value > 0 ? Math.round(value) : undefined },
                    "settings.limit",
                  );
                }}
                placeholder="No limit"
                value={settings.responseLimit}
              />
            </label>
            <div className="grid gap-3">
              <label className="block">
                <span className={labelText}>Closed screen title</span>
                <input
                  className={smallInputClass}
                  maxLength={200}
                  onChange={(event) => {
                    update(
                      { closedTitle: event.target.value || undefined },
                      "settings.closedTitle",
                    );
                  }}
                  placeholder={defaults.closed}
                  value={settings.closedTitle ?? ""}
                />
              </label>
              <label className="block">
                <span className={labelText}>Closed screen message</span>
                <textarea
                  className={textareaClass}
                  maxLength={1000}
                  onChange={(event) => {
                    update(
                      { closedMessage: event.target.value || undefined },
                      "settings.closedMessage",
                    );
                  }}
                  placeholder="Thanks for your interest. Follow MGM Laboratory for the next one."
                  value={settings.closedMessage ?? ""}
                />
              </label>
            </div>
            <Switch
              checked={settings.onePerDevice}
              description="A browser that has already submitted sees a notice instead of the form. Not a guarantee: another browser can answer again."
              label="One response per device"
              onChange={(onePerDevice) => {
                update({ onePerDevice });
              }}
            />
          </Card>

          <Card id="privacy" title="Privacy">
            <Switch
              checked={settings.collectLocation}
              description="Stores the respondent's IP address and an approximate city and country with each response."
              label="Collect IP address and location"
              onChange={(collectLocation) => {
                update({ collectLocation });
              }}
            />
            {settings.collectLocation ? (
              <p className="rounded-xl bg-brand-yellow-50 p-3 text-xs leading-5 text-[#7a5a10] dark:bg-brand-yellow/10 dark:text-brand-yellow">
                This is personal data. Say so in the form&rsquo;s description or a consent question,
                and keep it only as long as you need it (Indonesia&rsquo;s personal data protection
                law, UU PDP, asks for a clear purpose and consent).
              </p>
            ) : null}
            <label className="block sm:max-w-xs">
              <span className={labelText}>Minimum seconds to answer (anti-spam)</span>
              <NumberInput
                max={600}
                min={0}
                onChange={(value) => {
                  update(
                    {
                      minSeconds:
                        value === undefined ? 0 : Math.min(600, Math.max(0, Math.round(value))),
                    },
                    "settings.minSeconds",
                  );
                }}
                placeholder="3"
                value={settings.minSeconds}
              />
              <span className="mt-1.5 block text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35">
                Faster submissions are kept but marked as spam. 0 turns this off.
              </span>
            </label>
          </Card>

          <Card id="notifications" title="Notifications">
            <EmailChips
              disabled={readOnly}
              onChange={(notifyEmails) => {
                update({ notifyEmails });
              }}
              values={settings.notifyEmails}
            />
            <div className="space-y-3 border-t border-[#eef1f6] pt-4 dark:border-white/[0.07]">
              <Switch
                checked={settings.receipt.enabled}
                description="Emails the respondent a copy of their answers."
                label="Send a receipt"
                onChange={(enabled) => {
                  update({
                    receipt: {
                      ...settings.receipt,
                      enabled,
                      emailFieldId:
                        settings.receipt.emailFieldId ?? (enabled ? emailFields[0]?.id : undefined),
                    },
                  });
                }}
              />
              {settings.receipt.enabled ? (
                emailFields.length ? (
                  <div className="grid gap-3">
                    <label className="block">
                      <span className={labelText}>Send to the answer of</span>
                      <select
                        className={smallInputClass}
                        onChange={(event) => {
                          update({
                            receipt: {
                              ...settings.receipt,
                              emailFieldId: event.target.value || undefined,
                            },
                          });
                        }}
                        value={settings.receipt.emailFieldId ?? ""}
                      >
                        <option value="">Choose an email question</option>
                        {emailFields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.label || "Untitled email question"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className={labelText}>Subject</span>
                      <input
                        className={smallInputClass}
                        maxLength={200}
                        onChange={(event) => {
                          update(
                            {
                              receipt: {
                                ...settings.receipt,
                                subject: event.target.value || undefined,
                              },
                            },
                            "settings.receipt.subject",
                          );
                        }}
                        placeholder={`Your answers to ${document.title}`}
                        value={settings.receipt.subject ?? ""}
                      />
                    </label>
                    <label className="block">
                      <span className={labelText}>Message</span>
                      <textarea
                        className={textareaClass}
                        maxLength={2000}
                        onChange={(event) => {
                          update(
                            {
                              receipt: {
                                ...settings.receipt,
                                message: event.target.value || undefined,
                              },
                            },
                            "settings.receipt.message",
                          );
                        }}
                        placeholder="Thanks for your response. Here is a copy of what you sent."
                        value={settings.receipt.message ?? ""}
                      />
                    </label>
                  </div>
                ) : (
                  <p className="rounded-xl bg-[#f5f7fb] p-3 text-xs leading-5 text-[#69748a] dark:bg-white/[0.04] dark:text-white/50">
                    The form has no email question yet. Add an Email block in Build, then choose it
                    here.
                  </p>
                )
              ) : null}
            </div>
          </Card>

          <Card
            description="Points per option are set in the Logic tab (or in each choice question's options)."
            id="scoring"
            title="Scoring"
          >
            <Switch
              checked={settings.scoring.enabled}
              description="Adds up the points of the chosen options; endings can show the score or depend on it."
              label="Score answers"
              onChange={(enabled) => {
                update({ scoring: { ...settings.scoring, enabled } });
              }}
            />
            {settings.scoring.enabled ? (
              <label className="block sm:max-w-xs">
                <span className={labelText}>Maximum score</span>
                <NumberInput
                  min={1}
                  onChange={(value) => {
                    update(
                      {
                        scoring: {
                          ...settings.scoring,
                          maxScore: value && value > 0 ? value : undefined,
                        },
                      },
                      "settings.scoring.max",
                    );
                  }}
                  placeholder={String(computedMax || "")}
                  step="any"
                  value={settings.scoring.maxScore}
                />
                <span className="mt-1.5 block text-[11px] text-[#9ba4b5] dark:text-white/35">
                  Empty uses the computed maximum ({computedMax}).
                </span>
              </label>
            ) : null}
          </Card>

          <Card id="seo" title="Search and sharing">
            <label className="block">
              <span className={labelText}>Title</span>
              <input
                className={smallInputClass}
                maxLength={120}
                onChange={(event) => {
                  update(
                    { seo: { ...settings.seo, title: event.target.value || undefined } },
                    "settings.seo.title",
                  );
                }}
                placeholder={document.title}
                value={settings.seo.title ?? ""}
              />
            </label>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className={labelText} htmlFor="settings-seo-description">
                  Description
                </label>
                <Counter max={300} value={(settings.seo.description ?? "").length} />
              </div>
              <textarea
                className={textareaClass}
                id="settings-seo-description"
                maxLength={300}
                onChange={(event) => {
                  update(
                    { seo: { ...settings.seo, description: event.target.value || undefined } },
                    "settings.seo.description",
                  );
                }}
                placeholder="One or two sentences shown in link previews."
                value={settings.seo.description ?? ""}
              />
            </div>
            <div>
              <span className={labelText}>Share image</span>
              <MediaPicker
                accept={["image"]}
                formId={record.id}
                label="Share image"
                onChange={(image) => {
                  update({ seo: { ...settings.seo, image } });
                }}
                value={settings.seo.image}
              />
            </div>
            <Switch
              checked={settings.seo.noindex}
              description="Keeps the form out of search results; people with the link can still open it."
              label="Hide from search engines"
              onChange={(noindex) => {
                update({ seo: { ...settings.seo, noindex } });
              }}
            />
            <div>
              <p className={eyebrowClass}>Link preview</p>
              <div className="mt-2 max-w-md overflow-hidden rounded-xl border border-[#dfe4ee] bg-white dark:border-white/10 dark:bg-white/[0.03]">
                <div className="grid aspect-[1.91/1] place-items-center bg-[#eef1f6] text-xs text-[#8490a5] dark:bg-white/[0.05]">
                  {settings.seo.image ? "Share image" : "No share image; the site default is used"}
                </div>
                <div className="p-3">
                  <p className="truncate font-mono text-[10px] text-[#8490a5] uppercase">
                    mgm lab · /forms/{record.slug}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold">{seoTitle}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[#69748a] dark:text-white/50">
                    {seoDescription}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card id="security" title="Security">
            <PassphraseCard onRecordChange={onRecordChange} readOnly={readOnly} record={record} />
          </Card>

          <Card id="danger" title="Danger zone" tone="danger">
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 basis-64 text-sm leading-6 text-[#4f5a6f] dark:text-white/60">
                Deleting the form removes it with every response, visit and uploaded file. This
                can&rsquo;t be undone.
              </p>
              <button
                className={dangerButtonClass}
                disabled={!canDelete}
                onClick={onDeleteForm}
                title={canDelete ? undefined : "Your account can't delete forms"}
                type="button"
              >
                <Trash size={16} />
                Delete this form
              </button>
            </div>
          </Card>
        </fieldset>
      </div>
    </div>
  );
}
