"use client";

import {
  ArrowsClockwise,
  CheckCircle,
  Copy,
  Eye,
  EyeSlash,
  Key,
  PencilSimple,
  Plus,
  Prohibit,
  ShieldCheck,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PermissionMatrix, MATRIX_PAGES } from "@/components/admin/permission-matrix";
import { useAdminRecords } from "@/hooks/use-admin-records";
import {
  ADMIN_PAGE_IDS,
  type AdminPermissions,
  type CmsAdminRecord,
} from "@/lib/admin-permissions";

const inputClass =
  "h-10 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/30";

const fieldLabel = "text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase";

function emptyPermissions(): AdminPermissions {
  return Object.fromEntries(
    ADMIN_PAGE_IDS.map((page) => [page, []]),
  ) as unknown as AdminPermissions;
}

function permissionsSummary(record: CmsAdminRecord) {
  return MATRIX_PAGES.filter((page) => (record.permissions[page.id] ?? []).length > 0).map(
    (page) => page.label,
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusOf(record: CmsAdminRecord) {
  if (!record.active)
    return {
      label: "Revoked",
      tone: "bg-[#eef1f7] text-[#768096] dark:bg-white/[0.08] dark:text-white/45",
    };
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
    return { label: "Expired", tone: "bg-brand-red-50 text-brand-red" };
  }
  return { label: "Active", tone: "bg-brand-green-50 text-brand-green" };
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string; message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    return message || body.error || fallback;
  } catch {
    return fallback;
  }
}

/** Broadcasts the outcome so other tabs and the studio stay in sync. */
function announce(record?: CmsAdminRecord) {
  const channel = new BroadcastChannel("mgm-admin-cms");
  channel.postMessage({ record });
  channel.close();
  window.dispatchEvent(new CustomEvent("mgm:admin-updated", { detail: record }));
}

