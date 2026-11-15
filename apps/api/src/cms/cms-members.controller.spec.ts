import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CmsMembersController } from "./cms-members.controller.js";

const PASS = "the-admin-passphrase";
const LOADED = "2026-11-14T05:00:00.000Z";
const MEDIA_KEY = "member-ani-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";

function validMember(overrides: Record<string, unknown> = {}) {
  return {
    accent: "blue",
    bio: "Bio",
    division: "Web",
    group: "Core",
    hasPortrait: false,
    labFocus: ["web"],
    name: "Ani",
    role: "Member",
    slug: "ani",
    ...overrides,
  };
}

function validDocument(
  member: Record<string, unknown> = {},
  profile: Record<string, unknown> = {},
) {
  return { member: validMember(member), profile };
}

function makeController() {
  const members = {
    all: vi.fn().mockResolvedValue([{ slug: "ani" }]),
    save: vi.fn().mockResolvedValue({ slug: "ani", updatedAt: LOADED }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const storage = {
    uploadFile: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue("https://files.example.test/signed"),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue(PASS) };
  const controller = new CmsMembersController(members as never, storage as never, config as never);
  return { controller, members, storage };
}

function makeResponse() {
  return { redirect: vi.fn().mockReturnValue("redirected") };
}

describe("CmsMembersController public reads", () => {
  it("lists the members", async () => {
    const { controller } = makeController();

    await expect(controller.all()).resolves.toEqual({ records: [{ slug: "ani" }] });
  });

  it("redirects a portrait key to a signed url", async () => {
    const { controller, storage } = makeController();

    await expect(controller.media(MEDIA_KEY, makeResponse() as never)).resolves.toBe("redirected");
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(MEDIA_KEY, 900);
  });

  it("answers 400 for a key outside the portrait namespace", async () => {
    const { controller, storage } = makeController();

    await expect(controller.media("cv-1.pdf", makeResponse() as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.media("../member-x.png", makeResponse() as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("answers 400 when signing fails", async () => {
    const { controller, storage } = makeController();
    storage.getSignedDownloadUrl.mockRejectedValue(new Error("no bucket"));

    await expect(controller.media(MEDIA_KEY, makeResponse() as never)).rejects.toThrow(
      "Media storage is not configured",
    );
  });
});

describe("CmsMembersController passphrase check", () => {
  it.each([
    ["save", (c: CmsMembersController, p?: string) => c.save("ani", validDocument(), p)],
    ["remove", (c: CmsMembersController, p?: string) => c.remove("ani", p)],
    [
      "uploadPhoto",
      (c: CmsMembersController, p?: string) => c.uploadPhoto("ani", { image: "x" }, p),
    ],
  ])("answers 401 for %s with no or a wrong passphrase", async (_name, call) => {
    const { controller, members, storage } = makeController();

    await expect(call(controller)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(call(controller, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(members.save).not.toHaveBeenCalled();
    expect(members.remove).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
});

describe("CmsMembersController save", () => {
  it("saves a valid member with the version header and defaults highlighted to false", async () => {
    const { controller, members } = makeController();

    await controller.save(
      "ani",
      {
        ...validDocument({ nickname: "A", unit: "U" }, { links: [{ url: "https://x.test" }] }),
        sourceSlug: "ani",
      },
      PASS,
      LOADED,
    );

    const [current, next, data, version] = members.save.mock.calls[0] as [
      string,
      string,
      { member: { slug: string; highlighted: boolean } },
      Date,
    ];
    expect([current, next, data.member.slug]).toEqual(["ani", "ani", "ani"]);
    expect(data.member.highlighted).toBe(false);
    expect(version).toEqual(new Date(LOADED));
  });

  it("saves without a version header", async () => {
    const { controller, members } = makeController();

    await controller.save("ani", validDocument(), PASS);

    expect(members.save.mock.calls[0]?.[3]).toBeUndefined();
  });

  it("answers 400 for a bad version header", async () => {
    const { controller, members } = makeController();

    await expect(controller.save("ani", validDocument(), PASS, "later")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(members.save).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown accent", validDocument({ accent: "pink" }), "member.accent"],
    ["an empty name", validDocument({ name: "" }), "member.name"],
    ["an empty slug", validDocument({ slug: "" }), "member.slug"],
    [
      "a profile link with an unsafe scheme",
      validDocument({}, { links: [{ url: "javascript:alert(1)" }] }),
      "profile.links.0.url",
    ],
    [
      "a certificate link with an unsafe scheme",
      validDocument({}, { certificates: [{ credentialUrl: "data:text/html,x" }] }),
      "profile.certificates.0.credentialUrl",
    ],
    ["a profile that is too large", validDocument({}, { bio: "x".repeat(200_001) }), "too large"],
  ])("answers 400 for %s", async (_name, body, message) => {
    const { controller, members } = makeController();

    const error = await controller.save("ani", body, PASS).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain(message);
    expect(members.save).not.toHaveBeenCalled();
  });

  it("answers 400 with a generic message when the body is not an object", async () => {
    const { controller } = makeController();

    const error = await controller.save("ani", null, PASS).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).not.toMatch(/^: /);
  });

  it("answers 409 for a slug in use and for an ambiguous rename", async () => {
    const { controller, members } = makeController();

    members.save.mockRejectedValueOnce(new Error("CMS_MEMBER_SLUG_CONFLICT"));
    await expect(controller.save("old", validDocument(), PASS)).rejects.toThrow(
      "That profile URL is already in use.",
    );

    members.save.mockRejectedValueOnce(new Error("CMS_MEMBER_AMBIGUOUS_RENAME"));
    await expect(controller.save("old", validDocument(), PASS)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("passes the 409 of a stale version and any other error through", async () => {
    const { controller, members } = makeController();
    members.save.mockRejectedValueOnce(new ConflictException("stale"));
    await expect(controller.save("ani", validDocument(), PASS, LOADED)).rejects.toThrow("stale");

    members.save.mockRejectedValueOnce(new Error("boom"));
    await expect(controller.save("ani", validDocument(), PASS)).rejects.toThrow("boom");

    members.save.mockRejectedValueOnce("odd");
    await expect(controller.save("ani", validDocument(), PASS)).rejects.toBe("odd");
  });

  it("removes a member and passes the 404 through", async () => {
    const { controller, members } = makeController();

    await expect(controller.remove("ani", PASS)).resolves.toEqual({ ok: true });
    expect(members.remove).toHaveBeenCalledWith("ani");

    members.remove.mockRejectedValue(new NotFoundException());
    await expect(controller.remove("nope", PASS)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsMembersController uploadPhoto", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ])("stores a %s portrait as .%s", async (type, extension) => {
    const { controller, storage } = makeController();
    const image = `data:${type};base64,${Buffer.from("x").toString("base64")}`;

    const { key } = await controller.uploadPhoto("ani", { image }, PASS);

    expect(key).toMatch(new RegExp(`^member-ani-[0-9a-f-]{36}\\.${extension}$`));
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: type, key }),
    );
  });

  it("replaces unsafe characters of the slug and keeps a key that the media route accepts", async () => {
    const { controller } = makeController();
    const image = `data:image/png;base64,${Buffer.from("x").toString("base64")}`;

    const { key } = await controller.uploadPhoto("Ani W/../x", { image }, PASS);

    expect(key).toMatch(/^member-Ani-W----x-[0-9a-f-]{36}\.png$/);
    const response = makeResponse();
    await expect(controller.media(key, response as never)).resolves.toBe("redirected");
  });

  it.each([
    ["an unsupported type", { image: "data:image/gif;base64,aGk=" }],
    ["an empty payload", { image: "data:image/png;base64," }],
    ["a payload over 6 MB", { image: `data:image/png;base64,${"A".repeat(9 * 1024 * 1024)}` }],
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, storage } = makeController();

    await expect(controller.uploadPhoto("ani", body, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("rejects a body without an image or with a data url that is not an image", async () => {
    const { controller, storage } = makeController();

    await expect(controller.uploadPhoto("ani", {}, PASS)).rejects.toThrow();
    await expect(
      controller.uploadPhoto("ani", { image: "data:text/plain;base64,aGk=" }, PASS),
    ).rejects.toThrow();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("lets a storage failure through, since the route has no friendly answer for it", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));
    const image = `data:image/png;base64,${Buffer.from("x").toString("base64")}`;

    await expect(controller.uploadPhoto("ani", { image }, PASS)).rejects.toThrow("no bucket");
  });
});
