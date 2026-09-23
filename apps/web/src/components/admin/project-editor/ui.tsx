/** Form primitives shared by the project editor and its detail-page panels. */

export const inputClass =
  "h-10 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";
export const textareaClass =
  "min-h-24 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 py-2.5 text-sm leading-6 text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";
/** Swaps the focus ring to red on a field with a validation error. */
export const invalidClass =
  "border-brand-red/70 focus:border-brand-red focus:ring-brand-red/10 dark:border-brand-red/60";

export const cardClass =
  "rounded-2xl border border-[#dfe4ee] bg-white p-4 shadow-[0_12px_35px_-32px_rgba(20,32,58,0.55)] dark:border-white/10 dark:bg-white/[0.035]";
export const cardLabelClass =
  "font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35";
export const cardHintClass = "mt-1 text-xs leading-5 text-[#8490a5] dark:text-white/40";

const fieldLabelClass =
  "mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase dark:text-white/45";

export function Field({
  aside,
  children,
  error,
  errorId,
  hint,
  htmlFor,
  label,
}: {
  /** Rendered at the right end of the label row (a counter, a status). */
  aside?: React.ReactNode;
  children: React.ReactNode;
  error?: string;
  /** Lets the control point `aria-describedby` at the error message. */
  errorId?: string;
  hint?: React.ReactNode;
  /** Renders the label as a real `<label>` for this control id. */
  htmlFor?: string;
  label: string;
}) {
  const labelNode = htmlFor ? (
    <label className={fieldLabelClass} htmlFor={htmlFor}>
      {label}
    </label>
  ) : (
    <span className={fieldLabelClass}>{label}</span>
  );
  return (
    <div className="min-w-0">
      {aside ? (
        <div className="flex items-baseline justify-between gap-3">
          {labelNode}
          <span className="mb-1.5 shrink-0">{aside}</span>
        </div>
      ) : (
        labelNode
      )}
      {children}
      {error ? (
        <p
          className="mt-1.5 text-[11px] leading-5 font-semibold text-brand-red"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-5 text-[#9ba4b5] dark:text-white/35">{hint}</p>
      ) : null}
    </div>
  );
}

/** A small "n / max" counter; amber past `soft`, red past `max`. */
export function Counter({
  id,
  max,
  soft,
  value,
}: {
  id?: string;
  max: number;
  soft?: number;
  value: number;
}) {
  const tone =
    value > max
      ? "bg-brand-red-50 text-brand-red dark:bg-brand-red/15"
      : soft !== undefined && value > soft
        ? "bg-brand-yellow-50 text-[#a97b1c] dark:bg-brand-yellow/20 dark:text-brand-yellow"
        : "text-[#9ba4b5] dark:text-white/35";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums transition ${tone}`}
      id={id}
    >
      {value} / {max}
    </span>
  );
}
