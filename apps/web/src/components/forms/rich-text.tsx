import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
  richTextColorToken,
  sanitizeRichText,
  type RichBlock,
  type RichInline,
  type RichMark,
  type RichTextDoc,
} from "@repo/shared";

import { cn } from "@/lib/utils";

/**
 * Renders a form's rich text (the whitelisted tiptap JSON) node by node
 * into React elements, never through an HTML string. The document is
 * sanitized again here, so whatever reaches the page is the safe subset.
 * Colours are palette tokens: a text colour reads `var(--rt-<token>)`, a
 * highlight the token's wash, both defined by the form's theme root.
 */

type RichTextProps = {
  doc: RichTextDoc | undefined | null;
  className?: string;
  /** Rewrites every text run, for `{{fieldId}}` piping. */
  transform?: (text: string) => string;
  /** Render inline only (the first paragraph's content), for labels. */
  inline?: boolean;
};

export function RichText({ doc, className, transform, inline }: RichTextProps) {
  const safe = sanitizeRichText(doc);
  if (!safe) return null;
  if (inline) {
    const first = safe.content.find(
      (block) => block.type === "paragraph" || block.type === "heading",
    );
    if (!first || !("content" in first)) return null;
    return (
      <span className={className}>
        {renderInline((first.content as RichInline[] | undefined) ?? [], transform)}
      </span>
    );
  }
  return (
    <div className={cn("fx-rich", className)}>{renderBlocks(safe.content, transform, "b")}</div>
  );
}

function alignStyle(align?: string): CSSProperties | undefined {
  return align && align !== "left" ? { textAlign: align as CSSProperties["textAlign"] } : undefined;
}

function renderBlocks(
  blocks: RichBlock[],
  transform: RichTextProps["transform"],
  prefix: string,
): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${prefix}${index}`;
    switch (block.type) {
      case "paragraph":
        return (
          <p key={key} style={alignStyle(block.attrs?.textAlign)}>
            {block.content?.length ? renderInline(block.content, transform) : <br />}
          </p>
        );
      case "heading": {
        const Tag = (["h3", "h4", "h5"] as const)[block.attrs.level - 1];
        return (
          <Tag key={key} className="fx-rich-heading" style={alignStyle(block.attrs.textAlign)}>
            {renderInline(block.content ?? [], transform)}
          </Tag>
        );
      }
      case "bulletList":
      case "orderedList": {
        const List = block.type === "bulletList" ? "ul" : "ol";
        return (
          <List key={key}>
            {block.content.map((item, itemIndex) => (
              <li key={`${key}-${itemIndex}`}>
                {renderBlocks(item.content, transform, `${key}-${itemIndex}-`)}
              </li>
            ))}
          </List>
        );
      }
      case "blockquote":
        return (
          <blockquote key={key}>{renderBlocks(block.content, transform, `${key}-`)}</blockquote>
        );
      case "horizontalRule":
        return <hr key={key} />;
      default:
        return null;
    }
  });
}

function isExternal(href: string) {
  return /^https?:\/\//i.test(href);
}

function wrap(node: ReactNode, mark: RichMark, key: string): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong key={key}>{node}</strong>;
    case "italic":
      return <em key={key}>{node}</em>;
    case "underline":
      return <u key={key}>{node}</u>;
    case "strike":
      return <s key={key}>{node}</s>;
    case "code":
      return <code key={key}>{node}</code>;
    case "textStyle": {
      const token = richTextColorToken(mark.attrs.color);
      return token ? (
        <span key={key} style={{ color: `var(--rt-${token})` }}>
          {node}
        </span>
      ) : (
        node
      );
    }
    case "highlight": {
      const token = richTextColorToken(mark.attrs.color);
      return token ? (
        <mark key={key} className="fx-rich-mark" style={{ background: `var(--rt-${token}-wash)` }}>
          {node}
        </mark>
      ) : (
        node
      );
    }
    case "link": {
      const external = isExternal(mark.attrs.href);
      return (
        <a
          key={key}
          href={mark.attrs.href}
          rel="noopener noreferrer"
          {...(external ? { target: "_blank" } : {})}
        >
          {node}
        </a>
      );
    }
    default:
      return node;
  }
}

// Links wrap outermost so the colour and highlight marks sit inside them.
const MARK_ORDER: RichMark["type"][] = [
  "code",
  "bold",
  "italic",
  "underline",
  "strike",
  "textStyle",
  "highlight",
  "link",
];

function renderInline(nodes: RichInline[], transform: RichTextProps["transform"]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "hardBreak") return <br key={index} />;
    let content: ReactNode = transform ? transform(node.text) : node.text;
    const marks = [...(node.marks ?? [])].sort(
      (a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type),
    );
    marks.forEach((mark, markIndex) => {
      content = wrap(content, mark, `${index}-${markIndex}`);
    });
    return <Fragment key={index}>{content}</Fragment>;
  });
}
