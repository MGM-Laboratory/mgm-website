"use client";

/**
 * A static, compact rendition of each block's input on the canvas, so the
 * builder reads like the form. Nothing here is interactive (tabIndex -1,
 * aria-hidden): editing happens inline on the label and in the inspector.
 */

import {
  CalendarBlank,
  CaretDown,
  Clock,
  Heart,
  Lightning,
  MapPin,
  Palette,
  PenNib,
  Smiley,
  Star,
  ThumbsUp,
  Circle,
  UploadSimple,
  Image as ImageIcon,
  VideoCamera,
  Quotes,
  EyeSlash,
  DotsSixVertical,
} from "@phosphor-icons/react";

import { richTextToPlain, type FormField, type RatingIcon } from "@repo/shared";

import { mediaPreviewUrl } from "@/lib/forms/builder-media";

const box =
  "rounded-lg border border-[#dfe4ee] bg-[#fbfcfe] px-3 text-[13px] text-[#9ba4b5] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/30";

const RATING_ICONS: Record<RatingIcon, typeof Star> = {
  star: Star,
  heart: Heart,
  circle: Circle,
  thumb: ThumbsUp,
  bolt: Lightning,
  smile: Smiley,
};

function Line({ text, className = "h-9" }: { text?: string; className?: string }) {
  return <div className={`${box} flex items-center truncate ${className}`}>{text}</div>;
}

function Options({ field, shape }: { field: FormField; shape: "radio" | "check" }) {
  const options = field.options ?? [];
  const shown = options.slice(0, 5);
  const inline = field.optionLayout === "inline" || field.optionLayout === "grid";
  return (
    <div className={inline ? "flex flex-wrap gap-1.5" : "space-y-1.5"}>
      {shown.map((option) => (
        <div
          className={`flex min-w-0 items-center gap-2 rounded-lg border border-[#e3e7f0] bg-white px-2.5 py-1.5 text-[13px] text-[#3c4659] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70 ${inline ? "" : "w-full max-w-md"}`}
          key={option.id}
        >
          <span
            className={`size-3.5 shrink-0 border-[1.5px] border-[#b9c2d3] dark:border-white/25 ${shape === "radio" ? "rounded-full" : "rounded-[4px]"}`}
          />
          <span className="truncate">{option.label || "Untitled option"}</span>
          {option.points ? (
            <span className="ml-auto shrink-0 font-mono text-[10px] text-brand-green">
              {option.points > 0 ? "+" : ""}
              {option.points}
            </span>
          ) : null}
        </div>
      ))}
      {options.length > shown.length ? (
        <p className="text-xs text-[#8490a5]">+{options.length - shown.length} more</p>
      ) : null}
      {field.allowOther ? (
        <div className="flex items-center gap-2 px-1 text-xs text-[#8490a5]">
          <span
            className={`size-3 border border-dashed border-[#b9c2d3] ${shape === "radio" ? "rounded-full" : "rounded-[3px]"}`}
          />
          {field.otherLabel || "Other"}
        </div>
      ) : null}
    </div>
  );
}

