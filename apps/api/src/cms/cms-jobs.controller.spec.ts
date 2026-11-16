import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CmsJobsController } from "./cms-jobs.controller.js";

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
const MEDIA_KEY = "job-designer-0b6a1c52-3f2e-4d7a-9a1b-5c0d8e2f4a61.png";

function validJob(overrides: Record<string, unknown> = {}) {
  return {
    job: {
      slug: "designer",
      title: "Designer",
      focus: "Product design",
      commitment: "part-time",
      mode: "hybrid",
      deadline: "2099-01-01",
      perks: ["Mentoring"],
      status: "published",
      ...overrides,
    },
    content: [],
  };
}

function makeController() {
  const jobs = {
    all: vi.fn().mockResolvedValue([{ slug: "designer" }]),
    allIncludingDrafts: vi.fn().mockResolvedValue([{ slug: "designer" }, { slug: "draft" }]),
    bySlug: vi.fn().mockResolvedValue({
      slug: "designer",
      job: { title: "Designer", status: "published", deadline: "2099-01-01" },
    }),
    save: vi.fn().mockResolvedValue({ slug: "designer", updatedAt: LOADED }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const applications = {
    all: vi.fn().mockResolvedValue([{ slug: "app-1" }]),
    bySlug: vi.fn().mockResolvedValue({ slug: "app-1", application: { cvKey: "cv-1.pdf" } }),
    updateState: vi.fn().mockResolvedValue({ slug: "app-1" }),
    bulk: vi.fn().mockResolvedValue({ deletedCount: 0, deletedCvKeys: [] }),
    create: vi.fn().mockResolvedValue({ ok: true }),
  };
  const storage = {
    uploadFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue("https://files.example.test/signed"),
  };
  const config = {
    getOrThrow: vi.fn().mockReturnValue(PASS),
    get: vi.fn().mockReturnValue("https://site.example.test"),
  };
  const mail = { sendEmail: vi.fn().mockResolvedValue(undefined) };
  const controller = new CmsJobsController(
    jobs as never,
    applications as never,
    storage as never,
    config as never,
    mail as never,
  );
  return { controller, jobs, applications, storage, config, mail };
}

function makeResponse() {
  return { redirect: vi.fn().mockReturnValue("redirected") };
}

const form = {
  applicantType: "general",
  fullName: "Ani Wijaya",
  email: "ani@example.test",
  phoneCountry: "+62",
  phoneNumber: "812 3456 7890",
  motivation: "I would like to join the laboratory.",
  agreedToTerms: "true",
};

function pdf(overrides: Record<string, unknown> = {}) {
  return {
    mimetype: "application/pdf",
    size: 1000,
    buffer: Buffer.from("pdf"),
    originalname: "cv.pdf",
    ...overrides,
  } as never;
}

beforeEach(() => {
  // The limit must not depend on the shell that runs the tests.
  vi.stubEnv("CMS_MAX_CV_BYTES", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CmsJobsController public reads", () => {
  it("lists open roles and returns one role", async () => {
    const { controller, jobs } = makeController();

    await expect(controller.all()).resolves.toEqual({ records: [{ slug: "designer" }] });
    await expect(controller.one("designer")).resolves.toMatchObject({
      record: { slug: "designer" },
    });
    expect(jobs.bySlug).toHaveBeenCalledWith("designer");
  });

  it("passes the 404 of a missing role through", async () => {
    const { controller, jobs } = makeController();
    jobs.bySlug.mockRejectedValue(new NotFoundException());

    await expect(controller.one("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsJobsController passphrase check", () => {
  it.each([
    ["allIncludingDrafts", (c: CmsJobsController, p?: string) => c.allIncludingDrafts(p)],
    ["applications", (c: CmsJobsController, p?: string) => c.applications(p)],
    ["application", (c: CmsJobsController, p?: string) => c.application("app-1", p)],
    [
      "applicationState",
      (c: CmsJobsController, p?: string) => c.applicationState("app-1", { read: true }, p),
    ],
    [
      "applicationsBulk",
      (c: CmsJobsController, p?: string) => c.applicationsBulk({ ids: ["a"], action: "delete" }, p),
    ],
    ["save", (c: CmsJobsController, p?: string) => c.save("designer", validJob(), p)],
    ["remove", (c: CmsJobsController, p?: string) => c.remove("designer", p)],
    [
      "uploadMedia",
      (c: CmsJobsController, p?: string) => c.uploadMedia("designer", { image: "x" }, p),
    ],
  ])("answers 401 for %s with no or a wrong passphrase", async (_name, call) => {
    const { controller, jobs, applications, storage } = makeController();

    await expect(call(controller)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(call(controller, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jobs.save).not.toHaveBeenCalled();
    expect(jobs.remove).not.toHaveBeenCalled();
    expect(applications.bulk).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
});

describe("CmsJobsController admin reads", () => {
  it("lists roles including drafts and the application inbox", async () => {
    const { controller } = makeController();

    await expect(controller.allIncludingDrafts(PASS)).resolves.toEqual({
      records: [{ slug: "designer" }, { slug: "draft" }],
    });
    await expect(controller.applications(PASS)).resolves.toEqual({ records: [{ slug: "app-1" }] });
  });

  it("returns one application with a signed CV url", async () => {
    const { controller, storage } = makeController();

    await expect(controller.application("app-1", PASS)).resolves.toEqual({
      record: { slug: "app-1", application: { cvKey: "cv-1.pdf" } },
      cvUrl: "https://files.example.test/signed",
    });
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith("cv-1.pdf", 900);
  });

  it("returns a null CV url when there is no key or signing fails", async () => {
    const { controller, applications, storage } = makeController();
    applications.bySlug.mockResolvedValue({ slug: "app-1", application: {} });
    await expect(controller.application("app-1", PASS)).resolves.toMatchObject({ cvUrl: null });
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();

    applications.bySlug.mockResolvedValue({ slug: "app-1", application: { cvKey: "cv-1.pdf" } });
    storage.getSignedDownloadUrl.mockRejectedValue(new Error("no bucket"));
    await expect(controller.application("app-1", PASS)).resolves.toMatchObject({ cvUrl: null });
  });

  it("passes the 404 of an unknown application through", async () => {
    const { controller, applications } = makeController();
    applications.bySlug.mockRejectedValue(new NotFoundException());

    await expect(controller.application("nope", PASS)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsJobsController application admin", () => {
  it("updates the state of one application", async () => {
    const { controller, applications } = makeController();

    await expect(
      controller.applicationState("app-1", { status: "archived" }, PASS),
    ).resolves.toEqual({ record: { slug: "app-1" } });
    expect(applications.updateState).toHaveBeenCalledWith("app-1", { status: "archived" });
  });

  it("rejects an empty or wrong state patch", async () => {
    const { controller, applications } = makeController();

    await expect(controller.applicationState("app-1", {}, PASS)).rejects.toThrow();
    await expect(controller.applicationState("app-1", { status: "spam" }, PASS)).rejects.toThrow();
    expect(applications.updateState).not.toHaveBeenCalled();
  });

  it("runs a bulk action and removes the CVs of deleted applications", async () => {
    const { controller, applications, storage } = makeController();
    applications.bulk.mockResolvedValue({
      deletedCount: 2,
      deletedCvKeys: ["cv-1.pdf", "cv-2.pdf"],
    });
    storage.deleteFile.mockRejectedValueOnce(new Error("gone"));

    await expect(
      controller.applicationsBulk({ ids: ["a", "b"], action: "delete" }, PASS),
    ).resolves.toEqual({ ok: true });

    expect(applications.bulk).toHaveBeenCalledWith(["a", "b"], "delete");
    expect(storage.deleteFile).toHaveBeenCalledTimes(2);
  });

  it("rejects a bulk action with no ids or an unknown action", async () => {
    const { controller, applications } = makeController();

    await expect(
      controller.applicationsBulk({ ids: [], action: "delete" }, PASS),
    ).rejects.toThrow();
    await expect(
      controller.applicationsBulk({ ids: ["a"], action: "explode" }, PASS),
    ).rejects.toThrow();
    expect(applications.bulk).not.toHaveBeenCalled();
  });
});

describe("CmsJobsController save and remove", () => {
  it("saves a valid role with the version header", async () => {
    const { controller, jobs } = makeController();

    await controller.save("designer", { ...validJob(), sourceSlug: "designer" }, PASS, LOADED);

    const [current, next, data, version] = jobs.save.mock.calls[0] as [
      string,
      string,
      { job: { slug: string } },
      Date,
    ];
    expect([current, next, data.job.slug]).toEqual(["designer", "designer", "designer"]);
    expect(version).toEqual(new Date(LOADED));
  });

  it("saves without a version header", async () => {
    const { controller, jobs } = makeController();

    await controller.save("designer", validJob(), PASS);

    expect(jobs.save.mock.calls[0]?.[3]).toBeUndefined();
  });

  it("answers 400 for a bad version header", async () => {
    const { controller, jobs } = makeController();

    await expect(controller.save("designer", validJob(), PASS, "later")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jobs.save).not.toHaveBeenCalled();
  });

  it.each([
    ["a reserved slug", { slug: "applications" }],
    ["a bad slug", { slug: "Not A Slug" }],
    ["an empty title", { title: " " }],
    ["an unknown commitment", { commitment: "forever" }],
    ["a bad deadline", { deadline: "01/01/2099" }],
    ["too many perks", { perks: Array.from({ length: 9 }, (_, index) => `perk ${index}`) }],
    ["an unknown status", { status: "paused" }],
  ])("rejects %s and saves nothing", async (_name, overrides) => {
    const { controller, jobs } = makeController();

    await expect(controller.save("designer", validJob(overrides), PASS)).rejects.toThrow();
    expect(jobs.save).not.toHaveBeenCalled();
  });

  it("answers 409 when the new slug belongs to another role", async () => {
    const { controller, jobs } = makeController();
    jobs.save.mockRejectedValue(new Error("CMS_JOB_SLUG_CONFLICT"));

    await expect(controller.save("old", validJob(), PASS)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("passes the 409 of a stale version and any other error through", async () => {
    const { controller, jobs } = makeController();
    jobs.save.mockRejectedValueOnce(new ConflictException("stale"));
    await expectRejection(
      controller.save("designer", validJob(), PASS, LOADED),
      ConflictException,
      "stale",
    );

    jobs.save.mockRejectedValueOnce(new Error("boom"));
    await expect(controller.save("designer", validJob(), PASS)).rejects.toThrow("boom");

    jobs.save.mockRejectedValueOnce("odd");
    await expect(controller.save("designer", validJob(), PASS)).rejects.toBe("odd");
  });

  it("removes a role and passes the 404 through", async () => {
    const { controller, jobs } = makeController();

    await expect(controller.remove("designer", PASS)).resolves.toEqual({ ok: true });
    expect(jobs.remove).toHaveBeenCalledWith("designer");

    jobs.remove.mockRejectedValue(new NotFoundException());
    await expect(controller.remove("nope", PASS)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CmsJobsController media", () => {
  const png = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;

  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ])("stores a %s upload as .%s", async (type, extension) => {
    const { controller, storage } = makeController();
    const image = `data:${type};base64,${Buffer.from("x").toString("base64")}`;

    const { key } = await controller.uploadMedia("designer", { image }, PASS);

    expect(key).toMatch(new RegExp(`^job-designer-[0-9a-f-]{36}\\.${extension}$`));
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: type, key }),
    );
  });

  it.each([
    ["an unsupported type", { image: "data:image/gif;base64,aGk=" }],
    ["an empty payload", { image: "data:image/png;base64," }],
    ["a payload over 6 MB", { image: `data:image/png;base64,${"A".repeat(9 * 1024 * 1024)}` }],
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, storage } = makeController();

    await expect(controller.uploadMedia("designer", body, PASS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("rejects a body without an image", async () => {
    const { controller } = makeController();

    await expect(controller.uploadMedia("designer", {}, PASS)).rejects.toThrow();
  });

  it("answers 400 when storage is not configured", async () => {
    const { controller, storage } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));

    await expectRejection(
      controller.uploadMedia("designer", { image: png }, PASS),
      BadRequestException,
      "Media storage is not configured",
    );
  });

  it("redirects a valid key and refuses another namespace", async () => {
    const { controller, storage } = makeController();
    const response = makeResponse();

    await expect(controller.media(MEDIA_KEY, response as never)).resolves.toBe("redirected");
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(MEDIA_KEY, 900);

    await expect(controller.media("cv-1.pdf", response as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.media("../x.png", response as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
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

describe("CmsJobsController apply", () => {
  it("stores the CV and the application and sends a confirmation email", async () => {
    const { controller, applications, storage, mail } = makeController();

    await expect(controller.apply("designer", pdf(), form)).resolves.toEqual({ ok: true });

    const upload = storage.uploadFile.mock.calls[0]?.[0] as { key: string; contentType: string };
    expect(upload.key).toMatch(/^cv-[0-9a-f-]{36}\.pdf$/);
    expect(upload.contentType).toBe("application/pdf");
    expect(applications.create).toHaveBeenCalledWith({
      application: expect.objectContaining({
        fullName: "Ani Wijaya",
        jobSlug: "designer",
        jobTitle: "Designer",
        cvKey: upload.key,
        cvFilename: "cv.pdf",
        read: false,
        status: "inbox",
      }),
    });
    expect(mail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ani@example.test" }),
    );
  });

  it.each([
    ["application/msword", "doc"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ])("accepts %s as .%s", async (mimetype, extension) => {
    const { controller, storage } = makeController();

    await controller.apply("designer", pdf({ mimetype }), form);

    expect(
      (storage.uploadFile.mock.calls[0]?.[0] as { key: string }).key.endsWith(`.${extension}`),
    ).toBe(true);
  });

  it("strips path characters from the original filename and falls back to cv", async () => {
    const { controller, applications } = makeController();

    await controller.apply("designer", pdf({ originalname: "../../my\\cv\u0000.pdf" }), form);
    await controller.apply("designer", pdf({ originalname: "//\\\\" }), form);

    const names = applications.create.mock.calls.map(
      (call) => (call[0] as { application: { cvFilename: string } }).application.cvFilename,
    );
    expect(names).toEqual(["....mycv.pdf", "cv"]);
  });

  it("falls back to the slug when the role has no title", async () => {
    const { controller, jobs, applications } = makeController();
    jobs.bySlug.mockResolvedValue({ job: { status: "published", deadline: "2099-01-01" } });

    await controller.apply("designer", pdf(), form);

    expect(applications.create).toHaveBeenCalledWith({
      application: expect.objectContaining({ jobTitle: "designer" }),
    });
  });

  it("still succeeds when the confirmation email fails", async () => {
    const { controller, mail } = makeController();
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    mail.sendEmail.mockRejectedValue(new Error("smtp down"));

    try {
      await expect(controller.apply("designer", pdf(), form)).resolves.toEqual({ ok: true });
      await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    } finally {
      warn.mockRestore();
    }
  });

  it.each([
    ["terms not accepted", { ...form, agreedToTerms: "false" }],
    ["a bad email", { ...form, email: "nope" }],
    ["a short name", { ...form, fullName: "A" }],
    ["a bad phone country", { ...form, phoneCountry: "62" }],
    ["a bad phone number", { ...form, phoneNumber: "abc" }],
    ["a short motivation", { ...form, motivation: "short" }],
    ["an unknown applicant type", { ...form, applicantType: "alien" }],
    ["a UB student without a NIM", { ...form, applicantType: "ub-student", faculty: "FILKOM" }],
    [
      "a UB student with a bad NIM",
      { ...form, applicantType: "ub-student", nim: "123", faculty: "FILKOM" },
    ],
    [
      "a UB student without a faculty",
      { ...form, applicantType: "ub-student", nim: "245150300111024" },
    ],
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, applications, storage } = makeController();

    await expect(controller.apply("designer", pdf(), body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(applications.create).not.toHaveBeenCalled();
  });

  it("accepts a UB student with a valid NIM and faculty", async () => {
    const { controller, applications } = makeController();

    await controller.apply("designer", pdf(), {
      ...form,
      applicantType: "ub-student",
      nim: "245150300111024",
      faculty: "FILKOM",
    });

    expect(applications.create).toHaveBeenCalledTimes(1);
  });

  it("answers 400 when the body is missing", async () => {
    const { controller } = makeController();

    await expect(controller.apply("designer", pdf(), undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("answers 400 when the role does not exist", async () => {
    const { controller, jobs } = makeController();
    jobs.bySlug.mockRejectedValue(new NotFoundException());

    await expectRejection(
      controller.apply("nope", pdf(), form),
      BadRequestException,
      "That role does not exist.",
    );
  });

  it("answers 409 when the role is closed or past its deadline", async () => {
    const { controller, jobs, storage } = makeController();
    jobs.bySlug.mockResolvedValue({ job: { status: "closed", deadline: "2099-01-01" } });
    await expect(controller.apply("designer", pdf(), form)).rejects.toBeInstanceOf(
      ConflictException,
    );

    jobs.bySlug.mockResolvedValue({ job: { status: "published", deadline: "2020-01-01" } });
    await expect(controller.apply("designer", pdf(), form)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 400 without a CV or with the wrong type", async () => {
    const { controller, storage } = makeController();

    await expectRejection(
      controller.apply("designer", undefined, form),
      BadRequestException,
      "Please attach your CV.",
    );
    await expectRejection(
      controller.apply("designer", pdf({ mimetype: "image/png" }), form),
      BadRequestException,
      "The CV must be a PDF or Word document",
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("answers 413 when the CV is over the default limit of 100 MB", async () => {
    const { controller, storage } = makeController();

    await expect(
      controller.apply("designer", pdf({ size: 104_857_601 }), form),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("reads the CV limit from the environment and ignores a bad value", async () => {
    const { controller } = makeController();

    vi.stubEnv("CMS_MAX_CV_BYTES", "2097152");
    await expectRejection(
      controller.apply("designer", pdf({ size: 3 * 1024 * 1024 }), form),
      PayloadTooLargeException,
      "The CV must be under 2 MB.",
    );

    vi.stubEnv("CMS_MAX_CV_BYTES", "not a number");
    await expect(
      controller.apply("designer", pdf({ size: 3 * 1024 * 1024 }), form),
    ).resolves.toEqual({ ok: true });

    vi.stubEnv("CMS_MAX_CV_BYTES", "-5");
    await expect(
      controller.apply("designer", pdf({ size: 3 * 1024 * 1024 }), form),
    ).resolves.toEqual({ ok: true });
  });

  it("answers 400 and stores no application when storage is not configured", async () => {
    const { controller, storage, applications } = makeController();
    storage.uploadFile.mockRejectedValue(new Error("no bucket"));

    await expectRejection(
      controller.apply("designer", pdf(), form),
      BadRequestException,
      "Application storage is not configured",
    );
    expect(applications.create).not.toHaveBeenCalled();
  });
});
