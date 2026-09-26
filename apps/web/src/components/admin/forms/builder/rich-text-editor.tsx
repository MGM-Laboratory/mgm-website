"use client";

/**
 * The form builder's rich text editor (tiptap). It writes the whitelisted
 * tiptap JSON of `@repo/shared` rich-text: every toolbar action produces a
 * node or mark `sanitizeRichText` keeps, and colours are palette tokens
 * stored as `var(--rt-<token>)`, which `.builder-rich-text` defines for
 * light and dark mode.
 */

import {
  ArrowArcLeft,
  ArrowArcRight,
  Code,
  Eraser,
  Highlighter,
  LinkSimple,
  LinkBreak,
  ListBullets,
  ListNumbers,
  Minus,
  Quotes,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  TextAa,
} from "@phosphor-icons/react";
import {
  RICH_TEXT_COLORS,
  richTextColorToken,
  richTextColorValue,
  sanitizeRichText,
  type RichTextColor,
  type RichTextDoc,
} from "@repo/shared";
import { Highlight } from "@tiptap/extension-highlight";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useId, useRef, useState } from "react";

import { smallInputClass } from "./ui";

export type RichTextEditorProps = {
  value: RichTextDoc | undefined;
  onChange: (value: RichTextDoc | undefined) => void;
  /** The accessible name of the editable area. */
  label: string;
  placeholder?: string;
  /** "full": all tools; "compact": no headings, alignment or divider (short descriptions). */
  variant?: "full" | "compact";
  /** Minimum height of the writing area in px (default 96). */
  minHeight?: number;
  id?: string;
  invalid?: boolean;
};

/** Site paths (one leading slash), http(s), mailto: and tel:, the same rule the sanitizer keeps. */
const SAFE_HREF = /^(\/(?!\/)|https?:\/\/|mailto:|tel:)/i;

export function isSafeHref(value: string) {
  return SAFE_HREF.test(value.trim());
}

/** Adds https:// to a bare domain, keeps everything else as typed. */
function normalizeHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("/")) return trimmed;
  return `https://${trimmed}`;
}

const COLOR_NAMES: Record<RichTextColor, string> = {
  blue: "Blue",
  red: "Red",
  green: "Green",
  yellow: "Yellow",
  ink: "Ink",
  muted: "Muted",
};

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);
const mod = (keys: string) => (isMac() ? keys.replace("Mod", "⌘") : keys.replace("Mod", "Ctrl"));

