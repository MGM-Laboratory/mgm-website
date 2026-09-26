"use client";

import { CircleCheck, Info, NotebookPen, TriangleAlert } from "lucide-react";
import type { CalloutTone, FormField } from "@repo/shared";

import { useFormController } from "../form-context";
import { FormMediaView } from "../media";
import { RichText } from "../rich-text";
import { ShapeSvg } from "../scene/scene-dom";

/** Content blocks: shown to the respondent, never answered. */

type ContentProps = { field: FormField; conversational?: boolean };

function Heading({ field, conversational }: ContentProps) {
  const { pipe } = useFormController();
  const level = field.headingLevel ?? 2;
  const Tag = conversational ? "h2" : level === 1 ? "h2" : level === 2 ? "h3" : "h4";
  return (
    <div className="fx-content fx-content-heading" data-level={level} data-align={field.align}>
      <Tag className={level === 1 ? "fx-title" : "fx-block-heading"} data-type-target="">
        {pipe(field.label)}
      </Tag>
      {field.content ? (
        <RichText doc={field.content} transform={pipe} className="fx-muted" />
      ) : null}
    </div>
  );
}

function Paragraph({ field }: ContentProps) {
  const { pipe } = useFormController();
  return (
    <div className="fx-content" data-align={field.align}>
      {field.label ? <p className="fx-block-label">{pipe(field.label)}</p> : null}
      <RichText doc={field.content} transform={pipe} />
    </div>
  );
}

function ImageBlock({ field }: ContentProps) {
  if (!field.media) return null;
  return (
    <figure className="fx-content fx-figure">
      <FormMediaView media={field.media} />
      {field.media.caption || field.label ? (
        <figcaption>{field.media.caption || field.label}</figcaption>
      ) : null}
    </figure>
  );
}

function VideoBlock({ field }: ContentProps) {
  if (!field.media) return null;
  return (
    <figure className="fx-content fx-figure">
      <FormMediaView media={field.media} className="fx-video" />
      {field.media.caption || field.label ? (
        <figcaption>{field.media.caption || field.label}</figcaption>
      ) : null}
    </figure>
  );
}

function CalloutIcon({ tone }: { tone: CalloutTone }) {
  const props = { "aria-hidden": true, strokeWidth: 2.25, size: 20, className: "fx-callout-icon" };
  switch (tone) {
    case "info":
      return <Info {...props} />;
    case "success":
      return <CircleCheck {...props} />;
    case "warning":
      return <TriangleAlert {...props} />;
    case "note":
      return <NotebookPen {...props} />;
  }
}

function Callout({ field }: ContentProps) {
  const { pipe } = useFormController();
  const tone = field.calloutTone ?? "info";
  return (
    <aside className="fx-content fx-callout" data-tone={tone}>
      <CalloutIcon tone={tone} />
      <div>
        {field.label ? <p className="fx-callout-title">{pipe(field.label)}</p> : null}
        <RichText doc={field.content} transform={pipe} />
      </div>
    </aside>
  );
}

function Quote({ field }: ContentProps) {
  const { pipe } = useFormController();
  return (
    <figure className="fx-content fx-quote" data-align={field.align}>
      <span className="fx-quote-mark" aria-hidden>
        <ShapeSvg kind="half" />
        <ShapeSvg kind="half" />
      </span>
      <blockquote>
        <RichText doc={field.content} transform={pipe} />
      </blockquote>
      {field.label ? <figcaption>{pipe(field.label)}</figcaption> : null}
    </figure>
  );
}

function Divider() {
  return (
    <div className="fx-divider" role="separator">
      <span aria-hidden className="fx-divider-shapes">
        <ShapeSvg kind="circle" />
        <ShapeSvg kind="triangle" />
        <ShapeSvg kind="square" />
      </span>
    </div>
  );
}

function Spacer({ field }: ContentProps) {
  return <div className="fx-spacer" data-size={field.spacerSize ?? "md"} aria-hidden />;
}

function PageBreak() {
  return null;
}

/** The block for a content field; null for any other type. */
export function ContentBlock({ field, conversational }: ContentProps) {
  switch (field.type) {
    case "heading":
      return <Heading field={field} conversational={conversational} />;
    case "paragraph":
      return <Paragraph field={field} />;
    case "image":
      return <ImageBlock field={field} />;
    case "video":
      return <VideoBlock field={field} />;
    case "divider":
      return <Divider />;
    case "callout":
      return <Callout field={field} />;
    case "quote":
      return <Quote field={field} />;
    case "spacer":
      return <Spacer field={field} />;
    case "page_break":
      return <PageBreak />;
    default:
      return null;
  }
}
