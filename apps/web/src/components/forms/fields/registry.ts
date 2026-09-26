import type { ComponentType } from "react";
import type { FormInputType } from "@repo/shared";

import type { FieldProps } from "../form-context";
import {
  Checkboxes,
  Dropdown,
  MultipleChoice,
  Multiselect,
  PictureChoice,
  Ranking,
  YesNo,
} from "./choice";
import { Matrix, Nps, OpinionScale, Rating, Slider } from "./scale";
import { SignatureField } from "./signature";
import {
  AddressField,
  ColorField,
  ConsentField,
  CountryField,
  DateField,
  DateTimeField,
  NameField,
  TimeField,
} from "./structured";
import { EmailField, LongText, NumberField, PhoneField, ShortText, UrlField } from "./text";
import { UploadField } from "./upload";

export { CONTENT_BLOCKS } from "./content";

type Entry = {
  // Each control narrows its own answer shape; the block passes the stored value through.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<FieldProps<any>>;
  /** Several controls (or a radio group): a fieldset whose legend is the question. */
  group: boolean;
};

/** Every question type the public form renders (hidden fields never render). */
export const FIELD_REGISTRY = {
  short_text: { component: ShortText, group: false },
  long_text: { component: LongText, group: false },
  email: { component: EmailField, group: false },
  phone: { component: PhoneField, group: false },
  number: { component: NumberField, group: false },
  url: { component: UrlField, group: false },
  multiple_choice: { component: MultipleChoice, group: true },
  checkboxes: { component: Checkboxes, group: true },
  dropdown: { component: Dropdown, group: false },
  multiselect: { component: Multiselect, group: false },
  picture_choice: { component: PictureChoice, group: true },
  yes_no: { component: YesNo, group: true },
  rating: { component: Rating, group: true },
  opinion_scale: { component: OpinionScale, group: true },
  nps: { component: Nps, group: true },
  slider: { component: Slider, group: false },
  ranking: { component: Ranking, group: true },
  matrix: { component: Matrix, group: true },
  date: { component: DateField, group: false },
  time: { component: TimeField, group: false },
  datetime: { component: DateTimeField, group: false },
  file_upload: { component: UploadField, group: false },
  image_upload: { component: UploadField, group: false },
  signature: { component: SignatureField, group: false },
  name: { component: NameField, group: true },
  address: { component: AddressField, group: true },
  country: { component: CountryField, group: false },
  color: { component: ColorField, group: true },
  consent: { component: ConsentField, group: false },
} satisfies Record<Exclude<FormInputType, "hidden">, Entry>;
