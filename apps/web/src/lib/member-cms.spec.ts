import { describe, expect, it } from "vitest";

import type { Member } from "@/data/members";

import {
  draftToMember,
  memberToDraft,
  membersFromRecords,
  type CmsMemberRecord,
  type MemberDraft,
} from "./member-cms";

function member(extra: Partial<Member> = {}): Member {
  return {
    accent: "blue",
    bio: "bio",
    division: "Website",
    group: "Operations",
    hasPortrait: false,
    labFocus: ["a"],
    name: "Ada",
    role: "Student Member",
    slug: "ada",
    ...extra,
  } as unknown as Member;
}

describe("memberToDraft", () => {
  it("fills editor defaults for the optional fields", () => {
    const source = member();
    const draft = memberToDraft(source);

    expect(draft).toMatchObject({ highlighted: false, nickname: "", unit: "" });
    expect(draft.labFocus).toEqual(["a"]);
    expect(draft.labFocus).not.toBe(source.labFocus);
  });

  it("keeps the optional values it has", () => {
    expect(
      memberToDraft(member({ highlighted: true, nickname: "Ad", unit: "Secretariat" })),
    ).toMatchObject({ highlighted: true, nickname: "Ad", unit: "Secretariat" });
  });
});

describe("draftToMember", () => {
  it("trims text and turns empty optionals into undefined", () => {
    const draft: MemberDraft = {
      ...memberToDraft(member()),
      bio: " b ",
      name: " Ada L ",
      slug: " ada-l ",
      nickname: " ",
      unit: "",
      labFocus: [" x ", " ", "y"],
      highlighted: true,
    };

    expect(draftToMember(draft)).toMatchObject({
      bio: "b",
      name: "Ada L",
      slug: "ada-l",
      nickname: undefined,
      unit: undefined,
      labFocus: ["x", "y"],
      highlighted: true,
    });
  });

  it("keeps a nickname and a unit", () => {
    const draft: MemberDraft = {
      ...memberToDraft(member()),
      nickname: " Ad ",
      unit: "Assistant Coordinator",
    };

    expect(draftToMember(draft)).toMatchObject({ nickname: "Ad", unit: "Assistant Coordinator" });
  });
});

describe("membersFromRecords", () => {
  it("sorts by name without changing the input", () => {
    const records = ["Cleo", "Ada", "Bea"].map(
      (name) =>
        ({ slug: name, profile: {}, member: member({ name, slug: name }) }) as CmsMemberRecord,
    );

    expect(membersFromRecords(records).map((entry) => entry.name)).toEqual(["Ada", "Bea", "Cleo"]);
    expect(records[0].member.name).toBe("Cleo");
  });
});
