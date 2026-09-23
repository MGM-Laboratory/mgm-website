"use client";

import { X } from "@phosphor-icons/react";
import { useState } from "react";

import { PROJECT_DETAIL_LIMITS } from "@/lib/project-cms";

const { servicesMax, serviceMax } = PROJECT_DETAIL_LIMITS;

/**
 * A chip input for the detail page's services list: Enter or a comma adds
 * the typed service (a pasted "A, B, C" adds all three), Backspace in an
 * empty input removes the last chip, and duplicates are refused regardless
 * of case.
 */
export function ServicesInput({
  describedBy,
  id,
  invalid,
  onChange,
  values,
}: {
  describedBy?: string;
  id: string;
  invalid?: boolean;
  onChange: (values: string[]) => void;
  values: string[];
}) {
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string>();
  const full = values.length >= servicesMax;
  const pending = text.split(",").at(-1)?.trim() ?? "";
  const tooLong = pending.length > serviceMax;

  /** Adds each comma-separated part; returns the parts it could not add. */
  const add = (raw: string) => {
    const next = [...values];
    let message: string | undefined;
    for (const part of raw.split(",")) {
      const value = part.replace(/\s+/g, " ").trim();
      if (!value) continue;
      if (value.length > serviceMax) {
        message = `Keep each service to ${serviceMax} characters.`;
        continue;
      }
      if (next.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) {
        message = `“${value}” is already listed.`;
        continue;
      }
      if (next.length >= servicesMax) {
        message = `Up to ${servicesMax} services.`;
        break;
      }
      next.push(value);
    }
    if (next.length !== values.length) onChange(next);
    setNotice(message);
  };

  const commit = () => {
    if (!text.trim() || tooLong) return;
    add(text);
    setText("");
  };

  const remove = (index: number) => {
    onChange(values.filter((_value, itemIndex) => itemIndex !== index));
    setNotice(undefined);
  };

  const noticeId = `${id}-notice`;
  const message = tooLong ? `Keep each service to ${serviceMax} characters.` : notice;

  return (
    <div>
      <div
        className={`flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-xl border bg-white px-1.5 py-1.5 transition focus-within:ring-4 dark:bg-white/[0.045] ${
          invalid || tooLong
            ? "border-brand-red/70 focus-within:border-brand-red focus-within:ring-brand-red/10"
            : "border-[#d9dfeb] focus-within:border-brand-blue focus-within:ring-brand-blue/10 dark:border-white/10"
        }`}
      >
        {values.map((service, index) => (
          <span
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-blue-50 py-1 pr-1.5 pl-2.5 text-xs font-semibold text-brand-blue dark:bg-brand-blue/20"
            key={service}
          >
            <span className="truncate">{service}</span>
            <button
              aria-label={`Remove ${service}`}
              className="grid size-4 shrink-0 place-items-center rounded-full transition hover:bg-brand-blue/15 hover:text-brand-red"
              onClick={() => remove(index)}
              type="button"
            >
              <X size={10} weight="bold" />
            </button>
          </span>
        ))}
        <input
          aria-describedby={
            [describedBy, message ? noticeId : undefined].filter(Boolean).join(" ") || undefined
          }
          aria-invalid={invalid || tooLong || undefined}
          className="h-7 min-w-[9rem] flex-1 bg-transparent px-1.5 text-sm text-[#171b25] outline-none placeholder:text-[#9ba4b5] disabled:cursor-not-allowed dark:text-white dark:placeholder:text-white/25"
          disabled={full}
          id={id}
          onBlur={commit}
          onChange={(event) => {
            const value = event.target.value;
            // A typed or pasted comma commits everything before it.
            const lastComma = value.lastIndexOf(",");
            if (lastComma === -1) {
              setText(value);
              return;
            }
            add(value.slice(0, lastComma));
            setText(value.slice(lastComma + 1).trimStart());
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Backspace" && !text && values.length) {
              event.preventDefault();
              remove(values.length - 1);
            }
          }}
          placeholder={
            full
              ? `All ${servicesMax} services added`
              : values.length
                ? "Add another service"
                : "Type a service, then Enter"
          }
          value={text}
        />
      </div>
      {message ? (
        <p
          aria-live="polite"
          className={`mt-1.5 text-[11px] leading-5 font-semibold ${tooLong ? "text-brand-red" : "text-[#a97b1c] dark:text-brand-yellow"}`}
          id={noticeId}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
