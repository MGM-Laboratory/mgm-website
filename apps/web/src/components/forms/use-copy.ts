// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

"use client";

import { useContext } from "react";

import { FormContext } from "./form-context";

/** The form's copy when inside a running form (media also render on status screens). */
export function useFormCopyOptional() {
  return useContext(FormContext)?.copy ?? null;
}
