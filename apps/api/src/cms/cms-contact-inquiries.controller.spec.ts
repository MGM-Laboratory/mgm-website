import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsContactInquiriesController } from "./cms-contact-inquiries.controller.js";

/** Asserts the Nest exception class of a rejection and, when given, a part of its message. */
async function expectRejection(
  promise: Promise<unknown>,
  type: new (...args: never[]) => Error,
  message?: string,
) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(type);
  if (message !== undefined) expect((error as Error).message).toContain(message);
}

const PASS = "the-admin-passphrase";

function makeController() {
  const inquiries = {
    all: vi.fn().mockResolvedValue([{ slug: "inquiry-1" }]),
    updateState: vi.fn().mockResolvedValue({ slug: "inquiry-1" }),
    bulk: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue(PASS) };
  const controller = new CmsContactInquiriesController(inquiries as never, config as never);
  return { controller, inquiries };
}

describe("CmsContactInquiriesController", () => {
  it.each([
    ["all", (c: CmsContactInquiriesController, p?: string) => c.all(p)],
    ["state", (c: CmsContactInquiriesController, p?: string) => c.state("i", { read: true }, p)],
    [
      "bulk",
      (c: CmsContactInquiriesController, p?: string) =>
        c.bulk({ ids: ["a"], action: "archive" }, p),
    ],
  ])("answers 401 for %s with no or a wrong passphrase", async (_name, call) => {
    const { controller, inquiries } = makeController();

    await expect(call(controller)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(call(controller, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(inquiries.all).not.toHaveBeenCalled();
    expect(inquiries.updateState).not.toHaveBeenCalled();
    expect(inquiries.bulk).not.toHaveBeenCalled();
  });

  it("lists the inbox with the passphrase", async () => {
    const { controller } = makeController();

    await expect(controller.all(PASS)).resolves.toEqual({ records: [{ slug: "inquiry-1" }] });
  });

  it("updates the state of one inquiry", async () => {
    const { controller, inquiries } = makeController();

    await expect(controller.state("inquiry-1", { status: "archived" }, PASS)).resolves.toEqual({
      record: { slug: "inquiry-1" },
    });
    expect(inquiries.updateState).toHaveBeenCalledWith("inquiry-1", { status: "archived" });
  });

  it("answers 400 for an empty or wrong state patch", async () => {
    const { controller, inquiries } = makeController();

    await expectRejection(
      controller.state("i", {}, PASS),
      BadRequestException,
      "Nothing to update",
    );
    await expect(controller.state("i", { status: "spam" }, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(inquiries.updateState).not.toHaveBeenCalled();
  });

  it("passes the 404 of an unknown inquiry through", async () => {
    const { controller, inquiries } = makeController();
    inquiries.updateState.mockRejectedValue(new NotFoundException());

    await expect(controller.state("nope", { read: true }, PASS)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("runs a bulk action", async () => {
    const { controller, inquiries } = makeController();

    await expect(controller.bulk({ ids: ["a", "b"], action: "delete" }, PASS)).resolves.toEqual({
      ok: true,
    });
    expect(inquiries.bulk).toHaveBeenCalledWith(["a", "b"], "delete");
  });

  it("answers 400 for a bulk action with no ids, too many ids or an unknown action", async () => {
    const { controller, inquiries } = makeController();

    await expect(controller.bulk({ ids: [], action: "delete" }, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.bulk(
        { ids: Array.from({ length: 201 }, (_, index) => `i${index}`), action: "delete" },
        PASS,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.bulk({ ids: ["a"], action: "explode" }, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(inquiries.bulk).not.toHaveBeenCalled();
  });
});
