"use client";

import {
  ArrowsVerticalIcon,
  AtIcon,
  CalendarIcon,
  CalendarCheckIcon,
  CaretCircleDownIcon,
  CheckSquareIcon,
  ClockIcon,
  EyeSlashIcon,
  FilesIcon,
  GlobeHemisphereWestIcon,
  HashIcon,
  ImageIcon,
  ImageSquareIcon,
  ImagesIcon,
  InfoIcon,
  LinkSimpleIcon,
  ListChecksIcon,
  ListNumbersIcon,
  MapPinIcon,
  MinusIcon,
  PaletteIcon,
  ParagraphIcon,
  PhoneIcon,
  QuotesIcon,
  RadioButtonIcon,
  SealCheckIcon,
  SignatureIcon,
  SlidersHorizontalIcon,
  SpeedometerIcon,
  StarIcon,
  TableIcon,
  TextAlignLeftIcon,
  TextHIcon,
  TextTIcon,
  ToggleLeftIcon,
  GaugeIcon,
  UploadSimpleIcon,
  UserCircleIcon,
  VideoCameraIcon,
  type Icon,
} from "@phosphor-icons/react";

import { createElement } from "react";

import type { FormFieldType } from "@repo/shared";

import type { FieldFamily } from "@/lib/forms/builder-fields";

export const FIELD_ICONS: Record<FormFieldType, Icon> = {
  short_text: TextTIcon,
  long_text: TextAlignLeftIcon,
  email: AtIcon,
  phone: PhoneIcon,
  number: HashIcon,
  url: LinkSimpleIcon,
  multiple_choice: RadioButtonIcon,
  checkboxes: CheckSquareIcon,
  dropdown: CaretCircleDownIcon,
  multiselect: ListChecksIcon,
  picture_choice: ImagesIcon,
  yes_no: ToggleLeftIcon,
  rating: StarIcon,
  opinion_scale: GaugeIcon,
  nps: SpeedometerIcon,
  slider: SlidersHorizontalIcon,
  ranking: ListNumbersIcon,
  matrix: TableIcon,
  date: CalendarIcon,
  time: ClockIcon,
  datetime: CalendarCheckIcon,
  file_upload: UploadSimpleIcon,
  image_upload: ImageIcon,
  signature: SignatureIcon,
  name: UserCircleIcon,
  address: MapPinIcon,
  country: GlobeHemisphereWestIcon,
  color: PaletteIcon,
  consent: SealCheckIcon,
  hidden: EyeSlashIcon,
  heading: TextHIcon,
  paragraph: ParagraphIcon,
  image: ImageSquareIcon,
  video: VideoCameraIcon,
  callout: InfoIcon,
  quote: QuotesIcon,
  divider: MinusIcon,
  spacer: ArrowsVerticalIcon,
  page_break: FilesIcon,
};

const ICON_BY_TYPE = new Map(Object.entries(FIELD_ICONS) as [FormFieldType, Icon][]);

/** Each family's tint, so the palette and the cards read at a glance. */
export const FAMILY_TONES: Record<FieldFamily, string> = {
  text: "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#8fb0ec]",
  choice: "bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#5fd3a2]",
  scale: "bg-brand-yellow-50 text-[#9a6f10] dark:bg-brand-yellow/15 dark:text-brand-yellow",
  date: "bg-brand-red-50 text-brand-red dark:bg-brand-red/15 dark:text-[#ff8b8b]",
  upload: "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15 dark:text-[#8fb0ec]",
  contact: "bg-brand-green-50 text-brand-green dark:bg-brand-green/15 dark:text-[#5fd3a2]",
  other: "bg-brand-yellow-50 text-[#9a6f10] dark:bg-brand-yellow/15 dark:text-brand-yellow",
  layout: "bg-[#eef1f6] text-[#5d687d] dark:bg-white/10 dark:text-white/60",
};

export function FieldIcon({
  type,
  size = 16,
  className,
}: {
  type: FormFieldType;
  size?: number;
  className?: string;
}) {
  const icon = ICON_BY_TYPE.get(type);
  if (!icon) return null;
  return createElement(icon, { "aria-hidden": "true", className, size, weight: "bold" });
}
