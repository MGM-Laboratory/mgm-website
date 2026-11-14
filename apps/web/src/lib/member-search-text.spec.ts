import { describe, expect, it } from "vitest";

import { memberSearchText } from "./member-search-text";

describe("memberSearchText", () => {
  it("is empty without a profile", () => {
    expect(memberSearchText(undefined)).toBe("");
    expect(memberSearchText({})).toBe("");
  });

  it("holds the words of every searchable section", () => {
    const text = memberSearchText({
      bio: "Builds games",
      skills: ["Unity"],
      experience: [
        { title: "Intern", company: "Acme", location: "Malang", description: "5 years of C#" },
      ],
      education: [{ institution: "Brawijaya", degree: "Informatics", detail: "GPA" }],
      achievements: [{ title: "Finalist", issuer: "Gemastik", description: "National" }],
      certificates: [{ title: "Unity Certified", issuer: "Unity" }],
      languages: [{ name: "Indonesian", proficiency: "native" }],
      projects: ["Lab website"],
    });
    for (const word of [
      "Builds games",
      "Unity",
      "Intern",
      "Acme",
      "Malang",
      "5 years of C#",
      "Brawijaya",
      "Informatics",
      "Finalist",
      "Gemastik",
      "Unity Certified",
      "Indonesian",
      "Lab website",
    ]) {
      expect(text).toContain(word);
    }
  });

  it("leaves out links and credential ids", () => {
    const text = memberSearchText({
      links: [{ label: "Site", url: "https://example.org/me" }],
      certificates: [
        { title: "Cert", credentialId: "ABC-123", credentialUrl: "https://example.org/c" },
      ],
    });
    expect(text).toBe("Cert");
  });
});
