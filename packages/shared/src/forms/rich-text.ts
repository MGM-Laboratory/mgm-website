/**
 * Rich text for forms: a whitelisted subset of the tiptap (ProseMirror) JSON
 * document. The admin editor writes it, the API stores it after
 * `sanitizeRichText`, and the public renderer turns it into React elements
 * node by node, so no HTML string is ever stored or injected.
 *
 * Colours are palette tokens, never free values: a highlight or text colour
 * is stored as `var(--rt-<token>)`, which the editor and the public page both
 * define from the form's theme, so every colour stays readable in light and
 * dark mode.
 */

export const RICH_TEXT_COLORS = ["blue", "red", "green", "yellow", "ink", "muted"] as const;
export type RichTextColor = (typeof RICH_TEXT_COLORS)[number];

export const RICH_TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;
export type RichTextAlign = (typeof RICH_TEXT_ALIGNS)[number];

export type RichMark =
  | { type: "bold" | "italic" | "underline" | "strike" | "code" }
  | { type: "link"; attrs: { href: string } }
  | { type: "highlight"; attrs: { color: string } }
  | { type: "textStyle"; attrs: { color: string } };

export type RichInline = { type: "text"; text: string; marks?: RichMark[] } | { type: "hardBreak" };

export type RichListItem = { type: "listItem"; content: RichBlock[] };

export type RichBlock =
  | { type: "paragraph"; attrs?: { textAlign?: RichTextAlign }; content?: RichInline[] }
  | {
      type: "heading";
      attrs: { level: 1 | 2 | 3; textAlign?: RichTextAlign };
      content?: RichInline[];
    }
  | { type: "bulletList" | "orderedList"; content: RichListItem[] }
  | { type: "blockquote"; content: RichBlock[] }
  | { type: "horizontalRule" };

export type RichTextDoc = { type: "doc"; content: RichBlock[] };

export const RICH_TEXT_LIMITS = {
  /** Characters of text across the whole document. */
  maxText: 20_000,
  /** Blocks at any one level. */
  maxBlocks: 300,
  /** Nesting (lists inside quotes inside lists...). */
  maxDepth: 5,
} as const;

// Spelled out rather than built from RICH_TEXT_COLORS so no regular expression
// is ever constructed at runtime; keep the two lists in step.
const COLOR_VALUE = /^var\(--rt-(blue|red|green|yellow|ink|muted)\)$/;
// Site paths (a single leading slash, never protocol-relative), http(s),
// mailto: and tel: only; javascript:, data: and every other scheme are refused.
const SAFE_HREF = /^(\/(?!\/)|https?:\/\/|mailto:|tel:)/i;

/** `var(--rt-blue)` → `blue`; anything else → null. */
export function richTextColorToken(value: unknown): RichTextColor | null {
  if (typeof value !== "string") return null;
  const match = COLOR_VALUE.exec(value.trim());
  return match ? (match[1] as RichTextColor) : null;
}

