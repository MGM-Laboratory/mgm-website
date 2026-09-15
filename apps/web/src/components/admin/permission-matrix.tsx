"use client";

import {
  togglePermission,
  type AdminAction,
  type AdminPageId,
  type AdminPermissions,
} from "@/lib/admin-permissions";

/** The editorial pages shown in the matrix; upcoming CMS pages are locked. */
export const MATRIX_PAGES: { id: AdminPageId; label: string; soon: boolean }[] = [
  { id: "articles", label: "Articles", soon: false },
  { id: "publications", label: "Publications", soon: false },
  { id: "members", label: "Members", soon: false },
  { id: "projects", label: "Projects", soon: true },
  { id: "research", label: "Research", soon: false },
  { id: "careers", label: "Careers", soon: false },
  { id: "events", label: "Events", soon: false },
];

const ACTIONS: AdminAction[] = ["read", "write", "delete"];

/**
 * Read/write/delete toggles per editorial page. Toggling an action on also
 * enables every weaker one, toggling it off disables every stronger one, so
 * write always implies read and delete always implies write.
 */
export function PermissionMatrix({
  value,
  onChange,
}: {
  value: AdminPermissions;
  onChange: (next: AdminPermissions) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#d9dfeb] dark:border-white/10">
      <div className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-2 border-b border-[#d9dfeb] bg-[#f5f7fb] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
        <span className="text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase">
          Page
        </span>
        {ACTIONS.map((action) => (
          <span
            className="text-center font-mono text-[10px] font-bold tracking-[0.1em] text-[#687187] uppercase"
            key={action}
          >
            {action}
          </span>
        ))}
      </div>
      {MATRIX_PAGES.map((page) => (
        <div
          className={`grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-2 border-b border-[#d9dfeb] px-3 py-2 last:border-b-0 dark:border-white/10 ${page.soon ? "opacity-55" : ""}`}
          data-page={page.id}
          key={page.id}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[#202532] dark:text-white/85">
            {page.label}
            {page.soon ? (
              <span className="rounded-full bg-[#eef1f7] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-[#8993a7] uppercase dark:bg-white/[0.06] dark:text-white/35">
                Coming soon
              </span>
            ) : null}
          </span>
          {ACTIONS.map((action) => {
            const enabled = (value[page.id] ?? []).includes(action);
            return (
              <button
                aria-pressed={enabled}
                className={`justify-self-center rounded-lg px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.1em] uppercase transition ${
                  page.soon
                    ? "cursor-not-allowed bg-[#f5f7fb] text-[#c3c9d5] dark:bg-white/[0.03] dark:text-white/20"
                    : enabled
                      ? "bg-brand-blue text-white shadow-[0_6px_14px_-8px_rgba(58,109,197,0.9)]"
                      : "bg-[#eef1f7] text-[#768096] hover:bg-[#e2e8f3] dark:bg-white/[0.06] dark:text-white/40 dark:hover:bg-white/10"
                }`}
                data-action={action}
                disabled={page.soon}
                key={action}
                onClick={() => onChange(togglePermission(value, page.id, action))}
                type="button"
              >
                {enabled ? "On" : "Off"}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
