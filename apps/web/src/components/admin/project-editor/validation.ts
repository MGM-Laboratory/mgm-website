import { projectDetailFieldsSchema } from "@repo/shared";

import {
  normalizeDescription,
  PROJECT_DETAIL_LIMITS,
  type ProjectDraft,
  type ProjectMediaItem,
} from "@/lib/project-cms";

/**
 * Client-side validation for the detail page fields. It runs the same shared
 * schema the API extends, plus the pairing rule the schema cannot see (a CTA
 * label without a URL is dropped by `draftToProject`, so the editor flags it
 * instead of silently losing it), and maps the API's `project.<path>: message`
 * 400s back onto the same fields.
 */

export type DetailField = "theme" | "description" | "ctaLabel" | "ctaUrl" | "services" | "media";

export type DetailErrors = Partial<Record<DetailField, string>> & {
  /** Per media section, keyed by section id. */
  mediaRows: Record<string, string>;
};

export const noDetailErrors = (): DetailErrors => ({ mediaRows: {} });

export function hasDetailErrors(errors: DetailErrors) {
  const { mediaRows, ...fields } = errors;
  return Object.values(fields).some(Boolean) || Object.keys(mediaRows).length > 0;
}

// Same rule as the shared schema and `safeProjectHref`.
const SAFE_URL_PATTERN = /^(\/(?!\/)|https?:\/\/)/i;

export function isSafeCtaUrl(value: string) {
  return SAFE_URL_PATTERN.test(value);
}

/** Case-insensitive de-duplication, keeping the first spelling. */
export function uniqueServices(values: readonly string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => {
      const folded = value.toLocaleLowerCase();
      if (!value || seen.has(folded)) return false;
      seen.add(folded);
      return true;
    });
}

/** The saved shape of a media section (what `draftToProject` sends). */
export function cleanMediaItem(item: ProjectMediaItem): ProjectMediaItem {
  return {
    id: item.id,
    kind: item.kind,
    size: item.size,
    key: item.key,
    width: item.width,
    height: item.height,
    alt: item.alt?.trim() || undefined,
    // An image section with a poster is refused by the API.
    posterKey: item.kind === "video" ? item.posterKey || undefined : undefined,
  };
}

type Path = readonly PropertyKey[];

/** Readable copy for a failure at `path`; `fallback` is the raw message. */
function assign(
  errors: DetailErrors,
  path: Path,
  fallback: string,
  media: readonly ProjectMediaItem[],
) {
  const [head, index, leaf] = path;
  const limits = PROJECT_DETAIL_LIMITS;
  switch (head) {
    case "theme":
      errors.theme ??= "Pick one of the listed themes, or Automatic.";
      return true;
    case "description":
      errors.description ??= `Keep the description to ${limits.descriptionMax} characters.`;
      return true;
    case "cta":
      if (index === "label") {
        errors.ctaLabel ??= `Use a label of 1 to ${limits.ctaLabelMax} characters.`;
      } else {
        errors.ctaUrl ??= "Use an http(s):// URL or a site path such as /contact.";
      }
      return true;
    case "services":
      errors.services ??= `Up to ${limits.servicesMax} services, each ${limits.serviceMax} characters or fewer.`;
      return true;
    case "media": {
      const item = typeof index === "number" ? media[index] : undefined;
      if (!item) {
        errors.media ??=
          typeof index === "number"
            ? `A media section could not be saved: ${fallback}`
            : `Up to ${limits.mediaMax} media sections.`;
        return true;
      }
      errors.mediaRows[item.id] ??=
        leaf === "alt"
          ? `Alt text must be ${limits.mediaAltMax} characters or fewer.`
          : `This section could not be saved: ${fallback}`;
      return true;
    }
    default:
      return false;
  }
}

export function validateDetailFields(draft: ProjectDraft): DetailErrors {
  const errors = noDetailErrors();
  const label = draft.cta?.label.trim() ?? "";
  const url = draft.cta?.url.trim() ?? "";
  if (label && !url) errors.ctaUrl = "Add the address the button opens, or clear the label.";
  if (url && !label) errors.ctaLabel = "Add a button label, or clear the URL.";
  if (url && !isSafeCtaUrl(url)) {
    errors.ctaUrl = "Use an http(s):// URL or a site path such as /contact.";
  }

  // Sections still uploading (no key yet) are the upload state's concern.
  const media = (draft.media ?? []).filter((item) => item.key);
  const parsed = projectDetailFieldsSchema.safeParse({
    theme: draft.theme,
    description: normalizeDescription(draft.description ?? "") || undefined,
    cta: label && url ? { label, url } : undefined,
    services: uniqueServices(draft.services ?? []),
    media: media.map(cleanMediaItem),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) assign(errors, issue.path, issue.message, media);
  }
  return errors;
}

/**
 * Maps an API 400 (`project.media.2.alt: Too big…`, or the bare
 * `project: A media section points at a file of the wrong kind.`) onto the
 * detail fields. Returns undefined for messages about other fields.
 */
export function detailErrorsFromApi(
  message: string,
  media: readonly ProjectMediaItem[],
): DetailErrors | undefined {
  const match = /^project(?:\.([\w.]+))?: ([\s\S]+)$/.exec(message.trim());
  if (!match) return undefined;
  const text = match[2];
  const errors = noDetailErrors();
  if (!match[1]) {
    if (!/media section/i.test(text)) return undefined;
    errors.media = text;
    return errors;
  }
  const path = match[1]
    .split(".")
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
  return assign(errors, path, text, media) ? errors : undefined;
}
