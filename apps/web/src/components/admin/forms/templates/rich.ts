import type { RichBlock, RichInline, RichTextDoc } from "@repo/shared";

/**
 * Tiny builders for the templates' rich text. `**bold**` inside a string
 * becomes a bold mark; only nodes the form sanitizer keeps are produced.
 */

function inline(text: string): RichInline[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) =>
    part.startsWith("**") && part.endsWith("**")
      ? { type: "text", text: part.slice(2, -2), marks: [{ type: "bold" }] }
      : { type: "text", text: part },
  );
}

export function p(text: string): RichBlock {
  return { type: "paragraph", content: inline(text) };
}

export function ul(...items: string[]): RichBlock {
  return {
    type: "bulletList",
    content: items.map((item) => ({ type: "listItem", content: [p(item)] })),
  };
}

export function ol(...items: string[]): RichBlock {
  return {
    type: "orderedList",
    content: items.map((item) => ({ type: "listItem", content: [p(item)] })),
  };
}

/** A document from paragraphs (strings) and ready-made blocks. */
export function rt(...blocks: (string | RichBlock)[]): RichTextDoc {
  return {
    type: "doc",
    content: blocks.map((block) => (typeof block === "string" ? p(block) : block)),
  };
}
