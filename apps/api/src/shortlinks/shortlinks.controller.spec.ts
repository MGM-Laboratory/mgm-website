import { HttpException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShortlinksController } from "./shortlinks.controller.js";
import { ShortlinksError } from "./shortlinks.service.js";

const PASS = "correct-passphrase";

function makeController() {
  const service = {
    cnameTarget: "edge.example.net",
    connectDomain: vi.fn(),
    createDomain: vi.fn(),
    createLink: vi.fn(),
    deleteDomain: vi.fn(),
    deleteLink: vi.fn(async () => undefined),
    linkAnalytics: vi.fn(),
    listDomains: vi.fn(async () => [{ id: "d1" }]),
    listLinks: vi.fn(async () => [{ id: "l1" }]),
    publicLinkState: vi.fn(async () => ({ status: "not_found" })),
    refreshDomain: vi.fn(),
    resolve: vi.fn(async () => ({ status: "not_found" })),
    routingHosts: vi.fn(async () => [{ hostname: "mgm.li", status: "connected" }]),
    updateLink: vi.fn(),
    verify: vi.fn(),
  };
  const config = { getOrThrow: () => PASS };
  return { controller: new ShortlinksController(service as never, config as never), service };
}

function request() {
  return { headers: { "user-agent": "curl/8" }, ip: "203.0.113.9" } as never;
}

async function status(work: Promise<unknown>) {
  const error = await work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return error instanceof HttpException
    ? { message: error.message, status: error.getStatus() }
    : error;
}

beforeEach(() => {
  process.env.ADMIN_PASSPHRASE = PASS;
});

describe("ShortlinksController public routes", () => {
  it("lists the routing hosts", async () => {
    const { controller } = makeController();
    expect(await controller.hosts()).toEqual({
      hosts: [{ hostname: "mgm.li", status: "connected" }],
    });
  });

  it("resolves with empty strings for missing query values and the visit details", async () => {
    const { controller, service } = makeController();
    await controller.resolve(undefined as never, undefined as never, request());
    expect(service.resolve).toHaveBeenCalledWith("", "", {
      ip: "203.0.113.9",
      referer: null,
      userAgent: "curl/8",
    });
  });

  it("passes the slug and host to the resolver", async () => {
    const { controller, service } = makeController();
    await controller.resolve("abc", "mgm.li", request());
    expect(service.resolve).toHaveBeenCalledWith("mgm.li", "abc", expect.any(Object));
  });

  it("reads the public state of a link", async () => {
    const { controller, service } = makeController();
    await controller.publicLinkState("abc", undefined as never, request());
    expect(service.publicLinkState).toHaveBeenCalledWith("", "abc", expect.any(Object));
    await controller.publicLinkState("abc", "mgm.li", request());
    expect(service.publicLinkState).toHaveBeenLastCalledWith("mgm.li", "abc", expect.any(Object));
  });
});

describe("ShortlinksController.verify", () => {
  const body = { host: "mgm.li", passphrase: "p", slug: "abc" };

  it("answers 400 naming the first bad field", async () => {
    const { controller } = makeController();
    expect(
      await status(controller.verify({ host: "", passphrase: "p", slug: "abc" }, request())),
    ).toEqual({
      message: "host: Too small: expected string to have >=1 characters",
      status: 400,
    });
    expect(
      await status(controller.verify({ host: "h", passphrase: "p", slug: "bad slug!" }, request())),
    ).toMatchObject({ status: 400 });
  });

  it("answers 404, 410 and 401 for the three refusals", async () => {
    const { controller, service } = makeController();
    service.verify.mockResolvedValueOnce(null);
    expect(await status(controller.verify(body, request()))).toMatchObject({ status: 404 });
    service.verify.mockResolvedValueOnce({ expired: true, longUrl: null });
    expect(await status(controller.verify(body, request()))).toMatchObject({ status: 410 });
    service.verify.mockResolvedValueOnce({ expired: false, longUrl: null, rejected: true });
    const rejected = await controller.verify(body, request()).catch((caught: unknown) => caught);
    expect(rejected).toBeInstanceOf(UnauthorizedException);
  });

  it("hands over the long URL on success", async () => {
    const { controller, service } = makeController();
    service.verify.mockResolvedValue({ expired: false, longUrl: "https://example.com" });
    expect(await controller.verify(body, request())).toEqual({ longUrl: "https://example.com" });
    expect(service.verify).toHaveBeenCalledWith("mgm.li", "abc", "p", expect.any(Object));
  });
});

