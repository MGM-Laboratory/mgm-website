import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EXPECTED_VERSION_HEADER } from "./record-version";
import { useRecordVersion } from "./use-record-version";

function render(initial?: string) {
  let api!: ReturnType<typeof useRecordVersion>;
  function Probe() {
    api = useRecordVersion(initial);
    return null;
  }
  renderToString(createElement(Probe));
  return api;
}

describe("useRecordVersion", () => {
  it("sends the version of the loaded record", () => {
    expect(render("2025-01-01T00:00:00.000Z").headers()).toEqual({
      "content-type": "application/json",
      [EXPECTED_VERSION_HEADER]: "2025-01-01T00:00:00.000Z",
    });
  });

  it("sends no version for a new record", () => {
    expect(render().headers()).toEqual({ "content-type": "application/json" });
  });

  it("takes the new version from the answer of a save, so the next save carries it", () => {
    const version = render("v1");

    version.remember("v2");

    expect(version.headers()[EXPECTED_VERSION_HEADER]).toBe("v2");
  });

  it("ignores an answer without a version", () => {
    const version = render("v1");

    version.remember(undefined);
    version.remember("");

    expect(version.headers()[EXPECTED_VERSION_HEADER]).toBe("v1");
  });

  it("starts remembering for a record that had no version", () => {
    const version = render();

    version.remember("first");

    expect(version.headers()[EXPECTED_VERSION_HEADER]).toBe("first");
  });
});
