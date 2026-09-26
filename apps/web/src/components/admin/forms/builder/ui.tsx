"use client";

/**
 * Primitives shared across the form builder: the dialog shell (focus trap,
 * Escape, focus restore), switches, segmented controls, menus, and the
 * inspector's section chrome. Styling follows the rest of /admin.
 */

import { X } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export {
  Counter,
  Field,
  cardClass,
  cardHintClass,
  cardLabelClass,
  inputClass,
  invalidClass,
  textareaClass,
} from "@/components/admin/project-editor/ui";

export const smallInputClass =
  "h-9 w-full rounded-lg border border-[#d9dfeb] bg-white px-2.5 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";

export const eyebrowClass =
  "font-mono text-[10px] font-bold tracking-[0.16em] text-[#7e899d] uppercase dark:text-white/35";

export const primaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white shadow-[0_12px_24px_-16px_rgba(58,109,197,0.9)] transition hover:bg-[#2f5eb0] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#d9dfeb] bg-white px-4 text-sm font-semibold text-[#3c4659] transition hover:border-brand-blue/50 hover:text-brand-blue active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:text-white";

export const ghostButtonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-[#5d687d] transition hover:bg-[#eef1f7] hover:text-[#171b25] disabled:cursor-not-allowed disabled:opacity-40 dark:text-white/55 dark:hover:bg-white/[0.06] dark:hover:text-white";

export const dangerButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-red px-4 text-sm font-semibold text-white transition hover:bg-[#e03535] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const iconButtonClass =
  "grid size-8 shrink-0 place-items-center rounded-lg text-[#667187] transition hover:bg-[#eef1f7] hover:text-[#171b25] focus-visible:ring-4 focus-visible:ring-brand-blue/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-35 dark:text-white/50 dark:hover:bg-white/[0.08] dark:hover:text-white";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Keeps Tab inside `container`, closes on Escape, and restores focus to the opener on unmount. */
export function useFocusTrap(
  container: React.RefObject<HTMLElement | null>,
  onEscape?: () => void,
  active = true,
) {
  const escapeRef = useRef(onEscape);
  useLayoutEffect(() => {
    escapeRef.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = container.current;
    const first =
      node?.querySelector<HTMLElement>("[data-autofocus]") ??
      node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      const root = container.current;
      if (!root) return;
      if (event.key === "Escape" && escapeRef.current) {
        // A nested dialog handles its own Escape first.
        const dialogs = document.querySelectorAll("[data-builder-dialog]");
        if (dialogs[dialogs.length - 1] !== root) return;
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      } else if (!root.contains(document.activeElement)) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [active, container]);
}

/**
 * A modal dialog in a portal: a dimmed backdrop, a centred card (or a
 * bottom sheet on phones), a title bar with a close button, focus trapped.
 */
export function Dialog({
  children,
  description,
  footer,
  onClose,
  size = "md",
  title,
  bare = false,
}: {
  children: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  title: string;
  /** No padding around the body (the content lays out its own). */
  bare?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useFocusTrap(ref, onClose);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  const width = {
    sm: "sm:max-w-md",
    md: "sm:max-w-xl",
    lg: "sm:max-w-3xl",
    xl: "sm:max-w-6xl",
    full: "sm:max-w-[min(96vw,1600px)]",
  }[size];
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        className="builder-fade-in absolute inset-0 bg-[#0b0f18]/45 backdrop-blur-[2px]"
        onMouseDown={onClose}
      />
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`builder-dialog-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[#dfe4ee] bg-[#f8f9fc] shadow-[0_40px_90px_-40px_rgba(10,20,40,0.6)] outline-none sm:rounded-3xl dark:border-white/10 dark:bg-[#131720] ${width} ${size === "full" ? "sm:h-[92dvh]" : ""}`}
        data-builder-dialog=""
        ref={ref}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-[#e3e7f0] px-5 py-4 sm:px-6 dark:border-white/10">
          <div className="min-w-0 flex-1">
            <h2
              className="font-display text-xl font-semibold tracking-[-0.03em] text-[#171b25] dark:text-white"
              id={titleId}
            >
              {title}
            </h2>
            {description ? (
              <p
                className="mt-1 text-sm leading-6 text-[#69748a] dark:text-white/50"
                id={descriptionId}
              >
                {description}
              </p>
            ) : null}
          </div>
          <button aria-label="Close" className={iconButtonClass} onClick={onClose} type="button">
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${bare ? "" : "px-5 py-5 sm:px-6"}`}>
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#e3e7f0] bg-white/60 px-5 py-3.5 sm:px-6 dark:border-white/10 dark:bg-white/[0.02]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** A confirm dialog for destructive actions; resolves through callbacks. */
export function ConfirmDialog({
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  title,
  tone = "danger",
  busy = false,
}: {
  body: React.ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  tone?: "danger" | "primary";
  busy?: boolean;
}) {
  return (
    <Dialog
      footer={
        <>
          <button className={secondaryButtonClass} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className={tone === "danger" ? dangerButtonClass : primaryButtonClass}
            data-autofocus=""
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
      onClose={onCancel}
      size="sm"
      title={title}
    >
      <div className="text-sm leading-6 text-[#4f5a6f] dark:text-white/65">{body}</div>
    </Dialog>
  );
}

/** An accessible on/off switch with its label. */
export function Switch({
  checked,
  description,
  disabled,
  label,
  onChange,
  size = "md",
}: {
  checked: boolean;
  description?: React.ReactNode;
  disabled?: boolean;
  label: React.ReactNode;
  onChange: (checked: boolean) => void;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label
          className={`block cursor-pointer font-semibold text-[#2b3345] dark:text-white/85 ${size === "sm" ? "text-xs" : "text-sm"}`}
          htmlFor={id}
        >
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-[#8490a5] dark:text-white/40">
            {description}
          </p>
        ) : null}
      </div>
      <button
        aria-checked={checked}
        className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition focus-visible:ring-4 focus-visible:ring-brand-blue/25 focus-visible:outline-none disabled:opacity-40 ${checked ? "bg-brand-blue" : "bg-[#d5dbe7] dark:bg-white/15"}`}
        disabled={disabled}
        id={id}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={`inline-block size-[18px] rounded-full bg-white shadow transition-[margin] duration-200 ${checked ? "ml-[19px]" : "ml-[3px]"}`}
        />
      </button>
    </div>
  );
}

/** A small segmented control (radio group) for a few mutually exclusive values. */
export function Segmented<T extends string>({
  label,
  onChange,
  options,
  value,
  size = "md",
  fullWidth = false,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  size?: "sm" | "md";
  fullWidth?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const move = (next: number) => {
    const target = (next + options.length) % options.length;
    onChange(options[target].value);
    refs.current[target]?.focus();
  };
  return (
    <div
      aria-label={label}
      className={`${fullWidth ? "flex w-full" : "inline-flex max-w-full flex-wrap"} gap-0.5 rounded-xl border border-[#dfe4ee] bg-[#f1f4f9] p-0.5 dark:border-white/10 dark:bg-white/[0.04]`}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          move(index + 1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          move(index - 1);
        }
      }}
      role="radiogroup"
    >
      {options.map((option, position) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={`${fullWidth ? "flex-1" : ""} inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[10px] font-semibold transition focus-visible:ring-4 focus-visible:ring-brand-blue/20 focus-visible:outline-none ${size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]"} ${selected ? "bg-white text-[#171b25] shadow-[0_4px_12px_-8px_rgba(20,32,58,0.6)] dark:bg-white/15 dark:text-white" : "text-[#69748a] hover:text-[#171b25] dark:text-white/50 dark:hover:text-white"}`}
            key={option.value}
            onClick={() => onChange(option.value)}
            ref={(element) => {
              refs.current[position] = element;
            }}
            role="radio"
            tabIndex={selected ? 0 : -1}
            title={option.title}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** An inspector section: a small caps title, optional aside, then content. */
export function Section({
  aside,
  children,
  title,
  description,
}: {
  aside?: React.ReactNode;
  children: React.ReactNode;
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <section className="border-t border-[#e6eaf2] px-4 py-4 first:border-t-0 dark:border-white/[0.07]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className={eyebrowClass}>{title}</h3>
        {aside}
      </div>
      {description ? (
        <p className="-mt-1.5 mb-3 text-xs leading-5 text-[#8490a5] dark:text-white/40">
          {description}
        </p>
      ) : null}
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

export type MenuItem =
  | {
      label: string;
      icon?: React.ReactNode;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
    }
  | "separator";

/**
 * A dropdown menu button: arrow keys move, Enter/Space choose, Escape and
 * outside clicks close, focus returns to the button.
 */
export function Menu({
  align = "end",
  buttonClassName = iconButtonClass,
  buttonContent,
  items,
  label,
}: {
  align?: "start" | "end";
  buttonClassName?: string;
  buttonContent: React.ReactNode;
  items: MenuItem[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const close = useCallback((restore = true) => {
    setOpen(false);
    if (restore) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    const first = itemRefs.current.find((item) => item && !item.disabled);
    first?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [close, open]);

  const focusable = () =>
    itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled));

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={buttonClassName}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        ref={buttonRef}
        title={label}
        type="button"
      >
        {buttonContent}
      </button>
      {open ? (
        <div
          aria-label={label}
          className={`builder-pop-in absolute top-[calc(100%+0.35rem)] z-50 min-w-52 rounded-2xl border border-[#dfe4ee] bg-white p-1.5 shadow-[0_24px_55px_-28px_rgba(20,32,58,0.45)] dark:border-white/10 dark:bg-[#1a1f2b] ${align === "end" ? "right-0" : "left-0"}`}
          id={menuId}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            const list = focusable();
            const current = list.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              list[(current + 1) % list.length]?.focus();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              list[(current - 1 + list.length) % list.length]?.focus();
            } else if (event.key === "Home") {
              event.preventDefault();
              list[0]?.focus();
            } else if (event.key === "End") {
              event.preventDefault();
              list[list.length - 1]?.focus();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            } else if (event.key === "Tab") {
              close(false);
            }
          }}
          role="menu"
        >
          {items.map((item, index) =>
            item === "separator" ? (
              <div
                className="my-1 h-px bg-[#e6eaf2] dark:bg-white/10"
                key={`sep-${index}`}
                role="separator"
              />
            ) : (
              <button
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition disabled:opacity-40 ${item.danger ? "text-brand-red hover:bg-brand-red-50 focus:bg-brand-red-50 dark:hover:bg-brand-red/15 dark:focus:bg-brand-red/15" : "text-[#3c4659] hover:bg-[#f2f5fa] focus:bg-[#f2f5fa] dark:text-white/75 dark:hover:bg-white/[0.07] dark:focus:bg-white/[0.07]"} outline-none`}
                disabled={item.disabled}
                key={item.label}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                role="menuitem"
                tabIndex={-1}
                type="button"
              >
                {item.icon ? <span className="shrink-0 opacity-80">{item.icon}</span> : null}
                <span className="flex-1">{item.label}</span>
                {item.hint ? (
                  <span className="font-mono text-[10px] text-[#9ba4b5] dark:text-white/30">
                    {item.hint}
                  </span>
                ) : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A number input that keeps an empty string while typing and reports `undefined` for empty. */
export function NumberInput({
  className = smallInputClass,
  id,
  max,
  min,
  onChange,
  placeholder,
  step,
  value,
  ariaLabel,
}: {
  className?: string;
  id?: string;
  max?: number;
  min?: number;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  step?: number | "any";
  value: number | undefined;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (Number(text) !== value || text === "") setText(value === undefined ? "" : String(value));
  }
  return (
    <input
      aria-label={ariaLabel}
      className={className}
      id={id}
      inputMode="decimal"
      max={max}
      min={min}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (next.trim() === "") {
          onChange(undefined);
          return;
        }
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      placeholder={placeholder}
      step={step}
      type="number"
      value={text}
    />
  );
}

/** Announces a message to screen readers (polite live region). */
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((next: string) => {
    setMessage("");
    window.setTimeout(() => setMessage(next), 30);
  }, []);
  const node = (
    <p aria-live="polite" className="sr-only" role="status">
      {message}
    </p>
  );
  return { announce, node };
}

/** Status badge used by the list and the builder header. */
export function StatusBadge({ status }: { status: "draft" | "published" | "closed" }) {
  const tone = {
    draft:
      "bg-brand-yellow-50 text-[#8a6412] ring-brand-yellow/40 dark:bg-brand-yellow/15 dark:text-brand-yellow",
    published:
      "bg-brand-green-50 text-brand-green ring-brand-green/25 dark:bg-brand-green/15 dark:text-[#5fd3a2]",
    closed:
      "bg-[#eef1f6] text-[#5d687d] ring-[#cfd6e3] dark:bg-white/10 dark:text-white/60 dark:ring-white/15",
  }[status];
  const label = { draft: "Draft", published: "Published", closed: "Closed" }[status];
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 font-mono text-[10px] font-bold tracking-[0.1em] uppercase ring-1 ${tone}`}
    >
      <span
        className={`size-1.5 rounded-full ${status === "published" ? "bg-brand-green" : status === "draft" ? "bg-brand-yellow" : "bg-[#8490a5]"}`}
      />
      {label}
    </span>
  );
}
