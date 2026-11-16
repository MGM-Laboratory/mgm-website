// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CmsEventsController } from "./cms-events.controller.js";

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
const LOADED = "2026-11-14T05:00:00.000Z";
const MEDIA_KEY = "event-open-house-0a1b2c3d-0a1b-4c3d-8e5f-0123456789ab.png";

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    slug: "open-house",
    title: "Open House",
    startAt: "2026-12-01T03:00:00.000Z",
    endAt: "2026-12-01T05:00:00.000Z",
    allDay: false,
    draft: false,
    ...overrides,
  };
}

function makeController() {
  const events = {
    all: vi.fn().mockResolvedValue([{ slug: "open-house", title: "Open House" }]),
    allIncludingDrafts: vi.fn().mockResolvedValue([{ slug: "draft", draft: true }]),
    bySlug: vi.fn().mockResolvedValue({
      slug: "open-house",
      title: "Open House",
      registrationEnabled: true,
      startAt: "2026-12-01T03:00:00.000Z",
      endAt: "2099-12-01T05:00:00.000Z",
      allDay: false,
    }),
    save: vi.fn().mockResolvedValue({ slug: "open-house", updatedAt: LOADED }),
    remove: vi.fn().mockResolvedValue(undefined),
    bootstrap: vi.fn().mockResolvedValue([{ slug: "open-house" }]),
  };
  const registrations = {
    all: vi.fn().mockResolvedValue([{ slug: "reg-1" }]),
    updateState: vi.fn().mockResolvedValue({ slug: "reg-1" }),
    bulk: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    create: vi.fn().mockResolvedValue({ ok: true }),
  };
  const storage = {
    uploadFile: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue("https://files.example.test/signed"),
  };
  const config = {
    getOrThrow: vi.fn().mockReturnValue(PASS),
    get: vi.fn().mockReturnValue("https://site.example.test"),
  };
  const mail = { sendEmail: vi.fn().mockResolvedValue(undefined) };
  const controller = new CmsEventsController(
    events as never,
    registrations as never,
    storage as never,
    config as never,
    mail as never,
  );
  return { controller, events, registrations, storage, config, mail };
}

function makeResponse() {
  return { setHeader: vi.fn(), send: vi.fn(), redirect: vi.fn().mockReturnValue("redirected") };
}

// No test may reach the network. A test that needs fetch replaces this guard with its own stub.
const fetchGuard = vi.fn().mockRejectedValue(new Error("No real request in a test."));

