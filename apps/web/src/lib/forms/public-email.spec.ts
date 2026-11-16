// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import { emailSuggestion } from "./public-email";

describe("emailSuggestion", () => {
  it("fixes a domain one or two edits from a common one", () => {
    expect(emailSuggestion("ada@gmial.com")).toBe("ada@gmail.com");
    expect(emailSuggestion("ada@yaho.co.id")).toBe("ada@yahoo.co.id");
    expect(emailSuggestion("ada@hotmail.con")).toBe("ada@hotmail.com");
    expect(emailSuggestion("ada@gmaill.com")).toBe("ada@gmail.com");
    expect(emailSuggestion("ada@gnail.cm")).toBe("ada@gmail.com");
  });

  it("keeps the local part, including extra at signs", () => {
    expect(emailSuggestion("a.b+tag@gmial.com")).toBe("a.b+tag@gmail.com");
    expect(emailSuggestion("a@b@gmial.com")).toBe("a@b@gmail.com");
  });

  it("ignores case and spaces around the domain", () => {
    expect(emailSuggestion("ada@GMIAL.COM")).toBe("ada@gmail.com");
    expect(emailSuggestion("ada@ gmial.com ")).toBe("ada@gmail.com");
  });

  it("stays quiet for a known domain, an unrelated one or a malformed address", () => {
    expect(emailSuggestion("ada@gmail.com")).toBeNull();
    expect(emailSuggestion("ada@GMAIL.com")).toBeNull();
    expect(emailSuggestion("ada@student.ub.ac.id")).toBeNull();
    expect(emailSuggestion("ada@company.example")).toBeNull();
    expect(emailSuggestion("ada@localhost")).toBeNull();
    expect(emailSuggestion("no-at-sign")).toBeNull();
    expect(emailSuggestion("@gmial.com")).toBeNull();
    expect(emailSuggestion("")).toBeNull();
  });

  it("prefers the closest domain", () => {
    expect(emailSuggestion("ada@ub.ac.ig")).toBe("ada@ub.ac.id");
  });
});
