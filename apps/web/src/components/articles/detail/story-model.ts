import type { ArticleBlock } from "@/lib/article-cms";
import { hashSlug } from "@/lib/theme-pick";

/**
 * Turns a saved BlockNote document into the article page's story: a lede,
 * the unnumbered paragraphs before the first heading, numbered sections
 * (every heading opens one, so the sections read as a real sequence), and
 * the sources gathered at the end. Images get a layout variant (wide with
 * an inner parallax, inset with the caption in the margin, offset), picked
 * in a rotation that starts at a stable point per article so two articles
 * never look alike (a diagram or chart is never cropped, so it never goes
 * full bleed); two images in a row become a diptych.
 *
 * Pure and client-safe: the server page builds the story once per request
 * and renders it; nothing here touches the DOM.
 *
 * Production uses paragraph, heading (level 2), image (url + caption),
 * bulletListItem and numberedListItem, with inline links. Anything else
 * degrades to a paragraph of its inline text (or is dropped when it has
 * none), and nested children are flattened after their parent.
 */

export type InlineNode =
  | { type: "text"; text?: string; styles?: Record<string, unknown> }
  | { type: "link"; href?: string; content?: InlineNode[] | string };

/** Inline content as BlockNote stores it: a node list, or plain text. */
export type InlineContent = InlineNode[] | string;

export type StoryImage = {
  id: string;
  src: string;
  caption: string;
  /**
   * A diagram, chart, map or animation rather than a photograph: it is never
   * cropped (no full bleed, no portrait crop in a pair), since its edges
   * carry labels and axes.
   */
  graphic: boolean;
};

export type FigureVariant = "wide" | "inset" | "offset";

export type StoryBlock =
  | { kind: "paragraph"; id: string; content: InlineContent }
  | { kind: "subheading"; id: string; content: InlineContent }
  | {
      kind: "list";
      id: string;
      ordered: boolean;
      items: { id: string; content: InlineContent; depth: number }[];
    }
  | { kind: "figure"; id: string; variant: FigureVariant; image: StoryImage; order: number }
  | { kind: "diptych"; id: string; images: [StoryImage, StoryImage]; order: number };

export type StorySection = {
  id: string;
  /** 1-based position in the article. */
  number: number;
  heading: InlineContent;
  headingText: string;
  blocks: StoryBlock[];
};

export type StorySource = {
  id: string;
  /** The citation with its "Source:" label (and a trailing "DOI:" label) taken off. */
  citation: InlineContent;
  links: { href: string; label: string }[];
};

export type Story = {
  lede?: { id: string; content: InlineContent; text: string };
  /** Paragraphs, lists and figures between the lede and the first heading. */
  intro: StoryBlock[];
  sections: StorySection[];
  sources: StorySource[];
  /** The sources' heading, in the article's own language (the label its author wrote). */
  sourcesTitle: string;
  /** Words across the whole document, for the reading time. */
  words: number;
};

// English articles end with "Source:", Indonesian ones with "Sumber:".
const SOURCE_LABEL = /^\s*(sources?|sumber)\s*:\s*/i;
const VARIANTS: readonly FigureVariant[] = ["wide", "inset", "offset"];

// CMS-authored URLs are trusted but rendered publicly: non-web schemes are
// refused outright (the same rule as components/articles/article-body.tsx).
export function safeHref(value: string) {
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^[/#?]/.test(value)) return value;
  return undefined;
}

export function safeImageSrc(value: string) {
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;
  return undefined;
}

/**
 * Inline content as the story can trust it. The CMS stores documents as
 * loosely typed JSON, so every node is checked all the way down: a text
 * node keeps its text only when it is a string, a link keeps its address
 * and its content only when they are well formed, and anything else is
 * dropped rather than allowed to break the page.
 */
function asInline(content: unknown): InlineContent | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content.flatMap((raw) => {
    const node = asInlineNode(raw);
    return node ? [node] : [];
  });
}

