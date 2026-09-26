"use client";

import { BracketsCurly } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { FormField } from "@repo/shared";

import { isQuestion } from "@/lib/forms/builder-fields";

import { FieldIcon } from "../field-icons";
import { textareaClass } from "../ui";

/**
 * The question label with answer piping: typing `{{` (or the button) opens
 * a picker of earlier questions and inserts `{{fieldId}}` at the caret.
 */
export function PipingInput({
  earlier,
  id,
  invalid,
  onChange,
  placeholder,
  value,
}: {
  earlier: FormField[];
  id: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const candidates = earlier.filter(isQuestion);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const insert = (fieldId: string) => {
    const element = ref.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    // Replace a just-typed "{{" instead of doubling it.
    const before = value.slice(0, start).replace(/\{\{$/, "");
    const token = `{{${fieldId}}}`;
    const next = `${before}${token}${value.slice(end)}`;
    onChange(next);
    setOpen(false);
    window.requestAnimationFrame(() => {
      element?.focus();
      const caret = before.length + token.length;
      element?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="relative" ref={rootRef}>
      <textarea
        aria-invalid={invalid || undefined}
        className={`${textareaClass} min-h-16 pr-11 [field-sizing:content]`}
        id={id}
        onChange={(event) => {
          onChange(event.target.value);
          const caret = event.target.selectionStart;
          if (candidates.length && event.target.value.slice(caret - 2, caret) === "{{") {
            setActive(0);
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => (current + 1) % candidates.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => (current - 1 + candidates.length) % candidates.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const choice = candidates[active];
            if (choice) insert(choice.id);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        ref={ref}
        rows={2}
        value={value}
      />
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Insert an earlier answer"
        className="absolute top-2 right-2 grid size-7 place-items-center rounded-lg text-[#8490a5] transition hover:bg-brand-blue-50 hover:text-brand-blue disabled:opacity-30"
        disabled={!candidates.length}
        onClick={() => {
          setActive(0);
          setOpen((current) => !current);
        }}
        title={candidates.length ? "Insert an earlier answer ({{)" : "No earlier questions to pipe"}
        type="button"
      >
        <BracketsCurly size={16} weight="bold" />
      </button>
      {open && candidates.length ? (
        <div
          aria-label="Earlier questions"
          className="builder-pop-in absolute top-[calc(100%+0.35rem)] right-0 left-0 z-50 max-h-64 overflow-y-auto rounded-xl border border-[#dfe4ee] bg-white p-1 shadow-[0_24px_55px_-28px_rgba(20,32,58,0.45)] dark:border-white/10 dark:bg-[#1a1f2b]"
          role="listbox"
        >
          <p className="px-2 pt-1 pb-1.5 text-[11px] text-[#8490a5]">
            The answer appears in place of the tag.
          </p>
          {candidates.map((field, index) => (
            <button
              aria-selected={index === active}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${index === active ? "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20" : "text-[#3c4659] hover:bg-[#f2f5fa] dark:text-white/75 dark:hover:bg-white/[0.07]"}`}
              key={field.id}
              onClick={() => {
                insert(field.id);
              }}
              onMouseEnter={() => {
                setActive(index);
              }}
              role="option"
              type="button"
            >
              <FieldIcon className="shrink-0 opacity-70" size={14} type={field.type} />
              <span className="min-w-0 flex-1 truncate">{field.label || "Untitled question"}</span>
              <span className="shrink-0 font-mono text-[10px] opacity-60">{field.id}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