function Scale({ min, max, field }: { min: number; max: number; field: FormField }) {
  const count = Math.max(1, Math.min(11, max - min + 1));
  return (
    <div>
      <div className="flex gap-1">
        {Array.from({ length: count }, (_, index) => (
          <span
            className="grid h-8 min-w-0 flex-1 place-items-center rounded-md border border-[#dfe4ee] bg-white text-[11px] font-semibold text-[#5d687d] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55"
            key={index}
          >
            {min + index}
          </span>
        ))}
      </div>
      {field.minLabel || field.maxLabel ? (
        <div className="mt-1 flex justify-between gap-2 text-[11px] text-[#8490a5]">
          <span className="truncate">{field.minLabel}</span>
          {field.midLabel ? <span className="truncate">{field.midLabel}</span> : null}
          <span className="truncate">{field.maxLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

function RichSnippet({ field, fallback }: { field: FormField; fallback: string }) {
  const text = richTextToPlain(field.content) || fallback;
  return (
    <p className="line-clamp-3 text-[13px] leading-5 text-[#4f5a6f] dark:text-white/65">{text}</p>
  );
}

function MediaThumb({ field, kind }: { field: FormField; kind: "image" | "video" }) {
  const url = field.media ? mediaPreviewUrl(field.media) : undefined;
  return (
    <div className="relative grid aspect-[16/7] max-w-md place-items-center overflow-hidden rounded-lg border border-dashed border-[#d3dae6] bg-[#f4f6fa] text-[#9ba4b5] dark:border-white/10 dark:bg-white/[0.03]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          src={url}
          style={{ objectPosition: `${field.media?.focalX ?? 50}% ${field.media?.focalY ?? 50}%` }}
        />
      ) : kind === "image" ? (
        <ImageIcon size={22} />
      ) : (
        <VideoCamera size={22} />
      )}
    </div>
  );
}

export function FieldRendition({ field }: { field: FormField }) {
  switch (field.type) {
    case "short_text":
    case "email":
    case "url":
      return (
        <Line
          text={
            field.placeholder ||
            (field.type === "email"
              ? "name@example.com"
              : field.type === "url"
                ? "https://"
                : "Short answer")
          }
        />
      );
    case "phone":
      return (
        <div className="flex max-w-md gap-1.5">
          <Line className="h-9 w-20 shrink-0" text={`${field.defaultCountry || "ID"} ▾`} />
          <Line className="h-9 flex-1" text={field.placeholder || "Phone number"} />
        </div>
      );
    case "number":
      return (
        <div className="flex max-w-xs items-center gap-1.5">
          {field.prefix ? <span className="text-sm text-[#8490a5]">{field.prefix}</span> : null}
          <Line
            className="h-9 flex-1"
            text={field.placeholder || (field.min !== undefined ? String(field.min) : "0")}
          />
          {field.suffix ? <span className="text-sm text-[#8490a5]">{field.suffix}</span> : null}
        </div>
      );
    case "long_text":
      return <Line className="h-16 items-start pt-2" text={field.placeholder || "Long answer"} />;
    case "multiple_choice":
      return <Options field={field} shape="radio" />;
    case "checkboxes":
      return <Options field={field} shape="check" />;
    case "dropdown":
    case "multiselect":
      return (
        <div className={`${box} flex h-9 max-w-md items-center justify-between`}>
          <span className="truncate">
            {field.type === "multiselect" ? "Choose any" : "Choose one"} ·{" "}
            {field.options?.length ?? 0} options
          </span>
          <CaretDown size={14} />
        </div>
      );
    case "picture_choice":
      return (
        <div className="grid max-w-lg grid-cols-3 gap-1.5">
          {(field.options ?? []).slice(0, 3).map((option) => {
            const url = option.image ? mediaPreviewUrl(option.image) : undefined;
            return (
              <div
                className="overflow-hidden rounded-lg border border-[#e3e7f0] dark:border-white/10"
                key={option.id}
              >
                <div className="grid aspect-[4/3] place-items-center bg-[#f1f4f9] text-[#b3bccb] dark:bg-white/[0.04]">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="size-full object-cover" loading="lazy" src={url} />
                  ) : (
                    <ImageIcon size={18} />
                  )}
                </div>
                <p className="truncate px-2 py-1 text-[11px] text-[#4f5a6f] dark:text-white/60">
                  {option.label}
                </p>
              </div>
            );
          })}
        </div>
      );
    case "yes_no":
      return (
        <div className="flex gap-1.5">
          {["Yes", "No"].map((label) => (
            <span
              className="inline-flex h-8 items-center rounded-lg border border-[#dfe4ee] bg-white px-4 text-[13px] font-semibold text-[#4f5a6f] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60"
              key={label}
            >
              {label}
            </span>
          ))}
        </div>
      );
    case "rating": {
      const Icon = RATING_ICONS[field.ratingIcon ?? "star"];
      return (
        <div className="flex gap-1 text-[#c4cbd8] dark:text-white/20">
          {Array.from({ length: Math.min(10, Math.max(1, field.max ?? 5)) }, (_, index) => (
            <Icon key={index} size={22} weight="fill" />
          ))}
        </div>
      );
    }
    case "opinion_scale":
      return <Scale field={field} max={field.max ?? 5} min={field.min ?? 1} />;
    case "nps":
      return <Scale field={field} max={10} min={0} />;
    case "slider":
      return (
        <div className="max-w-md">
          <div className="relative h-1.5 rounded-full bg-[#e3e7f0] dark:bg-white/10">
            <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-brand-blue/60" />
            <span className="absolute top-1/2 left-2/5 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-blue bg-white" />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-[#8490a5]">
            <span>
              {field.prefix}
              {field.min ?? 0}
              {field.suffix}
            </span>
            <span>
              {field.prefix}
              {field.max ?? 100}
              {field.suffix}
            </span>
          </div>
        </div>
      );
    case "ranking":
      return (
        <ol className="max-w-md space-y-1">
          {(field.options ?? []).slice(0, 4).map((option, index) => (
            <li
              className="flex items-center gap-2 rounded-lg border border-[#e3e7f0] bg-white px-2 py-1.5 text-[13px] text-[#3c4659] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70"
              key={option.id}
            >
              <DotsSixVertical className="text-[#b3bccb]" size={14} />
              <span className="font-mono text-[10px] text-[#8490a5]">{index + 1}</span>
              <span className="truncate">{option.label}</span>
            </li>
          ))}
        </ol>
      );
    case "matrix": {
      const rows = (field.rowsList ?? []).slice(0, 3);
      const columns = (field.columnsList ?? []).slice(0, 5);
      return (
        <div className="max-w-lg overflow-hidden rounded-lg border border-[#e3e7f0] text-[11px] dark:border-white/10">
          <div
            className="grid bg-[#f4f6fa] dark:bg-white/[0.04]"
            style={{
              gridTemplateColumns: `minmax(0,1.6fr) repeat(${columns.length || 1}, minmax(0,1fr))`,
            }}
          >
            <span />
            {columns.map((column) => (
              <span
                className="truncate px-1 py-1.5 text-center text-[#69748a] dark:text-white/50"
                key={column.id}
              >
                {column.label}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div
              className="grid border-t border-[#eef1f6] dark:border-white/[0.06]"
              key={row.id}
              style={{
                gridTemplateColumns: `minmax(0,1.6fr) repeat(${columns.length || 1}, minmax(0,1fr))`,
              }}
            >
              <span className="truncate px-2 py-1.5 text-[#3c4659] dark:text-white/70">
                {row.label}
              </span>
              {columns.map((column) => (
                <span className="grid place-items-center" key={column.id}>
                  <span
                    className={`size-3 border-[1.5px] border-[#b9c2d3] dark:border-white/25 ${field.matrixMultiple ? "rounded-[3px]" : "rounded-full"}`}
                  />
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    }
    case "date":
    case "datetime":
      return (
        <div className={`${box} flex h-9 max-w-xs items-center gap-2`}>
          <CalendarBlank size={15} />
          {field.type === "date" ? "DD / MM / YYYY" : "DD / MM / YYYY, HH:MM"}
        </div>
      );
    case "time":
      return (
        <div className={`${box} flex h-9 max-w-[10rem] items-center gap-2`}>
          <Clock size={15} />
          HH:MM
        </div>
      );
    case "file_upload":
    case "image_upload":
      return (
        <div className="flex h-16 max-w-md items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-[#cfd6e3] text-[13px] text-[#8490a5] dark:border-white/15">
          <UploadSimple size={16} />
          {field.type === "image_upload" ? "Upload images" : "Upload files"}
          <span className="font-mono text-[10px]">
            · {field.maxFiles ?? 1} max · {field.maxFileMb ?? 10} MB
          </span>
        </div>
      );
    case "signature":
      return (
        <div className="flex h-16 max-w-md items-end rounded-lg border border-[#dfe4ee] bg-[#fbfcfe] px-3 pb-2 dark:border-white/10 dark:bg-white/[0.03]">
          <PenNib className="mr-2 text-[#b3bccb]" size={16} />
          <span className="h-px flex-1 bg-[#cfd6e3] dark:bg-white/15" />
        </div>
      );
    case "name":
      return (
        <div className="grid max-w-md grid-cols-2 gap-1.5">
          <Line text="First name" />
          <Line text="Last name" />
        </div>
      );
    case "address":
      return (
        <div className="grid max-w-md gap-1.5">
          <Line text="Street address" />
          <div className="grid grid-cols-3 gap-1.5">
            <Line text="City" />
            <Line text="Region" />
            <Line text="Postcode" />
          </div>
        </div>
      );
    case "country":
      return (
        <div className={`${box} flex h-9 max-w-xs items-center justify-between`}>
          <span className="flex items-center gap-2">
            <MapPin size={14} />
            Choose a country
          </span>
          <CaretDown size={14} />
        </div>
      );
    case "color":
      return (
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg border border-[#dfe4ee] bg-brand-blue text-white dark:border-white/10">
            <Palette size={15} />
          </span>
          <span className="font-mono text-xs text-[#8490a5]">#3A6DC5</span>
        </div>
      );
    case "consent":
      return (
        <div className="flex max-w-lg items-start gap-2.5 rounded-lg border border-[#e3e7f0] bg-white p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
          <span className="mt-0.5 size-4 shrink-0 rounded-[4px] border-[1.5px] border-[#b9c2d3] dark:border-white/25" />
          <span className="line-clamp-2 text-[13px] leading-5 text-[#4f5a6f] dark:text-white/65">
            {richTextToPlain(field.consentText) || "I agree."}
          </span>
        </div>
      );
    case "hidden":
      return (
        <p className="flex items-center gap-2 font-mono text-[11px] text-[#8490a5]">
          <EyeSlash size={14} />?{field.prefillParam || "param"}=…
        </p>
      );
    case "paragraph":
      return <RichSnippet fallback="Empty paragraph" field={field} />;
    case "callout":
      return (
        <div className="rounded-lg border-l-[3px] border-brand-blue bg-brand-blue-50/70 px-3 py-2 dark:bg-brand-blue/10">
          <RichSnippet fallback="Empty callout" field={field} />
        </div>
      );
    case "quote":
      return (
        <div className="flex gap-2 border-l-2 border-[#cfd6e3] pl-3 dark:border-white/15">
          <Quotes className="shrink-0 text-[#b3bccb]" size={16} weight="fill" />
          <RichSnippet fallback="Empty quote" field={field} />
        </div>
      );
    case "image":
      return <MediaThumb field={field} kind="image" />;
    case "video":
      return <MediaThumb field={field} kind="video" />;
    case "divider":
      return <div className="h-px bg-[#dfe4ee] dark:bg-white/10" />;
    case "spacer":
      return (
        <div
          className={`rounded-md bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(132,144,165,0.12)_6px,rgba(132,144,165,0.12)_12px)] ${{ sm: "h-3", md: "h-6", lg: "h-10", xl: "h-14" }[field.spacerSize ?? "md"]}`}
        />
      );
    default:
      return null;
  }
}