function sameDoc(left: RichTextDoc | undefined, right: RichTextDoc | undefined) {
  if (left === right) return true;
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

const buttonBase =
  "grid size-8 shrink-0 place-items-center rounded-lg transition focus-visible:ring-4 focus-visible:ring-brand-blue/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 max-sm:size-10";

function ToolButton({
  active = false,
  children,
  disabled,
  label,
  onClick,
  shortcut,
  pressable = true,
  expanded,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  shortcut?: string;
  /** Toggle buttons report `aria-pressed`; plain actions (undo) don't. */
  pressable?: boolean;
  expanded?: boolean;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-label={label}
      aria-pressed={pressable ? active : undefined}
      className={`${buttonBase} ${active ? "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20 dark:text-[#9dbcf3]" : "text-[#5d687d] hover:bg-[#eef1f7] hover:text-[#171b25] dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white"}`}
      data-toolbar-item=""
      disabled={disabled}
      onClick={onClick}
      // Keep the editor's selection when a toolbar button is pressed.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      tabIndex={-1}
      title={shortcut ? `${label} (${mod(shortcut)})` : label}
      type="button"
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-[#e1e6ef] dark:bg-white/10" />
  );
}

/** A small popover anchored under a toolbar button; closes on Escape and outside clicks. */
function Popover({
  children,
  onClose,
  label,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !ref.current?.parentElement?.contains(event.target)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    ref.current?.addEventListener("keydown", onKey);
    const node = ref.current;
    (node?.querySelector<HTMLElement>("input, button") ?? node)?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      node?.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      aria-label={label}
      className="builder-pop-in absolute top-[calc(100%+0.35rem)] left-0 z-50 w-max max-w-[min(20rem,calc(100vw-3rem))] rounded-2xl border border-[#dfe4ee] bg-white p-2.5 shadow-[0_24px_55px_-28px_rgba(20,32,58,0.45)] dark:border-white/10 dark:bg-[#1a1f2b]"
      ref={ref}
      role="dialog"
    >
      {children}
    </div>
  );
}

function ColorPopover({
  current,
  kind,
  onChoose,
  onClose,
}: {
  current: RichTextColor | null;
  kind: "highlight" | "text";
  onChoose: (token: RichTextColor | null) => void;
  onClose: () => void;
}) {
  return (
    <Popover label={kind === "highlight" ? "Highlight colour" : "Text colour"} onClose={onClose}>
      <p className="px-0.5 pb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35">
        {kind === "highlight" ? "Highlight" : "Text colour"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          aria-label={kind === "highlight" ? "No highlight" : "Default colour"}
          aria-pressed={current === null}
          className={`grid size-8 place-items-center rounded-lg border text-[11px] font-bold transition max-sm:size-10 ${current === null ? "border-brand-blue ring-2 ring-brand-blue/30" : "border-[#dfe4ee] hover:border-brand-blue/50 dark:border-white/15"} text-[#5d687d] dark:text-white/60`}
          onClick={() => {
            onChoose(null);
          }}
          title={kind === "highlight" ? "No highlight" : "Default"}
          type="button"
        >
          <span aria-hidden="true" className="relative block size-4">
            <span className="absolute top-1/2 left-[-2px] h-0.5 w-5 -rotate-45 bg-brand-red" />
          </span>
        </button>
        {RICH_TEXT_COLORS.map((token) => (
          <button
            aria-label={COLOR_NAMES[token]}
            aria-pressed={current === token}
            className={`grid size-8 place-items-center rounded-lg border transition max-sm:size-10 ${current === token ? "border-brand-blue ring-2 ring-brand-blue/30" : "border-[#dfe4ee] hover:border-brand-blue/50 dark:border-white/15"}`}
            key={token}
            onClick={() => {
              onChoose(token);
            }}
            title={COLOR_NAMES[token]}
            type="button"
          >
            {kind === "highlight" ? (
              <span
                aria-hidden="true"
                className="block size-5 rounded-md"
                style={{ background: `color-mix(in srgb, var(--rt-${token}) 45%, transparent)` }}
              />
            ) : (
              <span
                aria-hidden="true"
                className="font-display text-sm font-bold"
                style={{ color: `var(--rt-${token})` }}
              >
                A
              </span>
            )}
          </button>
        ))}
      </div>
    </Popover>
  );
}

function LinkPopover({
  initial,
  onApply,
  onClose,
  onRemove,
}: {
  initial: string;
  onApply: (href: string) => void;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const errorId = useId();
  const href = normalizeHref(value);
  const valid = Boolean(href) && isSafeHref(href);
  const submit = () => {
    setTouched(true);
    if (valid) onApply(href);
  };
  return (
    <Popover label="Link" onClose={onClose}>
      <label
        className="block px-0.5 pb-1.5 font-mono text-[10px] font-bold tracking-[0.14em] text-[#7e899d] uppercase dark:text-white/35"
        htmlFor={inputId}
      >
        Link address
      </label>
      <div className="flex w-[min(18rem,calc(100vw-4rem))] gap-1.5">
        <input
          aria-describedby={touched && !valid ? errorId : undefined}
          aria-invalid={touched && !valid}
          className={smallInputClass}
          id={inputId}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="https://… , /page, mailto:"
          value={value}
        />
        <button
          className="h-9 shrink-0 rounded-lg bg-brand-blue px-3 text-xs font-semibold text-white transition hover:bg-[#2f5eb0]"
          onClick={submit}
          type="button"
        >
          Apply
        </button>
      </div>
      {touched && !valid ? (
        <p className="mt-1.5 text-[11px] font-semibold text-brand-red" id={errorId} role="alert">
          Use an https:// link, a site path like /events, mailto: or tel:.
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-[#8490a5] dark:text-white/40">
          Web links, site paths, email (mailto:) and phone (tel:).
        </p>
      )}
      {onRemove ? (
        <button
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-brand-red transition hover:bg-brand-red-50 dark:hover:bg-brand-red/15"
          onClick={onRemove}
          type="button"
        >
          <LinkBreak size={14} />
          Remove link
        </button>
      ) : null}
    </Popover>
  );
}

type Snapshot = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  h1: boolean;
  h2: boolean;
  h3: boolean;
  bullet: boolean;
  ordered: boolean;
  quote: boolean;
  link: boolean;
  href: string;
  align: string;
  highlight: RichTextColor | null;
  color: RichTextColor | null;
  canUndo: boolean;
  canRedo: boolean;
};

function Toolbar({
  editor,
  variant,
  onOpenLink,
  linkOpen,
  setLinkOpen,
}: {
  editor: Editor;
  variant: "full" | "compact";
  onOpenLink: () => void;
  linkOpen: boolean;
  setLinkOpen: (open: boolean) => void;
}) {
  const [colorOpen, setColorOpen] = useState<"highlight" | "text" | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }): Snapshot => {
      const align = ["center", "right", "justify"].find((value) =>
        current.isActive({ textAlign: value }),
      );
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        strike: current.isActive("strike"),
        code: current.isActive("code"),
        h1: current.isActive("heading", { level: 1 }),
        h2: current.isActive("heading", { level: 2 }),
        h3: current.isActive("heading", { level: 3 }),
        bullet: current.isActive("bulletList"),
        ordered: current.isActive("orderedList"),
        quote: current.isActive("blockquote"),
        link: current.isActive("link"),
        href: String(current.getAttributes("link").href ?? ""),
        align: align ?? "left",
        highlight: richTextColorToken(current.getAttributes("highlight").color),
        color: richTextColorToken(current.getAttributes("textStyle").color),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  const chain = () => editor.chain().focus();

  // Roving focus: arrow keys move between toolbar buttons, Tab leaves.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute("data-toolbar-item")) {
      return;
    }
    const items = [
      ...(toolbarRef.current?.querySelectorAll<HTMLButtonElement>("[data-toolbar-item]") ?? []),
    ].filter((item) => !item.disabled);
    const index = items.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    event.preventDefault();
    items[next]?.focus();
  };

  // The first enabled button is the toolbar's single tab stop.
  useEffect(() => {
    const items = toolbarRef.current?.querySelectorAll<HTMLButtonElement>("[data-toolbar-item]");
    if (!items?.length) return;
    const hasStop = [...items].some((item) => item.tabIndex === 0);
    if (!hasStop) items[0].tabIndex = 0;
  });

  if (!state) return null;
  const full = variant === "full";

  return (
    <div
      aria-label="Formatting"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-[#e3e7f0] bg-[#f8f9fc]/95 px-1.5 py-1 backdrop-blur dark:border-white/10 dark:bg-[#161b25]/95"
      onFocus={(event) => {
        // Whichever button got focus becomes the tab stop.
        if (event.target instanceof HTMLElement && event.target.hasAttribute("data-toolbar-item")) {
          toolbarRef.current
            ?.querySelectorAll<HTMLElement>("[data-toolbar-item]")
            .forEach((item) => (item.tabIndex = item === event.target ? 0 : -1));
        }
      }}
      onKeyDown={onKeyDown}
      ref={toolbarRef}
      role="toolbar"
    >
      <ToolButton
        active={state.bold}
        label="Bold"
        onClick={() => chain().toggleBold().run()}
        shortcut="Mod+B"
      >
        <TextB size={16} weight="bold" />
      </ToolButton>
      <ToolButton
        active={state.italic}
        label="Italic"
        onClick={() => chain().toggleItalic().run()}
        shortcut="Mod+I"
      >
        <TextItalic size={16} weight="bold" />
      </ToolButton>
      <ToolButton
        active={state.underline}
        label="Underline"
        onClick={() => chain().toggleUnderline().run()}
        shortcut="Mod+U"
      >
        <TextUnderline size={16} weight="bold" />
      </ToolButton>
      <ToolButton
        active={state.strike}
        label="Strikethrough"
        onClick={() => chain().toggleStrike().run()}
        shortcut="Mod+Shift+S"
      >
        <TextStrikethrough size={16} weight="bold" />
      </ToolButton>
      <ToolButton
        active={state.code}
        label="Inline code"
        onClick={() => chain().toggleCode().run()}
        shortcut="Mod+E"
      >
        <Code size={16} weight="bold" />
      </ToolButton>
      <Divider />
      {full ? (
        <>
          <ToolButton
            active={state.h1}
            label="Heading 1"
            onClick={() => chain().toggleHeading({ level: 1 }).run()}
            shortcut="Mod+Alt+1"
          >
            <TextHOne size={16} weight="bold" />
          </ToolButton>
          <ToolButton
            active={state.h2}
            label="Heading 2"
            onClick={() => chain().toggleHeading({ level: 2 }).run()}
            shortcut="Mod+Alt+2"
          >
            <TextHTwo size={16} weight="bold" />
          </ToolButton>
          <ToolButton
            active={state.h3}
            label="Heading 3"
            onClick={() => chain().toggleHeading({ level: 3 }).run()}
            shortcut="Mod+Alt+3"
          >
            <TextHThree size={16} weight="bold" />
          </ToolButton>
          <Divider />
        </>
      ) : null}
      <ToolButton
        active={state.bullet}
        label="Bulleted list"
        onClick={() => chain().toggleBulletList().run()}
        shortcut="Mod+Shift+8"
      >
        <ListBullets size={16} weight="bold" />
      </ToolButton>
      <ToolButton
        active={state.ordered}
        label="Numbered list"
        onClick={() => chain().toggleOrderedList().run()}
        shortcut="Mod+Shift+7"
      >
        <ListNumbers size={16} weight="bold" />
      </ToolButton>
      <ToolButton
        active={state.quote}
        label="Quote"
        onClick={() => chain().toggleBlockquote().run()}
        shortcut="Mod+Shift+B"
      >
        <Quotes size={16} weight="bold" />
      </ToolButton>
      {full ? (
        <>
          <ToolButton
            label="Divider"
            onClick={() => chain().setHorizontalRule().run()}
            pressable={false}
          >
            <Minus size={16} weight="bold" />
          </ToolButton>
          <Divider />
          <ToolButton
            active={state.align === "left"}
            label="Align left"
            onClick={() => chain().unsetTextAlign().run()}
            shortcut="Mod+Shift+L"
          >
            <TextAlignLeft size={16} weight="bold" />
          </ToolButton>
          <ToolButton
            active={state.align === "center"}
            label="Align centre"
            onClick={() => chain().setTextAlign("center").run()}
            shortcut="Mod+Shift+E"
          >
            <TextAlignCenter size={16} weight="bold" />
          </ToolButton>
          <ToolButton
            active={state.align === "right"}
            label="Align right"
            onClick={() => chain().setTextAlign("right").run()}
            shortcut="Mod+Shift+R"
          >
            <TextAlignRight size={16} weight="bold" />
          </ToolButton>
          <ToolButton
            active={state.align === "justify"}
            label="Justify"
            onClick={() => chain().setTextAlign("justify").run()}
            shortcut="Mod+Shift+J"
          >
            <TextAlignJustify size={16} weight="bold" />
          </ToolButton>
        </>
      ) : null}
      <Divider />
      <div className="relative">
        <ToolButton
          active={state.link}
          expanded={linkOpen}
          label={state.link ? "Edit link" : "Add link"}
          onClick={() => {
            if (linkOpen) setLinkOpen(false);
            else onOpenLink();
          }}
          shortcut="Mod+K"
        >
          <LinkSimple size={16} weight="bold" />
        </ToolButton>
        {linkOpen ? (
          <LinkPopover
            initial={state.href}
            onApply={(href) => {
              setLinkOpen(false);
              const { empty } = editor.state.selection;
              if (empty && !state.link) {
                // No selection: insert the address itself as linked text.
                chain()
                  .insertContent({
                    type: "text",
                    text: href,
                    marks: [{ type: "link", attrs: { href } }],
                  })
                  .run();
                return;
              }
              chain().extendMarkRange("link").setLink({ href }).run();
            }}
            onClose={() => {
              setLinkOpen(false);
              editor.commands.focus();
            }}
            onRemove={
              state.link
                ? () => {
                    setLinkOpen(false);
                    chain().extendMarkRange("link").unsetLink().run();
                  }
                : undefined
            }
          />
        ) : null}
      </div>
      <div className="relative">
        <ToolButton
          active={state.highlight !== null}
          expanded={colorOpen === "highlight"}
          label="Highlight"
          onClick={() => {
            setColorOpen((open) => (open === "highlight" ? null : "highlight"));
          }}
        >
          <Highlighter size={16} weight="bold" />
        </ToolButton>
        {colorOpen === "highlight" ? (
          <ColorPopover
            current={state.highlight}
            kind="highlight"
            onChoose={(token) => {
              setColorOpen(null);
              if (token)
                chain()
                  .setHighlight({ color: richTextColorValue(token) })
                  .run();
              else chain().unsetHighlight().run();
              // The popover took focus; hand it back once it has unmounted.
              window.requestAnimationFrame(() => editor.commands.focus());
            }}
            onClose={() => {
              setColorOpen(null);
            }}
          />
        ) : null}
      </div>
      <div className="relative">
        <ToolButton
          active={state.color !== null}
          expanded={colorOpen === "text"}
          label="Text colour"
          onClick={() => {
            setColorOpen((open) => (open === "text" ? null : "text"));
          }}
        >
          <span className="relative grid place-items-center">
            <TextAa size={16} weight="bold" />
            <span
              aria-hidden="true"
              className="absolute -bottom-1 h-[3px] w-4 rounded-full"
              style={{ background: state.color ? `var(--rt-${state.color})` : "currentColor" }}
            />
          </span>
        </ToolButton>
        {colorOpen === "text" ? (
          <ColorPopover
            current={state.color}
            kind="text"
            onChoose={(token) => {
              setColorOpen(null);
              if (token) chain().setColor(richTextColorValue(token)).run();
              else chain().unsetColor().run();
              window.requestAnimationFrame(() => editor.commands.focus());
            }}
            onClose={() => {
              setColorOpen(null);
            }}
          />
        ) : null}
      </div>
      <ToolButton
        label="Clear formatting"
        onClick={() => chain().unsetAllMarks().clearNodes().unsetTextAlign().run()}
        pressable={false}
      >
        <Eraser size={16} weight="bold" />
      </ToolButton>
      <span className="ml-auto flex items-center gap-0.5">
        <ToolButton
          disabled={!state.canUndo}
          label="Undo"
          onClick={() => chain().undo().run()}
          pressable={false}
          shortcut="Mod+Z"
        >
          <ArrowArcLeft size={16} weight="bold" />
        </ToolButton>
        <ToolButton
          disabled={!state.canRedo}
          label="Redo"
          onClick={() => chain().redo().run()}
          pressable={false}
          shortcut="Mod+Shift+Z"
        >
          <ArrowArcRight size={16} weight="bold" />
        </ToolButton>
      </span>
    </div>
  );
}

const proseClass = [
  "[&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2.5 [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-6 [&_.ProseMirror]:text-[#171b25] [&_.ProseMirror]:outline-none dark:[&_.ProseMirror]:text-white/90",
  "[&_.ProseMirror>*+*]:mt-2",
  "[&_.ProseMirror_h1]:font-display [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:leading-tight [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:tracking-[-0.03em]",
  "[&_.ProseMirror_h2]:font-display [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:leading-tight [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:tracking-[-0.03em]",
  "[&_.ProseMirror_h3]:font-display [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold",
  "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_li>p]:my-0.5 [&_.ProseMirror_li]:marker:text-[#8490a5]",
  "[&_.ProseMirror_blockquote]:border-l-[3px] [&_.ProseMirror_blockquote]:border-brand-blue/50 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-[#4f5a6f] dark:[&_.ProseMirror_blockquote]:text-white/65",
  "[&_.ProseMirror_hr]:my-3 [&_.ProseMirror_hr]:border-[#dfe4ee] dark:[&_.ProseMirror_hr]:border-white/15 [&_.ProseMirror_hr.ProseMirror-selectednode]:border-brand-blue",
  "[&_.ProseMirror_code]:rounded-md [&_.ProseMirror_code]:bg-[#eef1f7] [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-[0.85em] dark:[&_.ProseMirror_code]:bg-white/10",
  "[&_.ProseMirror_a]:text-brand-blue [&_.ProseMirror_a]:underline [&_.ProseMirror_a]:underline-offset-2 dark:[&_.ProseMirror_a]:text-[#9dbcf3]",
  "[&_.ProseMirror_p.is-editor-empty:first-child]:before:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child]:before:float-left [&_.ProseMirror_p.is-editor-empty:first-child]:before:h-0 [&_.ProseMirror_p.is-editor-empty:first-child]:before:text-[#9ba4b5] [&_.ProseMirror_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] dark:[&_.ProseMirror_p.is-editor-empty:first-child]:before:text-white/25",
].join(" ");

export function RichTextEditor({
  id,
  invalid = false,
  label,
  minHeight = 96,
  onChange,
  placeholder = "Write something…",
  value,
  variant = "full",
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  /** The last document this editor reported (or was given), to tell outside changes apart. */
  const lastValue = useRef<RichTextDoc | undefined>(value);
  const [linkOpen, setLinkOpen] = useState(false);
  const openLinkRef = useRef<() => void>(() => undefined);

  const editor = useEditor({
    immediatelyRender: false,
    content: value ?? "",
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["mailto", "tel"],
          isAllowedUri: (url) => isSafeHref(url),
          shouldAutoLink: (url) => isSafeHref(normalizeHref(url)),
        },
      }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
        ...(id ? { id } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
        style: `min-height:${minHeight}px`,
      },
      handleKeyDown: (_view, event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          openLinkRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = sanitizeRichText(current.getJSON());
      lastValue.current = next;
      onChangeRef.current(next);
    },
  });

  useEffect(() => {
    openLinkRef.current = () => {
      setLinkOpen(true);
    };
  }, []);

  // Keep the editable's attributes current (label, invalid state).
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          "aria-label": label,
          "aria-multiline": "true",
          role: "textbox",
          ...(id ? { id } : {}),
          ...(invalid ? { "aria-invalid": "true" } : {}),
          style: `min-height:${minHeight}px`,
        },
      },
    });
  }, [editor, id, invalid, label, minHeight]);

  // A value changed from outside (undo/redo, a template, a reset): load it without echoing it back.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (sameDoc(value, lastValue.current)) return;
    lastValue.current = value;
    const { from, to } = editor.state.selection;
    editor.commands.setContent(value ?? "", { emitUpdate: false });
    if (editor.isFocused) {
      const size = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) });
    }
  }, [editor, value]);

  return (
    <div
      className={`builder-rich-text relative overflow-visible rounded-xl border bg-white transition focus-within:ring-4 dark:bg-white/[0.045] ${invalid ? "border-brand-red/70 focus-within:border-brand-red focus-within:ring-brand-red/10 dark:border-brand-red/60" : "border-[#d9dfeb] focus-within:border-brand-blue focus-within:ring-brand-blue/10 dark:border-white/10"}`}
    >
      {editor ? (
        <Toolbar
          editor={editor}
          linkOpen={linkOpen}
          onOpenLink={() => {
            setLinkOpen(true);
          }}
          setLinkOpen={setLinkOpen}
          variant={variant}
        />
      ) : (
        <div className="h-[41px] border-b border-[#e3e7f0] dark:border-white/10" />
      )}
      {editor ? (
        <EditorContent className={proseClass} editor={editor} />
      ) : (
        <div className="px-3 py-2.5" style={{ minHeight }}>
          <div className="builder-skeleton h-3 w-2/3 rounded-full" />
        </div>
      )}
    </div>
  );
}
