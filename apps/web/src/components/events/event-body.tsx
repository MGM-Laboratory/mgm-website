import { cn } from "@/lib/utils";
import type { ArticleBlock } from "@/lib/article-cms";

type InlineNode =
  | { type: "text"; text?: string; styles?: Record<string, boolean> }
  | { type: "link"; href?: string; content?: InlineNode[] };

type InlineContent = InlineNode[] | string | undefined;

const BODY_TEXT = "text-[1.0625rem] leading-[26px] text-[#3f3f3f] dark:text-[#d6d6d1]";

// CMS-authored URLs are trusted but rendered publicly, so non-web schemes
// are refused outright — React's own javascript: blocking stays the last line
// of defense rather than the only one.
function safeHref(value: string) {
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^[/#?]/.test(value)) return value;
  return undefined;
}

function safeImageSrc(value: string) {
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;
  return undefined;
}

function renderInline(nodes: InlineContent, keyPrefix: string): React.ReactNode {
  if (typeof nodes === "string") return nodes;
  if (!nodes?.length) return null;
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "link") {
      const href = node.href ? safeHref(node.href) : undefined;
      return (
        <a
          className="text-brand-blue underline decoration-brand-blue/40 underline-offset-2 transition hover:decoration-brand-blue"
          href={href}
          key={key}
          rel="noopener noreferrer"
          target={href?.startsWith("http") ? "_blank" : undefined}
        >
          {renderInline(node.content, key)}
        </a>
      );
    }
    const text = node.text ?? "";
    if (node.styles?.bold) {
      return (
        <strong className="font-semibold text-[#171b25] dark:text-white" key={key}>
          {text}
        </strong>
      );
    }
    if (node.styles?.italic) return <em key={key}>{text}</em>;
    if (node.styles?.code) {
      return (
        <code
          className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[0.85em] dark:bg-white/10"
          key={key}
        >
          {text}
        </code>
      );
    }
    return text;
  });
}

function ImageBlock({ block }: { block: ArticleBlock }) {
  const rawUrl = typeof block.props?.url === "string" ? block.props.url : undefined;
  const url = rawUrl ? safeImageSrc(rawUrl) : undefined;
  if (!url) return null;
  return (
    <figure className="mb-6">
      {/* CMS media stays a plain image: content is authored in the editor
          and revalidated by route, so a remote loader adds no benefit. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={typeof block.props?.caption === "string" ? block.props.caption : ""}
        className="block w-full rounded-2xl"
        src={url}
      />
      {typeof block.props?.caption === "string" && block.props.caption.trim() ? (
        <figcaption className="mt-2 text-sm leading-6 text-[var(--ink-3)]">
          {block.props.caption.trim()}
        </figcaption>
      ) : null}
    </figure>
  );
}

const HEADING_STYLES: Record<number, string> = {
  1: "mt-12 mb-5 font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white",
  2: "mt-9 mb-4 font-display text-[1.375rem] leading-snug font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white",
  3: "mt-7 mb-3 font-display text-[1.15rem] leading-snug font-semibold tracking-[-0.01em] text-[#0e1116] dark:text-white",
};

/**
 * Renders a saved BlockNote document with the event detail page's
 * typography — mirrors ArticleBody's structure exactly, kept as its own
 * file per this repo's per-entity duplication convention.
 */
export function EventBody({ blocks }: { blocks: ArticleBlock[] }) {
  const rendered: React.ReactNode[] = [];
  let pendingListItems: React.ReactNode[] = [];
  let pendingListKind: "ul" | "ol" | undefined;
  let listKey = 0;

  const flushList = () => {
    if (!pendingListKind || !pendingListItems.length) return;
    const kind = pendingListKind;
    const items = pendingListItems;
    pendingListItems = [];
    pendingListKind = undefined;
    const Tag = kind === "ol" ? "ol" : "ul";
    rendered.push(
      <Tag
        className={cn(
          "mb-6 list-outside pl-6",
          kind === "ol" ? "list-decimal" : "list-disc",
          BODY_TEXT,
        )}
        key={`list-${listKey++}`}
      >
        {items}
      </Tag>,
    );
  };

  for (const block of blocks) {
    if (block.type === "bulletListItem" || block.type === "numberedListItem") {
      const kind = block.type === "bulletListItem" ? "ul" : "ol";
      if (pendingListKind && pendingListKind !== kind) flushList();
      pendingListKind = kind;
      pendingListItems.push(
        <li className="pl-1.5 marker:text-[#9aa1ad]" key={block.id}>
          {renderInline(block.content as InlineContent, block.id)}
        </li>,
      );
      continue;
    }
    flushList();

    switch (block.type) {
      case "paragraph":
        rendered.push(
          <p className={cn("mb-6", BODY_TEXT)} key={block.id}>
            {renderInline(block.content as InlineContent, block.id)}
          </p>,
        );
        break;
      case "heading": {
        const level = typeof block.props?.level === "number" ? block.props.level : 2;
        const Tag = (["h1", "h2", "h3"] as const)[Math.min(Math.max(level, 1), 3) - 1];
        rendered.push(
          <Tag className={HEADING_STYLES[level] ?? HEADING_STYLES[2]} key={block.id}>
            {renderInline(block.content as InlineContent, block.id)}
          </Tag>,
        );
        break;
      }
      case "image":
        rendered.push(<ImageBlock block={block} key={block.id} />);
        break;
      default:
        // Unknown blocks (e.g. tables, quotes) degrade to their inline text.
        if (block.content != null) {
          rendered.push(
            <p className={cn("mb-6", BODY_TEXT)} key={block.id}>
              {renderInline(block.content as InlineContent, block.id)}
            </p>,
          );
        }
    }
  }
  flushList();

  return <div className="min-w-0">{rendered}</div>;
}
