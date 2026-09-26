/**
 * The form builder's field catalog: every block type the palette offers,
 * grouped into families, with a one-line description and the defaults a
 * freshly added block starts with. Pure data and functions (no JSX), so the
 * template check script and the builder share it.
 */

import {
  isChoiceType,
  isInputType,
  type FormDocument,
  type FormField,
  type FormFieldType,
  type FormOption,
} from "@repo/shared";

export type FieldFamily =
  "text" | "choice" | "scale" | "date" | "upload" | "contact" | "other" | "layout";

export const FIELD_FAMILIES: { id: FieldFamily; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "choice", label: "Choice" },
  { id: "scale", label: "Scale" },
  { id: "date", label: "Date & time" },
  { id: "upload", label: "Upload" },
  { id: "contact", label: "Contact" },
  { id: "other", label: "Other" },
  { id: "layout", label: "Layout" },
];

export type FieldTypeInfo = {
  type: FormFieldType;
  family: FieldFamily;
  label: string;
  description: string;
  /** Extra words the palette search matches. */
  keywords?: string;
};

export const FIELD_TYPES: FieldTypeInfo[] = [
  { type: "short_text", family: "text", label: "Short answer", description: "One line of text." },
  {
    type: "long_text",
    family: "text",
    label: "Long answer",
    description: "A paragraph or more, for stories and details.",
    keywords: "paragraph textarea essay",
  },
  { type: "email", family: "text", label: "Email", description: "An address, checked as typed." },
  {
    type: "phone",
    family: "text",
    label: "Phone",
    description: "A phone number with a country code.",
    keywords: "whatsapp mobile telephone",
  },
  { type: "number", family: "text", label: "Number", description: "A number within a range." },
  {
    type: "url",
    family: "text",
    label: "Link",
    description: "A web address.",
    keywords: "url website",
  },
  {
    type: "multiple_choice",
    family: "choice",
    label: "Multiple choice",
    description: "Pick one option from a list.",
    keywords: "radio single",
  },
  {
    type: "checkboxes",
    family: "choice",
    label: "Checkboxes",
    description: "Pick as many options as apply.",
    keywords: "multiple",
  },
  {
    type: "dropdown",
    family: "choice",
    label: "Dropdown",
    description: "One option from a searchable menu.",
    keywords: "select",
  },
  {
    type: "multiselect",
    family: "choice",
    label: "Multiselect",
    description: "Several options from a searchable menu.",
    keywords: "tags",
  },
  {
    type: "picture_choice",
    family: "choice",
    label: "Picture choice",
    description: "Options shown as images.",
    keywords: "image gallery",
  },
  {
    type: "yes_no",
    family: "choice",
    label: "Yes / No",
    description: "A single yes or no.",
    keywords: "boolean",
  },
  {
    type: "rating",
    family: "scale",
    label: "Rating",
    description: "Stars, hearts or other icons.",
    keywords: "stars",
  },
  {
    type: "opinion_scale",
    family: "scale",
    label: "Opinion scale",
    description: "A numbered scale with labelled ends.",
    keywords: "likert",
  },
  {
    type: "nps",
    family: "scale",
    label: "Net Promoter Score",
    description: "How likely, from 0 to 10.",
    keywords: "nps recommend",
  },
  { type: "slider", family: "scale", label: "Slider", description: "Drag to a value in a range." },
  {
    type: "ranking",
    family: "scale",
    label: "Ranking",
    description: "Put options in order.",
    keywords: "order sort",
  },
  {
    type: "matrix",
    family: "scale",
    label: "Matrix",
    description: "Rows rated against the same columns.",
    keywords: "grid table likert",
  },
  { type: "date", family: "date", label: "Date", description: "A calendar day." },
  { type: "time", family: "date", label: "Time", description: "A time of day." },
  { type: "datetime", family: "date", label: "Date & time", description: "A day and a time." },
  {
    type: "file_upload",
    family: "upload",
    label: "File upload",
    description: "Documents, archives and more.",
    keywords: "attachment cv pdf",
  },
  {
    type: "image_upload",
    family: "upload",
    label: "Image upload",
    description: "Photos and screenshots.",
    keywords: "photo picture",
  },
  {
    type: "signature",
    family: "upload",
    label: "Signature",
    description: "Signed with a finger or mouse.",
  },
  { type: "name", family: "contact", label: "Name", description: "First and last name." },
  {
    type: "address",
    family: "contact",
    label: "Address",
    description: "Street, city, region and postcode.",
  },
  {
    type: "country",
    family: "contact",
    label: "Country",
    description: "A country from a searchable list.",
  },
  {
    type: "color",
    family: "other",
    label: "Colour",
    description: "A colour from a picker.",
    keywords: "color",
  },
  {
    type: "consent",
    family: "other",
    label: "Consent",
    description: "An agreement checkbox with its terms.",
    keywords: "terms privacy agree",
  },
  {
    type: "hidden",
    family: "other",
    label: "Hidden field",
    description: "Filled from the link, never shown.",
    keywords: "utm prefill param",
  },
  { type: "heading", family: "layout", label: "Heading", description: "A section title." },
  {
    type: "paragraph",
    family: "layout",
    label: "Paragraph",
    description: "Formatted text between questions.",
  },
  { type: "image", family: "layout", label: "Image", description: "A picture with a caption." },
  { type: "video", family: "layout", label: "Video", description: "An upload, YouTube or Vimeo." },
  {
    type: "callout",
    family: "layout",
    label: "Callout",
    description: "A highlighted note or warning.",
  },
  {
    type: "quote",
    family: "layout",
    label: "Quote",
    description: "A pull quote with attribution.",
  },
  {
    type: "divider",
    family: "layout",
    label: "Divider",
    description: "A thin line between parts.",
  },
  { type: "spacer", family: "layout", label: "Spacer", description: "Breathing room." },
  {
    type: "page_break",
    family: "layout",
    label: "Page break",
    description: "Starts a new page; can jump by logic.",
    keywords: "section step",
  },
];

