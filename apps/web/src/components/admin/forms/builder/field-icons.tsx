"use client";

import {
  ArrowsVertical,
  At,
  Calendar,
  CalendarCheck,
  CaretCircleDown,
  CheckSquare,
  Clock,
  EyeSlash,
  Files,
  GlobeHemisphereWest,
  Hash,
  Image,
  ImageSquare,
  Images,
  Info,
  LinkSimple,
  ListChecks,
  ListNumbers,
  MapPin,
  Minus,
  Palette,
  Paragraph,
  Phone,
  Quotes,
  RadioButton,
  SealCheck,
  Signature,
  SlidersHorizontal,
  Speedometer,
  Star,
  Table,
  TextAlignLeft,
  TextH,
  TextT,
  ToggleLeft,
  Gauge,
  UploadSimple,
  UserCircle,
  VideoCamera,
  type Icon,
} from "@phosphor-icons/react";

import type { FormFieldType } from "@repo/shared";

import type { FieldFamily } from "@/lib/forms/builder-fields";

export const FIELD_ICONS: Record<FormFieldType, Icon> = {
  short_text: TextT,
  long_text: TextAlignLeft,
  email: At,
  phone: Phone,
  number: Hash,
  url: LinkSimple,
  multiple_choice: RadioButton,
  checkboxes: CheckSquare,
  dropdown: CaretCircleDown,
  multiselect: ListChecks,
  picture_choice: Images,
  yes_no: ToggleLeft,
  rating: Star,
  opinion_scale: Gauge,
  nps: Speedometer,
  slider: SlidersHorizontal,
  ranking: ListNumbers,
  matrix: Table,
  date: Calendar,
  time: Clock,
  datetime: CalendarCheck,
  file_upload: UploadSimple,
  image_upload: Image,
  signature: Signature,
  name: UserCircle,
  address: MapPin,
  country: GlobeHemisphereWest,
  color: Palette,
  consent: SealCheck,
  hidden: EyeSlash,
  heading: TextH,
  paragraph: Paragraph,
  image: ImageSquare,
  video: VideoCamera,
  callout: Info,
  quote: Quotes,
  divider: Minus,
  spacer: ArrowsVertical,
  page_break: Files,
};

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
  const Component = FIELD_ICONS[type];
  return <Component aria-hidden="true" className={className} size={size} weight="bold" />;
}