export function AdminManagementPanel({ initialAdmins = [] }: { initialAdmins?: CmsAdminRecord[] }) {
  const { records, setRecords } = useAdminRecords(initialAdmins);
  const [editing, setEditing] = useState<CmsAdminRecord | "new" | undefined>();
  const [rotating, setRotating] = useState<CmsAdminRecord | undefined>();
  const [showOnce, setShowOnce] = useState<{ name: string; passphrase: string } | undefined>();

  const remove = (record: CmsAdminRecord) => {
    if (!window.confirm(`Delete the administrator account for ${record.name}?`)) return;
    void fetch(`/api/admin/admins/${encodeURIComponent(record.slug)}`, { method: "DELETE" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(await readError(response, "The account could not be deleted."));
        setRecords((current) => current.filter((item) => item.slug !== record.slug));
        announce();
        toast.success("Account deleted", { description: `${record.name} can no longer sign in.` });
      })
      .catch((error: Error) => toast.error("Delete failed", { description: error.message }));
  };

  const toggleActive = (record: CmsAdminRecord) => {
    const next = !record.active;
    if (
      next &&
      window.confirm(`Revoke access for ${record.name}? Their current session ends immediately.`)
    ) {
      void mutateActive(record, false);
    } else if (!next) {
      void mutateActive(record, true);
    }
  };

  const mutateActive = (record: CmsAdminRecord, active: boolean) => {
    void fetch(`/api/admin/admins/${encodeURIComponent(record.slug)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active }),
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(await readError(response, "The account could not be updated."));
        const data = (await response.json()) as { record: CmsAdminRecord };
        setRecords((current) =>
          current.map((item) => (item.slug === record.slug ? data.record : item)),
        );
        announce(data.record);
        toast.success(active ? "Account restored" : "Account revoked", {
          description: `${record.name} ${active ? "can sign in again." : "is locked out of the panel."}`,
        });
      })
      .catch((error: Error) => toast.error("Update failed", { description: error.message }));
  };

  return (
    <div className="pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-blue uppercase">
            MGM Laboratory
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.05em]">
            Admin Management
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#6b768b] dark:text-white/55">
            Create administrator accounts, tune their editorial permissions, rotate their
            passphrases, and revoke access. Every change ends the account&apos;s current sessions.
          </p>
        </div>
        <button
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-blue active:scale-[0.98]"
          onClick={() => setEditing("new")}
          type="button"
        >
          <Plus size={17} weight="bold" />
          New admin
        </button>
      </div>

      <div className="mt-10 space-y-3">
        <div className="flex items-center gap-4 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-blue text-white">
            <ShieldCheck size={22} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]">
              Superadmin
              <span className="rounded-full bg-brand-blue px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-white uppercase">
                Superadmin
              </span>
            </p>
            <p className="mt-1 text-sm text-[#768096] dark:text-white/45">
              Environment passphrase · unrestricted access to every workspace.
            </p>
          </div>
        </div>

        {records.map((record) => {
          const status = statusOf(record);
          const pages = permissionsSummary(record);
          return (
            <div
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]"
              key={record.slug}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-green-50 text-brand-green">
                <Key size={22} weight="duotone" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]">
                  {record.name}
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] uppercase ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#768096] dark:text-white/45">
                  <span>
                    Expires{" "}
                    <span className="font-mono text-[13px]">{formatDate(record.expiresAt)}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Last login{" "}
                    <span className="font-mono text-[13px]">{formatDate(record.lastLoginAt)}</span>
                  </span>
                </p>
                {pages.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pages.map((page) => (
                      <span
                        className="rounded-full bg-brand-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.08em] text-brand-blue uppercase dark:bg-brand-blue/20"
                        key={page}
                      >
                        {page}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-[#8993a7] uppercase dark:text-white/30">
                    No workspace access
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="inline-flex rounded-lg p-2 text-[#667187] transition hover:bg-brand-blue-50 hover:text-brand-blue dark:text-white/55 dark:hover:bg-brand-blue/20"
                  onClick={() => setEditing(record)}
                  title={`Edit ${record.name}`}
                  type="button"
                >
                  <PencilSimple size={18} />
                </button>
                <button
                  className="inline-flex rounded-lg p-2 text-[#667187] transition hover:bg-brand-blue-50 hover:text-brand-blue dark:text-white/55 dark:hover:bg-brand-blue/20"
                  onClick={() => setRotating(record)}
                  title={`Rotate ${record.name}'s passphrase`}
                  type="button"
                >
                  <ArrowsClockwise size={18} />
                </button>
                <button
                  className={`inline-flex rounded-lg p-2 transition ${record.active ? "text-[#667187] hover:bg-brand-yellow-50 hover:text-[#a97b1c] dark:text-white/55 dark:hover:bg-brand-yellow/20" : "text-[#667187] hover:bg-brand-green-50 hover:text-brand-green dark:text-white/55 dark:hover:bg-brand-green/20"}`}
                  onClick={() => toggleActive(record)}
                  title={record.active ? `Revoke ${record.name}` : `Restore ${record.name}`}
                  type="button"
                >
                  {record.active ? <Prohibit size={18} /> : <CheckCircle size={18} />}
                </button>
                <button
                  className="inline-flex rounded-lg p-2 text-[#667187] transition hover:bg-brand-red-50 hover:text-brand-red dark:text-white/55 dark:hover:bg-brand-red/20"
                  onClick={() => remove(record)}
                  title={`Delete ${record.name}`}
                  type="button"
                >
                  <Trash size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing ? (
        <AdminAccountDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={(record, generated) => {
            setRecords((current) => [
              ...current.filter((item) => item.slug !== record.slug),
              record,
            ]);
            announce(record);
            setEditing(undefined);
            if (generated) {
              setShowOnce({ name: record.name, passphrase: generated });
            } else {
              toast.success(editing === "new" ? "Account created" : "Account updated", {
                description: `${record.name} can now sign in.`,
              });
            }
          }}
        />
      ) : null}
      {rotating ? (
        <RotateDialog
          onClose={() => setRotating(undefined)}
          onRotated={(record, generated) => {
            setRecords((current) =>
              current.map((item) => (item.slug === record.slug ? record : item)),
            );
            announce(record);
            setRotating(undefined);
            if (generated) setShowOnce({ name: record.name, passphrase: generated });
          }}
          record={rotating}
        />
      ) : null}
      {showOnce ? (
        <ShowOnceDialog onClose={() => setShowOnce(undefined)} secret={showOnce} />
      ) : null}
    </div>
  );
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-[#10131b]/70 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#dfe4ee] bg-white p-6 shadow-[0_30px_70px_-40px_rgba(20,32,58,0.7)] dark:border-white/10 dark:bg-[#171b25]"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.04em]">{title}</h2>
          <button
            aria-label="Close"
            className="inline-flex rounded-lg p-2 text-[#768096] transition hover:bg-[#f1f4fa] hover:text-[#202532] dark:hover:bg-white/10 dark:hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type AdminForm = {
  name: string;
  passphrase: string;
  passphraseMode: "custom" | "generate";
  rotate: boolean;
  neverExpires: boolean;
  expiresAt: string;
  active: boolean;
  permissions: AdminPermissions;
};

function AdminAccountDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial?: CmsAdminRecord;
  onClose: () => void;
  onSaved: (record: CmsAdminRecord, generatedPassphrase?: string) => void;
}) {
  const creating = !initial;
  const [form, setForm] = useState<AdminForm>(() => ({
    name: initial?.name ?? "",
    passphrase: "",
    passphraseMode: "generate",
    rotate: false,
    neverExpires: !initial?.expiresAt,
    expiresAt: initial?.expiresAt ? initial.expiresAt.slice(0, 10) : "",
    active: initial?.active ?? true,
    permissions: initial ? { ...initial.permissions } : emptyPermissions(),
  }));
  const [saving, setSaving] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);

  const update = <K extends keyof AdminForm>(key: K, value: AdminForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const canSave = useMemo(() => {
    if (!form.name.trim()) return false;
    if (creating && form.passphraseMode === "custom" && form.passphrase.length < 8) return false;
    if (!creating && form.rotate && form.passphraseMode === "custom" && form.passphrase.length < 8)
      return false;
    return true;
  }, [creating, form.name, form.passphrase, form.passphraseMode, form.rotate]);

  const submit = () => {
    if (!canSave || saving) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      expiresAt: form.neverExpires ? null : `${form.expiresAt}T23:59:59.000Z`,
      permissions: form.permissions,
    };
    if (!creating) payload.active = form.active;
    if (creating || form.rotate) {
      payload.passphrase = form.passphraseMode === "generate" ? "generate" : form.passphrase;
    }
    void fetch(
      creating ? "/api/admin/admins" : `/api/admin/admins/${encodeURIComponent(initial.slug)}`,
      {
        method: creating ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(await readError(response, "The account could not be saved."));
        const data = (await response.json()) as {
          record: CmsAdminRecord;
          generatedPassphrase?: string;
        };
        onSaved(data.record, data.generatedPassphrase);
      })
      .catch((error: Error) => {
        setSaving(false);
        toast.error("Save failed", { description: error.message });
      });
  };

  return (
    <Modal onClose={onClose} title={creating ? "New admin account" : `Edit ${initial.name}`}>
      <div className="mt-6 space-y-5">
        <div>
          <label className={fieldLabel} htmlFor="admin-name">
            Name
          </label>
          <input
            className={`${inputClass} mt-2`}
            id="admin-name"
            onChange={(event) => update("name", event.target.value)}
            placeholder="e.g. Editorial assistant"
            value={form.name}
          />
        </div>

        <div>
          <span className={fieldLabel}>Passphrase</span>
          {creating ? (
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <input
                  className={`${inputClass} pr-10`}
                  disabled={form.passphraseMode === "generate"}
                  onChange={(event) => update("passphrase", event.target.value)}
                  placeholder={
                    form.passphraseMode === "generate"
                      ? "Generated on save"
                      : "At least 8 characters"
                  }
                  type={showPassphrase ? "text" : "password"}
                  value={form.passphraseMode === "generate" ? "" : form.passphrase}
                />
                <button
                  aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-[#768096] transition hover:bg-[#f1f4fa] hover:text-[#202532] dark:hover:bg-white/10 dark:hover:text-white"
                  disabled={form.passphraseMode === "generate"}
                  onClick={() => setShowPassphrase((current) => !current)}
                  type="button"
                >
                  {showPassphrase ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${form.passphraseMode === "generate" ? "bg-brand-blue text-white" : "border border-[#d9dfeb] text-[#5d687d] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"}`}
                onClick={() => {
                  update(
                    "passphraseMode",
                    form.passphraseMode === "generate" ? "custom" : "generate",
                  );
                  update("passphrase", "");
                }}
                type="button"
              >
                <ArrowsClockwise size={15} />
                Generate
              </button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <input
                checked={form.rotate}
                className="accent-brand-blue"
                id="rotate-passphrase"
                onChange={(event) => update("rotate", event.target.checked)}
                type="checkbox"
              />
              <label
                className="text-sm font-medium text-[#3e4859] dark:text-white/75"
                htmlFor="rotate-passphrase"
              >
                Rotate passphrase
              </label>
            </div>
          )}
          {form.rotate && !creating ? (
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <input
                  className={`${inputClass} pr-10`}
                  disabled={form.passphraseMode === "generate"}
                  onChange={(event) => update("passphrase", event.target.value)}
                  placeholder={
                    form.passphraseMode === "generate"
                      ? "Generated on save"
                      : "At least 8 characters"
                  }
                  type={showPassphrase ? "text" : "password"}
                  value={form.passphraseMode === "generate" ? "" : form.passphrase}
                />
                <button
                  aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-[#768096] transition hover:bg-[#f1f4fa] hover:text-[#202532] dark:hover:bg-white/10 dark:hover:text-white"
                  disabled={form.passphraseMode === "generate"}
                  onClick={() => setShowPassphrase((current) => !current)}
                  type="button"
                >
                  {showPassphrase ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${form.passphraseMode === "generate" ? "bg-brand-blue text-white" : "border border-[#d9dfeb] text-[#5d687d] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"}`}
                onClick={() => {
                  update(
                    "passphraseMode",
                    form.passphraseMode === "generate" ? "custom" : "generate",
                  );
                  update("passphrase", "");
                }}
                type="button"
              >
                <ArrowsClockwise size={15} />
                Generate
              </button>
            </div>
          ) : null}
        </div>

        <div>
          <span className={fieldLabel}>Expiry</span>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              className={`${inputClass} w-44`}
              disabled={form.neverExpires}
              onChange={(event) => update("expiresAt", event.target.value)}
              type="date"
              value={form.expiresAt}
            />
            <label className="flex items-center gap-2 text-sm font-medium text-[#3e4859] dark:text-white/75">
              <input
                checked={form.neverExpires}
                className="accent-brand-blue"
                onChange={(event) => update("neverExpires", event.target.checked)}
                type="checkbox"
              />
              Never expires
            </label>
          </div>
        </div>

        {!creating ? (
          <div>
            <span className={fieldLabel}>Status</span>
            <div className="mt-2 flex items-center gap-2">
              <input
                checked={form.active}
                className="accent-brand-blue"
                id="admin-active"
                onChange={(event) => update("active", event.target.checked)}
                type="checkbox"
              />
              <label
                className="text-sm font-medium text-[#3e4859] dark:text-white/75"
                htmlFor="admin-active"
              >
                Active (can sign in)
              </label>
            </div>
          </div>
        ) : null}

        <div>
          <span className={fieldLabel}>Editorial permissions</span>
          <div className="mt-2">
            <PermissionMatrix
              onChange={(permissions) => update("permissions", permissions)}
              value={form.permissions}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            className="inline-flex h-11 items-center rounded-xl border border-[#d9dfeb] px-4 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-blue active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSave || saving}
            onClick={submit}
            type="button"
          >
            {saving ? "Saving..." : creating ? "Create account" : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RotateDialog({
  onClose,
  onRotated,
  record,
}: {
  onClose: () => void;
  onRotated: (record: CmsAdminRecord, generatedPassphrase?: string) => void;
  record: CmsAdminRecord;
}) {
  const [mode, setMode] = useState<"custom" | "generate">("generate");
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = mode === "generate" || passphrase.length >= 8;

  const submit = () => {
    if (!canSave || saving) return;
    setSaving(true);
    void fetch(`/api/admin/admins/${encodeURIComponent(record.slug)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: mode === "generate" ? "generate" : passphrase }),
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(await readError(response, "The passphrase could not be rotated."));
        const data = (await response.json()) as {
          record: CmsAdminRecord;
          generatedPassphrase?: string;
        };
        onRotated(data.record, data.generatedPassphrase);
      })
      .catch((error: Error) => {
        setSaving(false);
        toast.error("Rotation failed", { description: error.message });
      });
  };

  return (
    <Modal onClose={onClose} title={`Rotate ${record.name}'s passphrase`}>
      <div className="mt-6 space-y-5">
        <p className="text-sm leading-6 text-[#68758a] dark:text-white/55">
          The current passphrase stops working immediately and every open session of this account is
          signed out.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              className={`${inputClass} pr-10`}
              disabled={mode === "generate"}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder={mode === "generate" ? "Generated on save" : "At least 8 characters"}
              type={showPassphrase ? "text" : "password"}
              value={mode === "generate" ? "" : passphrase}
            />
            <button
              aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-[#768096] transition hover:bg-[#f1f4fa] hover:text-[#202532] dark:hover:bg-white/10 dark:hover:text-white"
              disabled={mode === "generate"}
              onClick={() => setShowPassphrase((current) => !current)}
              type="button"
            >
              {showPassphrase ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${mode === "generate" ? "bg-brand-blue text-white" : "border border-[#d9dfeb] text-[#5d687d] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"}`}
            onClick={() => {
              setMode(mode === "generate" ? "custom" : "generate");
              setPassphrase("");
            }}
            type="button"
          >
            <ArrowsClockwise size={15} />
            Generate
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button
            className="inline-flex h-11 items-center rounded-xl border border-[#d9dfeb] px-4 text-sm font-semibold text-[#5d687d] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-blue active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSave || saving}
            onClick={submit}
            type="button"
          >
            {saving ? "Rotating..." : "Rotate passphrase"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ShowOnceDialog({
  onClose,
  secret,
}: {
  onClose: () => void;
  secret: { name: string; passphrase: string };
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard
      .writeText(secret.passphrase)
      .then(() => {
        setCopied(true);
        toast.success("Passphrase copied");
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() =>
        toast.error("Copy failed", { description: "Select and copy the passphrase manually." }),
      );
  };

  return (
    <Modal onClose={onClose} title="Passphrase shown once">
      <div className="mt-6 space-y-5">
        <p className="text-sm leading-6 text-[#68758a] dark:text-white/55">
          Share this passphrase with <span className="font-semibold">{secret.name}</span> now. It is
          stored hashed and can never be shown again, but you can rotate it anytime.
        </p>
        <div className="flex items-center gap-2 rounded-xl border border-brand-blue/30 bg-brand-blue/[0.04] p-3">
          <code className="min-w-0 flex-1 overflow-x-auto font-mono text-sm text-brand-blue select-all">
            {secret.passphrase}
          </code>
          <button
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-blue px-3 text-sm font-semibold text-white transition hover:bg-brand-blue/90 active:scale-[0.98]"
            onClick={copy}
            type="button"
          >
            <Copy size={15} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="flex justify-end">
          <button
            className="inline-flex h-11 items-center rounded-xl bg-[#171b25] px-5 text-sm font-semibold text-white shadow-[0_18px_35px_-16px_rgba(20,32,58,0.55)] transition hover:bg-brand-blue active:scale-[0.98]"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
