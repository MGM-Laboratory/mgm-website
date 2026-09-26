"use client";

import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, X } from "lucide-react";

/**
 * A searchable, accessible combobox (the ARIA 1.2 pattern: the input is the
 * combobox, the options a listbox, the active one named by
 * aria-activedescendant). Single choice falls back to the native select on
 * touch screens, where the system picker is the better control. Multiple
 * choice shows the picks as removable tags.
 */

export type ComboOption = { id: string; label: string; hint?: string };

const coarseQuery = "(pointer: coarse) and (max-width: 820px)";
function subscribeCoarse(callback: () => void) {
  const query = window.matchMedia(coarseQuery);
  query.addEventListener("change", callback);
  return () => {
    query.removeEventListener("change", callback);
  };
}
function useCoarse() {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(coarseQuery).matches,
    () => false,
  );
}

type Common = {
  inputId: string;
  options: ComboOption[];
  placeholder: string;
  noMatches: string;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
  removeLabel?: (label: string) => string;
  filter?: (option: ComboOption, query: string) => boolean;
  /** Keep the native select off (a very long list reads better searchable). */
  alwaysCustom?: boolean;
};

type Props =
  | (Common & {
      multiple?: false;
      value: string | undefined;
      onChange: (value: string | undefined) => void;
      maxSelections?: never;
    })
  | (Common & {
      multiple: true;
      value: string[] | undefined;
      onChange: (value: string[] | undefined) => void;
      maxSelections?: number;
    });

function defaultFilter(option: ComboOption, query: string) {
  return option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function Combobox(props: Props) {
  const {
    inputId,
    options,
    placeholder,
    noMatches,
    describedBy,
    invalid,
    required,
    filter = defaultFilter,
  } = props;
  const coarse = useCoarse();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => (props.multiple ? (props.value ?? []) : props.value ? [props.value] : []),
    [props.multiple, props.value],
  );
  const matches = useMemo(
    () => (query.trim() ? options.filter((option) => filter(option, query)) : options),
    [filter, options, query],
  );
  const labelOf = (id: string) => options.find((option) => option.id === id)?.label ?? id;
  const full =
    props.multiple && props.maxSelections !== undefined && selected.length >= props.maxSelections;

  if (!props.multiple && coarse && !props.alwaysCustom) {
    return (
      <div className="fx-input fx-select-native fx-select-full">
        <select
          id={inputId}
          value={props.value ?? ""}
          onChange={(event) => {
            props.onChange(event.target.value || undefined);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden strokeWidth={2.25} size={18} className="fx-select-chevron" />
      </div>
    );
  }

  const choose = (option: ComboOption | undefined) => {
    if (!option) return;
    if (props.multiple) {
      const has = selected.includes(option.id);
      if (!has && full) return;
      const next = has ? selected.filter((id) => id !== option.id) : [...selected, option.id];
      props.onChange(next.length ? next : undefined);
      setQuery("");
    } else {
      props.onChange(option.id);
      setQuery("");
      setOpen(false);
    }
  };

  const scrollActive = (index: number) => {
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (!open) setOpen(true);
        const next = Math.min(matches.length - 1, open ? active + 1 : 0);
        setActive(next);
        scrollActive(next);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const next = Math.max(0, active - 1);
        setActive(next);
        scrollActive(next);
        break;
      }
      case "Home":
        if (open) {
          event.preventDefault();
          setActive(0);
          scrollActive(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActive(matches.length - 1);
          scrollActive(matches.length - 1);
        }
        break;
      case "Enter":
        if (open && matches[active]) {
          event.preventDefault();
          event.stopPropagation();
          choose(matches[active]);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setQuery("");
        }
        break;
      case "Backspace":
        if (props.multiple && !query && selected.length) {
          props.onChange(selected.slice(0, -1).length ? selected.slice(0, -1) : undefined);
        }
        break;
      default:
        break;
    }
  };

  const shownValue = open || props.multiple ? query : props.value ? labelOf(props.value) : "";
  const activeId = open && matches[active] ? `${listId}-${matches[active].id}` : undefined;

  return (
    <div
      className="fx-combo"
      data-open={open ? "" : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      {props.multiple && selected.length ? (
        <ul className="fx-tags" aria-label={placeholder}>
          {selected.map((id) => (
            <li key={id} className="fx-tag">
              <span>{labelOf(id)}</span>
              <button
                type="button"
                aria-label={props.removeLabel?.(labelOf(id)) ?? `Remove ${labelOf(id)}`}
                onClick={() => {
                  const next = selected.filter((item) => item !== id);
                  props.onChange(next.length ? next : undefined);
                  inputRef.current?.focus();
                }}
              >
                <X aria-hidden strokeWidth={2.25} size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="fx-input fx-combo-field">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={props.multiple || !props.value ? placeholder : labelOf(props.value)}
          value={shownValue}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onClick={() => {
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          className="fx-combo-toggle"
          aria-hidden
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            setOpen((value) => !value);
            inputRef.current?.focus();
          }}
        >
          <ChevronDown strokeWidth={2.25} size={18} />
        </button>
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-multiselectable={props.multiple || undefined}
        className="fx-listbox"
        hidden={!open}
      >
        {!open ? null : matches.length ? (
          matches.map((option, index) => {
            const isSelected = selected.includes(option.id);
            const disabled = !isSelected && full;
            return (
              <li
                key={option.id}
                id={`${listId}-${option.id}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={disabled || undefined}
                data-active={index === active ? "" : undefined}
                data-index={index}
                className="fx-option"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onMouseMove={() => {
                  setActive(index);
                }}
                onClick={() => {
                  choose(option);
                }}
              >
                <span className="fx-option-check" aria-hidden>
                  {isSelected ? <Check strokeWidth={2.25} size={16} /> : null}
                </span>
                <span className="fx-option-label">{option.label}</span>
                {option.hint ? <span className="fx-option-hint">{option.hint}</span> : null}
              </li>
            );
          })
        ) : (
          <li className="fx-option fx-option-empty" role="presentation">
            {noMatches}
          </li>
        )}
      </ul>
    </div>
  );
}
