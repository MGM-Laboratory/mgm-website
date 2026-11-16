import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isFormSlug: vi.fn(),
  readFormToken: vi.fn(),
  fetchPublicForm: vi.fn(),
}));

vi.mock("@/lib/forms/public-server", () => mocks);

import { readPublicForm } from "./public-read";

beforeEach(() => {
  mocks.isFormSlug.mockReset();
  mocks.readFormToken.mockReset();
  mocks.fetchPublicForm.mockReset();
});

describe("readPublicForm", () => {
  it("skips the round trip for a slug that can never exist", async () => {
    mocks.isFormSlug.mockReturnValue(false);
    await expect(readPublicForm("Bad Slug")).resolves.toBeNull();
    expect(mocks.readFormToken).not.toHaveBeenCalled();
    expect(mocks.fetchPublicForm).not.toHaveBeenCalled();
  });

  it("fetches the form with the visitor's token", async () => {
    const payload = { state: "open", slug: "my-form" };
    mocks.isFormSlug.mockReturnValue(true);
    mocks.readFormToken.mockResolvedValue("tok");
    mocks.fetchPublicForm.mockResolvedValue(payload);
    await expect(readPublicForm("my-form")).resolves.toBe(payload);
    expect(mocks.fetchPublicForm).toHaveBeenCalledWith("my-form", "tok");
  });

  it("passes a missing token through and keeps a null answer", async () => {
    mocks.isFormSlug.mockReturnValue(true);
    mocks.readFormToken.mockResolvedValue(undefined);
    mocks.fetchPublicForm.mockResolvedValue(null);
    await expect(readPublicForm("my-form")).resolves.toBeNull();
    expect(mocks.fetchPublicForm).toHaveBeenCalledWith("my-form", undefined);
  });
});