/** One stored inline node as the story can trust it, or undefined. */
function asInlineNode(raw: unknown): InlineNode | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const node = raw as Record<string, unknown>;
  if (node.type === "text") {
    return {
      type: "text",
      text: stringOrUndefined(node.text),
      styles: objectOrUndefined(node.styles),
    };
  }
  if (node.type === "link") {
    return { type: "link", href: stringOrUndefined(node.href), content: asInline(node.content) };
  }
  return undefined;
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function objectOrUndefined(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

/** The plain text of inline content. */
export function inlineText(content: InlineContent | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .map((node) => (node.type === "link" ? inlineText(node.content) : (node.text ?? "")))
    .join("");
}

function wordCount(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Inline content with a leading pattern removed from its first text run. */
function stripLeading(content: InlineContent, pattern: RegExp): InlineContent {
  if (typeof content === "string") return content.replace(pattern, "");
  const nodes = [...content];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.type !== "text") break;
    const text = node.text ?? "";
    if (!text.trim()) continue;
    nodes[index] = { ...node, text: text.replace(pattern, "") };
    break;
  }
  return nodes;
}

/** Inline content with a trailing "DOI:" (or "Link:") label before a final link removed. */
function stripTrailingLabel(content: InlineContent): InlineContent {
  if (typeof content === "string") return content;
  const nodes = [...content];
  const last = nodes.length - 1;
  if (last < 1 || nodes[last].type !== "link") return nodes;
  const before = nodes[last - 1];
  if (before.type === "text" && before.text) {
    nodes[last - 1] = {
      ...before,
      text: before.text.replace(/\s*(doi|link|url|available at)\s*:\s*$/i, " "),
    };
  }
  return nodes;
}