export const FIELD_TYPE_INFO: Record<FormFieldType, FieldTypeInfo> = Object.fromEntries(
  FIELD_TYPES.map((info) => [info.type, info]),
) as Record<FormFieldType, FieldTypeInfo>;

const FIELD_TYPE_LABELS = new Map(FIELD_TYPES.map((info) => [info.type, info.label]));

export function fieldTypeLabel(type: FormFieldType) {
  return FIELD_TYPE_LABELS.get(type) ?? type;
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomChars(length: number) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

/** Every id the document already uses: fields, options, matrix rows and columns, jumps, endings. */
export function documentIds(document: Pick<FormDocument, "fields" | "endings">) {
  const ids = new Set<string>();
  for (const field of document.fields) {
    ids.add(field.id);
    field.options?.forEach((option) => ids.add(option.id));
    field.rowsList?.forEach((row) => ids.add(row.id));
    field.columnsList?.forEach((column) => ids.add(column.id));
    field.jumps?.forEach((jump) => ids.add(jump.id));
  }
  document.endings.forEach((ending) => ids.add(ending.id));
  return ids;
}

/**
 * A short random id (`q_x7k2m9ab`), unique against `taken`, which is updated
 * so several ids minted in a row never collide either.
 */
export function mintId(prefix: string, taken: Set<string>) {
  for (;;) {
    const id = `${prefix}_${randomChars(8)}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

const ID_PREFIXES: Partial<Record<FormFieldType, string>> = {
  page_break: "page",
  heading: "blk",
  paragraph: "blk",
  image: "blk",
  video: "blk",
  divider: "blk",
  callout: "blk",
  quote: "blk",
  spacer: "blk",
  hidden: "hid",
};

const ID_PREFIX = new Map(Object.entries(ID_PREFIXES));

export function fieldIdPrefix(type: FormFieldType) {
  return ID_PREFIX.get(type) ?? "q";
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function options(taken: Set<string>, labels: string[]): FormOption[] {
  return labels.map((label) => ({ id: mintId("opt", taken), label }));
}

const DEFAULT_LABEL_TEXT: Partial<Record<FormFieldType, string>> = {
  short_text: "What should we call this?",
  long_text: "Tell us more",
  email: "What's your email address?",
  phone: "What's your phone number?",
  number: "How many?",
  url: "Share a link",
  multiple_choice: "Choose one",
  checkboxes: "Choose all that apply",
  dropdown: "Pick one from the list",
  multiselect: "Pick any that apply",
  picture_choice: "Which one do you like best?",
  yes_no: "Is this a yes?",
  rating: "How would you rate it?",
  opinion_scale: "How much do you agree?",
  nps: "How likely are you to recommend us to a friend or colleague?",
  slider: "Where would you place it?",
  ranking: "Put these in order of importance",
  matrix: "Rate each of these",
  date: "Which date?",
  time: "What time?",
  datetime: "When?",
  file_upload: "Attach a file",
  image_upload: "Upload an image",
  signature: "Sign here",
  name: "What's your name?",
  address: "What's your address?",
  country: "Which country are you in?",
  color: "Pick a colour",
  consent: "Consent",
  hidden: "Source",
  heading: "A new section",
  quote: "",
  page_break: "",
};

const DEFAULT_LABELS = new Map(Object.entries(DEFAULT_LABEL_TEXT));

/** A new block of `type` with sensible defaults and fresh ids. */
export function createField(type: FormFieldType, taken: Set<string>): FormField {
  const id = mintId(fieldIdPrefix(type), taken);
  const base: FormField = {
    id,
    type,
    label: DEFAULT_LABELS.get(type) ?? "",
    required: false,
    width: "full",
  };
  switch (type) {
    case "long_text":
      return { ...base, rows: 4 };
    case "number":
      return { ...base, min: 0 };
    case "multiple_choice":
    case "checkboxes":
    case "dropdown":
    case "multiselect":
    case "ranking":
      return { ...base, options: options(taken, ["Option 1", "Option 2", "Option 3"]) };
    case "picture_choice":
      return {
        ...base,
        options: options(taken, ["Option 1", "Option 2", "Option 3"]),
        optionLayout: "grid",
        maxSelections: 1,
      };
    case "rating":
      return { ...base, max: 5, ratingIcon: "star" };
    case "opinion_scale":
      return { ...base, min: 1, max: 5, minLabel: "Not at all", maxLabel: "Completely" };
    case "nps":
      return { ...base, min: 0, max: 10, minLabel: "Not likely", maxLabel: "Extremely likely" };
    case "slider":
      return { ...base, min: 0, max: 100, step: 1 };
    case "matrix":
      return {
        ...base,
        rowsList: [
          { id: mintId("row", taken), label: "First item" },
          { id: mintId("row", taken), label: "Second item" },
          { id: mintId("row", taken), label: "Third item" },
        ],
        columnsList: [
          { id: mintId("col", taken), label: "Poor" },
          { id: mintId("col", taken), label: "Fair" },
          { id: mintId("col", taken), label: "Good" },
          { id: mintId("col", taken), label: "Great" },
        ],
      };
    case "file_upload":
      return { ...base, accept: ["pdf", "document", "image"], maxFiles: 1, maxFileMb: 10 };
    case "image_upload":
      return { ...base, accept: ["image"], maxFiles: 1, maxFileMb: 10 };
    case "signature":
      return { ...base, maxFiles: 1 };
    case "phone":
      return { ...base, defaultCountry: "ID" };
    case "consent":
      return {
        ...base,
        required: true,
        consentText: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "I agree that my answers are stored and used for this form.",
                },
              ],
            },
          ],
        },
      };
    case "hidden":
      return { ...base, prefillParam: "source" };
    case "heading":
      return { ...base, headingLevel: 2 };
    case "paragraph":
      return {
        ...base,
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Write something here." }] },
          ],
        },
      };
    case "callout":
      return {
        ...base,
        calloutTone: "info",
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "A note worth reading." }] },
          ],
        },
      };
    case "quote":
      return {
        ...base,
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "A line worth quoting." }] },
          ],
        },
      };
    case "spacer":
      return { ...base, spacerSize: "md" };
    default:
      return base;
  }
}

/** A deep copy of `field` with a new id, and new option, row, column and jump ids. */
export function cloneField(field: FormField, taken: Set<string>): FormField {
  const copy = structuredClone(field);
  copy.id = mintId(fieldIdPrefix(field.type), taken);
  copy.options = copy.options?.map((option) => ({ ...option, id: mintId("opt", taken) }));
  copy.rowsList = copy.rowsList?.map((row) => ({ ...row, id: mintId("row", taken) }));
  copy.columnsList = copy.columnsList?.map((column) => ({ ...column, id: mintId("col", taken) }));
  copy.jumps = copy.jumps?.map((jump) => ({ ...jump, id: mintId("jump", taken) }));
  if (copy.type === "hidden" && copy.prefillParam) copy.prefillParam = `${copy.prefillParam}_copy`;
  return copy;
}

/** Whether a block is a question (answered), used for numbering. */
export function isQuestion(field: Pick<FormField, "type">) {
  return isInputType(field.type) && field.type !== "hidden";
}

export function hasOptions(field: Pick<FormField, "type">) {
  return isChoiceType(field.type);
}