describe("ShortlinksController admin guard", () => {
  it("answers 401 for a missing or wrong passphrase on every admin route", async () => {
    const { controller } = makeController();
    const calls: Array<(pass?: string) => Promise<unknown>> = [
      (pass) => controller.adminDomains(pass),
      (pass) => controller.adminCreateDomain({ hostname: "mgm.li" }, pass),
      (pass) => controller.adminDomainStatus("d", pass),
      (pass) => controller.adminConnectDomain("d", pass),
      (pass) => controller.adminDeleteDomain("d", pass),
      (pass) => controller.adminLinks("", "", pass),
      (pass) => controller.adminCreateLink({}, pass),
      (pass) => controller.adminUpdateLink("l", {}, pass),
      (pass) => controller.adminDeleteLink("l", pass),
      (pass) => controller.adminLinkAnalytics("l", pass),
    ];
    for (const call of calls) {
      await expect(call(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(call("wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });
});

describe("ShortlinksController admin domains", () => {
  it("lists domains with the CNAME target", async () => {
    const { controller } = makeController();
    expect(await controller.adminDomains(PASS)).toEqual({
      cnameTarget: "edge.example.net",
      domains: [{ id: "d1" }],
    });
  });

  it("creates a domain and turns a service refusal into its status", async () => {
    const { controller, service } = makeController();
    service.createDomain.mockResolvedValueOnce({ domain: { id: "d2" } });
    expect(await controller.adminCreateDomain({ hostname: " mgm.li " }, PASS)).toEqual({
      domain: { id: "d2" },
    });
    expect(service.createDomain).toHaveBeenCalledWith("mgm.li");
    service.createDomain.mockRejectedValueOnce(new ShortlinksError("already added", 409));
    expect(await status(controller.adminCreateDomain({ hostname: "mgm.li" }, PASS))).toEqual({
      message: "already added",
      status: 409,
    });
    expect(await status(controller.adminCreateDomain({ hostname: "" }, PASS))).toMatchObject({
      status: 400,
    });
  });

  it("lets an unexpected service error stay a 500", async () => {
    const { controller, service } = makeController();
    const failure = new Error("boom");
    service.createDomain.mockRejectedValueOnce(failure);
    expect(await status(controller.adminCreateDomain({ hostname: "mgm.li" }, PASS))).toBe(failure);
  });

  it("answers 404 for an unknown domain on status, connect and delete", async () => {
    const { controller, service } = makeController();
    service.refreshDomain.mockResolvedValueOnce(null);
    expect(await status(controller.adminDomainStatus("x", PASS))).toMatchObject({ status: 404 });
    service.connectDomain.mockResolvedValueOnce(null);
    expect(await status(controller.adminConnectDomain("x", PASS))).toMatchObject({ status: 404 });
    service.deleteDomain.mockResolvedValueOnce(false);
    expect(await status(controller.adminDeleteDomain("x", PASS))).toMatchObject({ status: 404 });
  });

  it("returns the refreshed domain, the connect result and ok for a delete", async () => {
    const { controller, service } = makeController();
    service.refreshDomain.mockResolvedValue({ checks: {}, domain: { id: "d" } });
    expect(await controller.adminDomainStatus("d", PASS)).toEqual({
      checks: {},
      domain: { id: "d" },
    });
    service.connectDomain.mockResolvedValue({ records: {}, url: null });
    expect(await controller.adminConnectDomain("d", PASS)).toEqual({ records: {}, url: null });
    service.deleteDomain.mockResolvedValue(true);
    expect(await controller.adminDeleteDomain("d", PASS)).toEqual({ ok: true });
  });

  it("maps a refusal while connecting or deleting to its status", async () => {
    const { controller, service } = makeController();
    service.connectDomain.mockRejectedValueOnce(new ShortlinksError("no target", 409));
    expect(await status(controller.adminConnectDomain("d", PASS))).toMatchObject({ status: 409 });
    service.deleteDomain.mockRejectedValueOnce(new ShortlinksError("has links", 409));
    expect(await status(controller.adminDeleteDomain("d", PASS))).toMatchObject({ status: 409 });
  });
});

describe("ShortlinksController admin links", () => {
  it("clips the search text and ignores array query values", async () => {
    const { controller, service } = makeController();
    await controller.adminLinks("x".repeat(300), "d1", PASS);
    expect(service.listLinks).toHaveBeenLastCalledWith("x".repeat(200), "d1");
    await controller.adminLinks(["a", "b"] as never, ["d"] as never, PASS);
    expect(service.listLinks).toHaveBeenLastCalledWith(undefined, undefined);
    expect(await controller.adminLinks("", "", PASS)).toEqual({ links: [{ id: "l1" }] });
  });

  it("creates a link with the defaults filled in and an empty slug dropped", async () => {
    const { controller, service } = makeController();
    service.createLink.mockResolvedValue({ id: "l1" });
    expect(
      await controller.adminCreateLink(
        { domainId: "d1", longUrl: " https://example.com/a ", slug: "" },
        PASS,
      ),
    ).toEqual({ link: { id: "l1" } });
    expect(service.createLink).toHaveBeenCalledWith({
      domainId: "d1",
      expiresIn: "never",
      longUrl: "https://example.com/a",
      slug: undefined,
    });
  });

  it("refuses a link body that is not valid", async () => {
    const { controller } = makeController();
    for (const bad of [
      { domainId: "d1", longUrl: "ftp://example.com" },
      { domainId: "d1", longUrl: "not a url" },
      { domainId: "d1", longUrl: `https://e.com/${"a".repeat(2000)}` },
      { domainId: "d1", longUrl: "https://e.com", slug: "bad slug" },
      { domainId: "d1", expiresIn: "1y", longUrl: "https://e.com" },
      { domainId: "", longUrl: "https://e.com" },
    ]) {
      expect(await status(controller.adminCreateLink(bad, PASS))).toMatchObject({ status: 400 });
    }
  });

  it("maps a service refusal on create to its status", async () => {
    const { controller, service } = makeController();
    service.createLink.mockRejectedValue(new ShortlinksError("taken", 409));
    expect(
      await status(controller.adminCreateLink({ domainId: "d", longUrl: "https://e.com" }, PASS)),
    ).toMatchObject({ status: 409 });
  });

  it("updates a link with keep as the default passphrase action", async () => {
    const { controller, service } = makeController();
    service.updateLink.mockResolvedValue({ id: "l1" });
    expect(await controller.adminUpdateLink("l1", { slug: "new" }, PASS)).toEqual({
      link: { id: "l1" },
    });
    expect(service.updateLink).toHaveBeenCalledWith("l1", {
      passphraseAction: "keep",
      slug: "new",
    });
  });

  it("answers 404 when the link to update does not exist and 400 for a bad action", async () => {
    const { controller, service } = makeController();
    service.updateLink.mockResolvedValue(null);
    expect(await status(controller.adminUpdateLink("x", {}, PASS))).toMatchObject({ status: 404 });
    expect(
      await status(controller.adminUpdateLink("x", { passphraseAction: "wipe" }, PASS)),
    ).toMatchObject({ status: 400 });
  });

  it("deletes a link and answers ok", async () => {
    const { controller, service } = makeController();
    expect(await controller.adminDeleteLink("l1", PASS)).toEqual({ ok: true });
    expect(service.deleteLink).toHaveBeenCalledWith("l1");
  });

  it("returns analytics or 404", async () => {
    const { controller, service } = makeController();
    service.linkAnalytics.mockResolvedValueOnce(null);
    expect(await status(controller.adminLinkAnalytics("x", PASS))).toMatchObject({ status: 404 });
    service.linkAnalytics.mockResolvedValueOnce({ totals: {} });
    expect(await controller.adminLinkAnalytics("l1", PASS)).toEqual({ totals: {} });
  });
});