/** A bare web address written into the text (trailing punctuation left out). */
const BARE_URL = /https?:\/\/[^\s<>"'()[\]]+[^\s<>"'()[\].,;:!?]/gi;

function linksOf(content: InlineContent) {
  const links: { href: string; label: string }[] = [];
  const seen = new Set<string>();
  const add = (raw: string, label: string) => {
    const href = safeHref(raw);
    if (!href || seen.has(href)) return;
    seen.add(href);
    links.push({ href, label });
  };
  const nodes: InlineNode[] =
    typeof content === "string" ? [{ type: "text", text: content }] : content;
  for (const node of nodes) {
    if (node.type === "link") {
      if (node.href) add(node.href, inlineText(node.content) || node.href);
      continue;
    }
    for (const match of (node.text ?? "").matchAll(BARE_URL)) add(match[0], match[0]);
  }
  return links;
}

/**
 * The citation with its bare addresses taken out (they become link chips).
 * What is left of a citation that was only addresses ("A and B") is dropped.
 */
function withoutBareUrls(content: InlineContent): InlineContent {
  const nodes: InlineNode[] =
    typeof content === "string" ? [{ type: "text", text: content }] : content;
  const out = nodes.map((node) =>
    node.type === "text" && node.text
      ? {
          ...node,
          text: node.text
            .replace(BARE_URL, " ")
            .replace(/\s+(and|,|;)\s+(?=(and|,|;|\s)*$)/gi, " ")
            .replace(/\s{2,}/g, " "),
        }
      : node,
  );
  const rest = inlineText(out)
    .replace(/\b(and|or)\b/gi, "")
    .replace(/[\s,.;:]+/g, "");
  return rest ? out : [];
}

/** Flattens nested blocks (BlockNote children) after their parent, with their depth. */
function flatten(
  blocks: readonly ArticleBlock[],
  depth = 0,
): { block: ArticleBlock; depth: number }[] {
  const out: { block: ArticleBlock; depth: number }[] = [];
  for (const block of blocks) {
    // Stored JSON: a child can be anything, and only objects are blocks.
    if (!block || typeof block !== "object") continue;
    out.push({ block, depth });
    if (Array.isArray(block.children) && block.children.length) {
      out.push(...flatten(block.children, depth + 1));
    }
  }
  return out;
}

// Drawn pictures come as PNG, SVG or GIF files, or say what they are in
// their caption ("Diagram: ...", "A concept map of ...").
const GRAPHIC_FILE = /\.(png|svg|gif)($|[?#])/i;
const GRAPHIC_WORDS =
  /\b(diagram|chart|graph|map|flowchart|plot|infographic|screenshot|animation)s?\b/i;

function imageOf(block: ArticleBlock): StoryImage | undefined {
  const raw = typeof block.props?.url === "string" ? block.props.url : "";
  const src = raw ? safeImageSrc(raw.trim()) : undefined;
  if (!src) return undefined;
  const caption = typeof block.props?.caption === "string" ? block.props.caption.trim() : "";
  const graphic = GRAPHIC_FILE.test(src) || GRAPHIC_WORDS.test(caption);
  return { id: block.id, src, caption, graphic };
}

export function buildStory(slug: string, blocks: readonly ArticleBlock[]): Story {
  const story: Story = { intro: [], sections: [], sources: [], sourcesTitle: "", words: 0 };
  let current: StoryBlock[] = story.intro;
  let figures = 0;
  let indonesianSources = false;
  const rotation = hashSlug(slug) % VARIANTS.length;
  const entries = flatten(Array.isArray(blocks) ? blocks : []);

  const pushList = (ordered: boolean, id: string, content: InlineContent, depth: number) => {
    const last = current[current.length - 1];
    if (last?.kind === "list" && last.ordered === ordered) {
      last.items.push({ id, content, depth });
      return;
    }
    current.push({ kind: "list", id: `list-${id}`, ordered, items: [{ id, content, depth }] });
  };

  for (let index = 0; index < entries.length; index += 1) {
    const { block, depth } = entries[index];
    const content = asInline(block.content);
    const text = inlineText(content);
    story.words += wordCount(text);

    switch (block.type) {
      case "heading": {
        if (!text.trim() || !content) break;
        const level = typeof block.props?.level === "number" ? block.props.level : 2;
        if (level >= 3 && story.sections.length) {
          current.push({ kind: "subheading", id: block.id, content });
          break;
        }
        const section: StorySection = {
          id: block.id,
          number: story.sections.length + 1,
          heading: content,
          headingText: text.trim(),
          blocks: [],
        };
        story.sections.push(section);
        current = section.blocks;
        break;
      }
      case "bulletListItem":
      case "numberedListItem":
      case "checkListItem":
        if (!content || !text.trim()) break;
        pushList(block.type === "numberedListItem", block.id, content, depth);
        break;
      case "image": {
        const image = imageOf(block);
        if (!image) break;
        // Two pictures in a row sit side by side.
        const next = entries[index + 1];
        const pair = next && next.block.type === "image" ? imageOf(next.block) : undefined;
        if (pair) {
          current.push({ kind: "diptych", id: image.id, images: [image, pair], order: figures });
          figures += 2;
          index += 1;
          story.words += wordCount(pair.caption);
          break;
        }
        const turn = VARIANTS[(rotation + figures) % VARIANTS.length];
        // A graphic takes the widest layout that keeps all of it in view.
        const variant = image.graphic && turn === "wide" ? "offset" : turn;
        current.push({ kind: "figure", id: image.id, variant, image, order: figures });
        figures += 1;
        story.words += wordCount(image.caption);
        break;
      }
      case "paragraph":
      default: {
        if (!content || !text.trim()) break;
        const label = SOURCE_LABEL.exec(text);
        if (label && (story.lede || index > 0)) {
          if (/sumber/i.test(label[1])) indonesianSources = true;
          story.sources.push({
            id: block.id,
            citation: withoutBareUrls(stripTrailingLabel(stripLeading(content, SOURCE_LABEL))),
            links: linksOf(content),
          });
          break;
        }
        if (
          !story.lede &&
          !story.sections.length &&
          !story.intro.length &&
          block.type === "paragraph"
        ) {
          story.lede = { id: block.id, content, text };
          break;
        }
        current.push({ kind: "paragraph", id: block.id, content });
      }
    }
  }
  story.sourcesTitle = indonesianSources
    ? "Sumber"
    : story.sources.length > 1
      ? "Sources"
      : "Source";
  return story;
}

/** Minutes to read at about 230 words a minute, at least one. */
export function readingMinutes(story: Story) {
  return Math.max(1, Math.round(story.words / 230));
}
