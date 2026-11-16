// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import { pathFromMessage } from "./builder-save";

describe("pathFromMessage", () => {
  it("pulls a field path out of an API message", () => {
    expect(pathFromMessage("fields.3.options.0.label: Too long")).toBe("fields.3.options.0.label");
    expect(pathFromMessage("Invalid document at fields.12.label (max 200)")).toBe(
      "fields.12.label",
    );
    expect(pathFromMessage("fields.3 is wrong")).toBe("fields.3");
  });

  it("reads endings, welcome, design and settings paths", () => {
    expect(pathFromMessage("endings.0.title is too long")).toBe("endings.0.title");
    expect(pathFromMessage("welcome.buttonLabel: required")).toBe("welcome.buttonLabel");
    expect(pathFromMessage("design.layout is invalid")).toBe("design.layout");
    expect(pathFromMessage("settings.notifyEmails.1: bad email")).toBe("settings.notifyEmails.1");
  });

  it("needs a part after welcome, design and settings", () => {
    expect(pathFromMessage("The settings are wrong")).toBeUndefined();
    expect(pathFromMessage("design is wrong")).toBeUndefined();
  });

  it("returns nothing when the message names no path", () => {
    expect(pathFromMessage("The form could not be saved.")).toBeUndefined();
    expect(pathFromMessage("")).toBeUndefined();
    expect(pathFromMessage("fieldsets.1 is not a path")).toBeUndefined();
  });

  it("stops at the first path and keeps every following part", () => {
    expect(pathFromMessage("fields.1.rowsList.2.label and fields.5.label")).toBe(
      "fields.1.rowsList.2.label",
    );
    // The matcher state is reset between calls
    expect(pathFromMessage("fields.7.label")).toBe("fields.7.label");
    expect(pathFromMessage("fields.7.label")).toBe("fields.7.label");
  });
});