export function richTextColorValue(token: RichTextColor) {
  return `var(--rt-${token})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeAlign(attrs: unknown): RichTextAlign | undefined {
  if (!isRecord(attrs)) return undefined;
  const align = attrs.textAlign;
  return typeof align === "string" && (RICH_TEXT_ALIGNS as readonly string[]).includes(align)
    ? (align as RichTextAlign)
    : undefined;
}

function sanitizeMarks(marks: unknown): RichMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: RichMark[] = [];
  const seen = new Set<string>();
  for (const mark of marks.slice(0, 12)) {
    if (!isRecord(mark) || typeof mark.type !== "string" || seen.has(mark.type)) continue;
    const attrs = isRecord(mark.attrs) ? mark.attrs : {};
    switch (mark.type) {
      case "bold":
      case "italic":
      case "underline":
      case "strike":
      case "code":
        out.push({ type: mark.type });
        break;
      case "link": {
        const href = typeof attrs.href === "string" ? attrs.href.trim().slice(0, 2000) : "";
        if (SAFE_HREF.test(href)) out.push({ type: "link", attrs: { href } });
        break;
      }
      case "highlight":
      case "textStyle": {
        const token = richTextColorToken(attrs.color);
        if (token) out.push({ type: mark.type, attrs: { color: richTextColorValue(token) } });
        break;
      }
      default:
        continue;
    }
    seen.add(mark.type);
  }
  return out.length ? out : undefined;
}

type Budget = { text: number };

function sanitizeInline(nodes: unknown, budget: Budget): RichInline[] | undefined {
  if (!Array.isArray(nodes)) return undefined;
  const out: RichInline[] = [];
  for (const node of nodes.slice(0, 2000)) {
    if (!isRecord(node)) continue;
    if (node.type === "hardBreak") {
      out.push({ type: "hardBreak" });
      continue;
    }
    if (node.type !== "text" || typeof node.text !== "string" || !node.text) continue;
    if (budget.text <= 0) break;
    const text = node.text.slice(0, budget.text);
    budget.text -= text.length;
    const marks = sanitizeMarks(node.marks);
    out.push(marks ? { type: "text", text, marks } : { type: "text", text });
  }
  return out.length ? out : undefined;
}

function sanitizeBlocks(nodes: unknown, depth: number, budget: Budget): RichBlock[] {
  if (!Array.isArray(nodes) || depth > RICH_TEXT_LIMITS.maxDepth) return [];
  const out: RichBlock[] = [];
  for (const node of nodes.slice(0, RICH_TEXT_LIMITS.maxBlocks)) {
    if (!isRecord(node) || typeof node.type !== "string") continue;
    switch (node.type) {
      case "paragraph": {
        const textAlign = sanitizeAlign(node.attrs);
        const content = sanitizeInline(node.content, budget);
        out.push({
          type: "paragraph",
          ...(textAlign ? { attrs: { textAlign } } : {}),
          ...(content ? { content } : {}),
        });
        break;
      }
      case "heading": {
        const attrs = isRecord(node.attrs) ? node.attrs : {};
        const rawLevel = Number(attrs.level);
        const level = (rawLevel === 1 || rawLevel === 2 || rawLevel === 3 ? rawLevel : 2) as
          1 | 2 | 3;
        const textAlign = sanitizeAlign(node.attrs);
        const content = sanitizeInline(node.content, budget);
        out.push({
          type: "heading",
          attrs: textAlign ? { level, textAlign } : { level },
          ...(content ? { content } : {}),
        });
        break;
      }
      case "bulletList":
      case "orderedList": {
        const items: RichListItem[] = [];
        if (Array.isArray(node.content)) {
          for (const item of node.content.slice(0, RICH_TEXT_LIMITS.maxBlocks)) {
            if (!isRecord(item) || item.type !== "listItem") continue;
            const content = sanitizeBlocks(item.content, depth + 1, budget);
            items.push({
              type: "listItem",
              content: content.length ? content : [{ type: "paragraph" }],
            });
          }
        }
        if (items.length) out.push({ type: node.type, content: items });
        break;
      }
      case "blockquote": {
        const content = sanitizeBlocks(node.content, depth + 1, budget);
        if (content.length) out.push({ type: "blockquote", content });
        break;
      }
      case "horizontalRule":
        out.push({ type: "horizontalRule" });
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Rebuilds a document from its whitelisted parts: unknown nodes, marks,
 * attributes, unsafe links and free colours are dropped. Returns undefined
 * for anything that is not a document or has no content left.
 */
export function sanitizeRichText(value: unknown): RichTextDoc | undefined {
  if (!isRecord(value) || value.type !== "doc") return undefined;
  const content = sanitizeBlocks(value.content, 0, { text: RICH_TEXT_LIMITS.maxText });
  const hasText = content.some((block) => block.type !== "paragraph" || block.content?.length);
  return hasText ? { type: "doc", content } : undefined;
}

/** A plain-text rendering, for previews, meta descriptions and exports. */
export function richTextToPlain(doc: RichTextDoc | undefined | null): string {
  if (!doc) return "";
  const lines: string[] = [];
  const inline = (nodes?: RichInline[]) =>
    (nodes ?? []).map((node) => (node.type === "text" ? node.text : "\n")).join("");
  const walk = (blocks: RichBlock[], prefix = "") => {
    for (const block of blocks) {
      switch (block.type) {
        case "paragraph":
        case "heading":
          lines.push(prefix + inline(block.content));
          break;
        case "bulletList":
        case "orderedList":
          block.content.forEach((item, index) => {
            walk(
              item.content,
              `${prefix}${block.type === "orderedList" ? `${index + 1}. ` : "- "}`,
            );
          });
          break;
        case "blockquote":
          walk(block.content, `${prefix}> `);
          break;
        default:
          break;
      }
    }
  };
  walk(doc.content);
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A one-paragraph document from plain text (templates and quick defaults). */
export function plainToRichText(text: string): RichTextDoc | undefined {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!paragraphs.length) return undefined;
  return {
    type: "doc",
    content: paragraphs.map((part) => ({
      type: "paragraph",
      content: [{ type: "text", text: part }],
    })),
  };
}