beforeEach(() => {
  fetchGuard.mockClear();
  vi.stubGlobal("fetch", fetchGuard);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CmsEventsController public reads", () => {
  it("lists the published events", async () => {
    const { controller } = makeController();

    await expect(controller.all()).resolves.toEqual({
      records: [{ slug: "open-house", title: "Open House" }],
    });
  });

  it("returns one event by slug", async () => {
    const { controller, events } = makeController();

    await expect(controller.one("open-house")).resolves.toMatchObject({
      record: { slug: "open-house" },
    });
    expect(events.bySlug).toHaveBeenCalledWith("open-house");
  });

  it("passes the 404 of a missing event through", async () => {
    const { controller, events } = makeController();
    events.bySlug.mockRejectedValue(new NotFoundException("Event not found"));

    await expect(controller.one("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("serves the whole calendar feed with cache headers", async () => {
    const { controller, events } = makeController();
    events.all.mockResolvedValue([
      {
        slug: "open-house",
        title: "Open House",
        startAt: "2026-12-01T03:00:00.000Z",
        endAt: "2026-12-01T05:00:00.000Z",
        allDay: false,
        updatedAt: LOADED,
      },
    ]);
    const response = makeResponse();

    await controller.ics(response as never);

    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "text/calendar; charset=utf-8");
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=900");
    expect(response.send.mock.calls[0]?.[0]).toContain("UID:open-house@events.labmgm.org");
  });

  it("serves one event as a download", async () => {
    const { controller, events } = makeController();
    events.bySlug.mockResolvedValue({
      slug: "open-house",
      title: "Open House",
      startAt: "2026-12-01T03:00:00.000Z",
      endAt: "2026-12-01T05:00:00.000Z",
      allDay: false,
      updatedAt: LOADED,
    });
    const response = makeResponse();

    await controller.singleIcs("open-house", response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="open-house.ics"',
    );
    expect(response.send.mock.calls[0]?.[0]).toContain("BEGIN:VEVENT");
  });
});

describe("CmsEventsController passphrase check", () => {
  it.each([
    ["allIncludingDrafts", (c: CmsEventsController, p?: string) => c.allIncludingDrafts(p)],
    ["registrationsInbox", (c: CmsEventsController, p?: string) => c.registrationsInbox(p)],
    [
      "registrationState",
      (c: CmsEventsController, p?: string) => c.registrationState("reg-1", { read: true }, p),
    ],
    [
      "registrationsBulk",
      (c: CmsEventsController, p?: string) =>
        c.registrationsBulk({ ids: ["a"], action: "archive" }, p),
    ],
    [
      "resolveMapsLink",
      (c: CmsEventsController, p?: string) => c.resolveMapsLink({ url: "https://x.test" }, p),
    ],
    ["bootstrap", (c: CmsEventsController, p?: string) => c.bootstrap({ records: [] }, p)],
    ["save", (c: CmsEventsController, p?: string) => c.save("open-house", validEvent(), p)],
    ["remove", (c: CmsEventsController, p?: string) => c.remove("open-house", p)],
    [
      "uploadMedia",
      (c: CmsEventsController, p?: string) => c.uploadMedia("open-house", { image: "x" }, p),
    ],
  ])("answers 401 for %s with no or a wrong passphrase", async (_name, call) => {
    const { controller, events, registrations, storage } = makeController();

    await expect(call(controller)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(call(controller, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(call(controller, `${PASS}x`)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(events.save).not.toHaveBeenCalled();
    expect(events.remove).not.toHaveBeenCalled();
    expect(registrations.bulk).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(fetchGuard).not.toHaveBeenCalled();
  });
});

describe("CmsEventsController admin reads", () => {
  it("lists events including drafts", async () => {
    const { controller } = makeController();

    await expect(controller.allIncludingDrafts(PASS)).resolves.toEqual({
      records: [{ slug: "draft", draft: true }],
    });
  });

  it("lists the registration inbox", async () => {
    const { controller } = makeController();

    await expect(controller.registrationsInbox(PASS)).resolves.toEqual({
      records: [{ slug: "reg-1" }],
    });
  });
});

describe("CmsEventsController registration admin", () => {
  it("updates the state of one registration", async () => {
    const { controller, registrations } = makeController();

    await expect(
      controller.registrationState("reg-1", { status: "archived" }, PASS),
    ).resolves.toEqual({ record: { slug: "reg-1" } });
    expect(registrations.updateState).toHaveBeenCalledWith("reg-1", { status: "archived" });
  });

  it("answers 400 when the state patch is empty or wrong", async () => {
    const { controller, registrations } = makeController();

    await expect(controller.registrationState("reg-1", {}, PASS)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      controller.registrationState("reg-1", { status: "spam" }, PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(registrations.updateState).not.toHaveBeenCalled();
  });

  it("runs a bulk action", async () => {
    const { controller, registrations } = makeController();

    await expect(
      controller.registrationsBulk({ ids: ["a", "b"], action: "delete" }, PASS),
    ).resolves.toEqual({ ok: true });
    expect(registrations.bulk).toHaveBeenCalledWith(["a", "b"], "delete");
  });

  it("answers 400 for a bulk action with no ids or an unknown action", async () => {
    const { controller, registrations } = makeController();

    await expect(
      controller.registrationsBulk({ ids: [], action: "delete" }, PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.registrationsBulk({ ids: ["a"], action: "explode" }, PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(registrations.bulk).not.toHaveBeenCalled();
  });
});

describe("CmsEventsController resolveMapsLink", () => {
  it("reads coordinates that sit in the link itself", async () => {
    const { controller } = makeController();

    await expect(
      controller.resolveMapsLink(
        { url: "https://www.google.com/maps/place/x/@-7.95,112.61,17z" },
        PASS,
      ),
    ).resolves.toEqual({ lat: -7.95, lng: 112.61 });
    await expect(
      controller.resolveMapsLink({ url: "https://maps.example.test/x!3d-7.9!4d112.6" }, PASS),
    ).resolves.toEqual({ lat: -7.9, lng: 112.6 });
    expect(fetchGuard).not.toHaveBeenCalled();
  });

  it("answers 400 when a plain link carries no coordinates", async () => {
    const { controller } = makeController();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      controller.resolveMapsLink({ url: "https://example.test/nothing" }, PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers 400 for an empty url", async () => {
    const { controller } = makeController();

    await expect(controller.resolveMapsLink({ url: "  " }, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("follows the redirects of a short link until the coordinates show up", async () => {
    const { controller } = makeController();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        headers: new Headers({ location: "https://www.google.com/maps/place/x" }),
      })
      .mockResolvedValueOnce({
        headers: new Headers({ location: "/maps/place/x/@-7.5,112.5,15z" }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      controller.resolveMapsLink({ url: "https://maps.app.goo.gl/abc" }, PASS),
    ).resolves.toEqual({ lat: -7.5, lng: 112.5 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("gives up when a short link stops redirecting without coordinates", async () => {
    const { controller } = makeController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ headers: new Headers() }));

    await expect(
      controller.resolveMapsLink({ url: "https://goo.gl/maps/abc" }, PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("gives up when the lookup of a short link fails", async () => {
    const { controller } = makeController();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    await expect(
      controller.resolveMapsLink({ url: "https://maps.app.goo.gl/abc" }, PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("stops after five hops of a redirect loop", async () => {
    const { controller } = makeController();
    const fetchSpy = vi.fn().mockResolvedValue({ headers: new Headers({ location: "/again" }) });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      controller.resolveMapsLink({ url: "https://maps.app.goo.gl/loop" }, PASS),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });
});

describe("CmsEventsController bootstrap and save", () => {
  it("seeds the events through the service", async () => {
    const { controller, events } = makeController();

    await expect(controller.bootstrap({ records: [validEvent()] }, PASS)).resolves.toEqual({
      records: [{ slug: "open-house" }],
    });
    expect(events.bootstrap).toHaveBeenCalledWith([
      expect.objectContaining({ slug: "open-house" }),
    ]);
  });

  it("answers 400 for an empty bootstrap list", async () => {
    const { controller, events } = makeController();

    await expect(controller.bootstrap({ records: [] }, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(events.bootstrap).not.toHaveBeenCalled();
  });

  it("saves a valid event with the version header", async () => {
    const { controller, events } = makeController();

    await controller.save("open-house", validEvent(), PASS, LOADED);

    expect(events.save).toHaveBeenCalledTimes(1);
    const [currentSlug, nextSlug, data, version] = events.save.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      Date,
    ];
    expect(currentSlug).toBe("open-house");
    expect(nextSlug).toBe("open-house");
    expect(data).toMatchObject({ timezoneOffset: 7, speakers: [], rundown: [], content: [] });
    expect(version).toEqual(new Date(LOADED));
  });

  it("saves without a version header", async () => {
    const { controller, events } = makeController();

    await controller.save("open-house", validEvent(), PASS);

    expect(events.save.mock.calls[0]?.[3]).toBeUndefined();
  });

  it("answers 400 for a bad version header", async () => {
    const { controller, events } = makeController();

    await expect(
      controller.save("open-house", validEvent(), PASS, "yesterday"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(events.save).not.toHaveBeenCalled();
  });

  it.each([
    ["a reserved slug", { slug: "admin" }, "That URL is reserved."],
    ["an upper case slug", { slug: "Open-House" }, "Use lowercase"],
    ["an empty title", { title: "  " }, "title"],
    ["a bad start", { startAt: "tomorrow" }, "startAt"],
    ["an end before the start", { endAt: "2026-11-30T00:00:00.000Z" }, "earlier"],
    ["an unsafe meeting link", { meetingLink: "javascript:alert(1)" }, "meetingLink"],
    ["an unsafe maps link", { mapsUrl: "//evil.test" }, "mapsUrl"],
    ["a latitude out of range", { mapsLat: 120 }, "mapsLat"],
    ["a fractional capacity", { registrationCapacity: 1.5 }, "registrationCapacity"],
  ])("answers 400 for %s", async (_name, overrides, message) => {
    const { controller, events } = makeController();

    const error = await controller
      .save("open-house", validEvent(overrides), PASS)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain(message);
    expect(events.save).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not an object", async () => {
    const { controller } = makeController();

    await expect(controller.save("open-house", null, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("answers 409 when the new slug belongs to another event", async () => {
    const { controller, events } = makeController();
    events.save.mockRejectedValue(new Error("CMS_EVENT_SLUG_CONFLICT"));

    await expect(controller.save("old", validEvent(), PASS)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("passes the 409 of a stale version and any other error through", async () => {
    const { controller, events } = makeController();
    events.save.mockRejectedValueOnce(new ConflictException("stale"));
    await expectRejection(
      controller.save("open-house", validEvent(), PASS, LOADED),
      ConflictException,
      "stale",
    );

    events.save.mockRejectedValueOnce(new Error("boom"));
    await expect(controller.save("open-house", validEvent(), PASS)).rejects.toThrow("boom");

    events.save.mockRejectedValueOnce("odd");
    await expect(controller.save("open-house", validEvent(), PASS)).rejects.toBe("odd");
  });

  it("removes an event", async () => {
    const { controller, events } = makeController();

    await expect(controller.remove("open-house", PASS)).resolves.toEqual({ ok: true });
    expect(events.remove).toHaveBeenCalledWith("open-house");
  });

  it("passes the 404 of a missing event on delete through", async () => {
    const { controller, events } = makeController();
    events.remove.mockRejectedValue(new NotFoundException("Event not found"));

    await expect(controller.remove("nope", PASS)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsEventsController media", () => {
  const png = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`;

  it("stores an upload under an event key and returns the key", async () => {
    const { controller, storage } = makeController();

    const result = await controller.uploadMedia("open-house", { image: png }, PASS);

    expect(result.key).toMatch(/^event-open-house-[0-9a-f-]{36}\.png$/);
    expect(storage.uploadFile).toHaveBeenCalledWith({
      body: Buffer.from("png-bytes"),
      contentType: "image/png",
      key: result.key,
    });
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ])("uses the %s extension", async (type, extension) => {
    const { controller } = makeController();
    const image = `data:${type};base64,${Buffer.from("x").toString("base64")}`;

    const result = await controller.uploadMedia("open-house", { image }, PASS);

    expect(result.key.endsWith(`.${extension}`)).toBe(true);
  });

  it.each([
    ["a body without an image", {}],
    ["a non image data url", { image: "data:text/plain;base64,aGk=" }],
    ["an unsupported image type", { image: "data:image/gif;base64,aGk=" }],
    ["a payload that is not base64 marked", { image: "data:image/png,aGk=" }],
    ["an empty payload", { image: "data:image/png;base64," }],
    ["a payload over 6 MB", { image: `data:image/png;base64,${"A".repeat(9 * 1024 * 1024)}` }],
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, storage } = makeController();

    await expect(controller.uploadMedia("open-house", body, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 when storage is not configured", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));

    await expectRejection(
      controller.uploadMedia("open-house", { image: png }, PASS),
      BadRequestException,
      "Media storage is not configured",
    );
  });

  it("redirects a valid key to a signed url", async () => {
    const { controller, storage } = makeController();
    const response = makeResponse();

    await expect(controller.media(MEDIA_KEY, response as never)).resolves.toBe("redirected");

    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(MEDIA_KEY, 900);
    expect(response.redirect).toHaveBeenCalledWith("https://files.example.test/signed");
  });

  it("answers 400 for a key outside the event namespace", async () => {
    const { controller, storage } = makeController();
    const response = makeResponse();

    await expect(controller.media("../secret.png", response as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.media("member-abc.png", response as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("answers 400 when signing fails", async () => {
    const { controller, storage } = makeController();
    storage.getSignedDownloadUrl.mockRejectedValue(new Error("no bucket"));

    await expectRejection(
      controller.media(MEDIA_KEY, makeResponse() as never),
      BadRequestException,
      "Media storage is not configured",
    );
  });
});

describe("CmsEventsController register", () => {
  const form = {
    agreedToTerms: true,
    fullName: "Ani Wijaya",
    email: "ani@example.test",
    phone: "081234567890",
  };

  it("stores the registration and sends a confirmation email", async () => {
    const { controller, registrations, mail } = makeController();

    await expect(controller.register("open-house", form)).resolves.toEqual({ ok: true });

    expect(registrations.create).toHaveBeenCalledWith({
      registration: expect.objectContaining({
        fullName: "Ani Wijaya",
        eventSlug: "open-house",
        eventTitle: "Open House",
        read: false,
        readAt: null,
        status: "inbox",
      }),
    });
    expect(mail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ani@example.test",
        subject: expect.stringContaining("registered"),
      }),
    );
  });

  it("still succeeds when the confirmation email fails", async () => {
    const { controller, mail } = makeController();
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    mail.sendEmail.mockRejectedValue(new Error("smtp down"));

    try {
      await expect(controller.register("open-house", form)).resolves.toEqual({ ok: true });
      await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    } finally {
      warn.mockRestore();
    }
  });

  it("falls back to the slug and defaults when the event record is sparse", async () => {
    const { controller, events, registrations, mail } = makeController();
    events.bySlug.mockResolvedValue({ registrationEnabled: true });

    await controller.register("sparse", form);

    expect(registrations.create).toHaveBeenCalledWith({
      registration: expect.objectContaining({ eventTitle: "sparse" }),
    });
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["terms not accepted", { ...form, agreedToTerms: false }],
    ["a bad email", { ...form, email: "nope" }],
    ["a short name", { ...form, fullName: "A" }],
    ["a short phone", { ...form, phone: "1" }],
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, registrations } = makeController();

    await expect(controller.register("open-house", body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(registrations.create).not.toHaveBeenCalled();
  });

  it("answers 400 when the body is missing", async () => {
    const { controller } = makeController();

    await expect(controller.register("open-house", undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("answers 400 when the event does not exist", async () => {
    const { controller, events, registrations } = makeController();
    events.bySlug.mockRejectedValue(new NotFoundException());

    await expectRejection(
      controller.register("nope", form),
      BadRequestException,
      "That event does not exist.",
    );
    expect(registrations.create).not.toHaveBeenCalled();
  });

  it("answers 409 when registration is closed", async () => {
    const { controller, events, registrations } = makeController();
    events.bySlug.mockResolvedValue({ registrationEnabled: false });

    await expect(controller.register("open-house", form)).rejects.toBeInstanceOf(ConflictException);
    expect(registrations.create).not.toHaveBeenCalled();
  });

  it("answers 409 when the event has ended", async () => {
    const { controller, events } = makeController();
    events.bySlug.mockResolvedValue({
      registrationEnabled: true,
      endAt: "2020-01-01T00:00:00.000Z",
      allDay: false,
    });

    await expectRejection(
      controller.register("open-house", form),
      ConflictException,
      "This event has already ended.",
    );
  });

  it("keeps an all day event open through its last day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T20:00:00.000Z"));
    const { controller, events } = makeController();
    events.bySlug.mockResolvedValue({
      registrationEnabled: true,
      endAt: "2026-12-01T00:00:00.000Z",
      allDay: true,
    });
    await expect(controller.register("open-house", form)).resolves.toEqual({ ok: true });

    vi.setSystemTime(new Date("2026-12-02T00:00:01.000Z"));
    await expect(controller.register("open-house", form)).rejects.toBeInstanceOf(ConflictException);
  });
});
