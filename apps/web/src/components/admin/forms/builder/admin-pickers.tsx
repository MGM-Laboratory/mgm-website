"use client";

import { useId } from "react";

import { DatePicker } from "@/components/forms/controls/date-picker";
import { DateTimePicker } from "@/components/forms/controls/datetime-picker";

/**
 * The public form's date pickers in the admin's skin (brand blue, the
 * #d9dfeb borders, the admin's dark surfaces). They keep the native value
 * shapes (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm` local), so every caller stores
 * what it stored before. A typed value that can't be read stays out of the
 * value with a message under the field.
 */

const boxClass =
  "h-9 w-full rounded-lg border border-[#d9dfeb] bg-white pl-2.5 text-sm text-[#171b25] transition dark:border-white/10 dark:bg-white/[0.045] dark:text-white";
const invalidBoxClass = "border-brand-red dark:border-brand-red";

type AdminPickerProps = {
  kind: "date" | "datetime";
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  id?: string;
  ariaLabel?: string;
  min?: string;
  max?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  /** Classes for the outer box (its width); full width by default. */
  className?: string;
};

export function AdminDatePicker({
  kind,
  value,
  onChange,
  id,
  ariaLabel,
  min,
  max,
  invalid,
  describedBy,
  disabled,
  className,
}: AdminPickerProps) {
  const fallbackId = useId();
  const props = {
    inputId: id ?? fallbackId,
    value: value || undefined,
    onChange,
    language: "en" as const,
    min,
    max,
    invalid,
    describedBy,
    disabled,
    ariaLabel,
    skin: "admin" as const,
    invalidText: "message" as const,
    showHint: false,
    className: invalid ? `${boxClass} ${invalidBoxClass}` : boxClass,
  };
  return (
    <div className={className ?? "w-full min-w-0"}>
      {kind === "date" ? <DatePicker {...props} /> : <DateTimePicker {...props} />}
    </div>
  );
}
