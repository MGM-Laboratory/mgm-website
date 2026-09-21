import assert from "node:assert/strict";
import test from "node:test";
import { classifyChanges, SCOPES } from "./change-scope.mjs";

test("docs avoid app builds while retaining prose checks", () => {
  assert.deepEqual(
    Object.entries(classifyChanges(["docs/ci-cd.md"]))
      .filter(([, enabled]) => enabled)
      .map(([name]) => name),
    ["prose"],
  );
});
test("API changes do not build web or run browser tests against a mocked backend", () => {
  const result = classifyChanges(["apps/api/src/app.module.ts"]);
  assert.ok(result.api && result.codeql && result.trivy && result.docker_api);
  assert.ok(!result.web && !result.e2e && !result.lighthouse && !result.docker_web);
});
test("web source runs all browser projects and Lighthouse but no API build", () => {
  const result = classifyChanges(["apps/web/src/app/page.tsx"]);
  assert.ok(result.web && result.e2e && result.lighthouse && result.docker_web);
  assert.ok(!result.api && !result.docker_api);
});
test("shared packages and lockfile changes exercise both applications", () => {
  for (const file of ["packages/shared/src/index.ts", "pnpm-lock.yaml", "turbo.json"]) {
    const result = classifyChanges([file]);
    for (const scope of [
      "api",
      "web",
      "e2e",
      "lighthouse",
      "dependencies",
      "docker_api",
      "docker_web",
    ])
      assert.ok(result[scope], `${file}: ${scope}`);
  }
});
test("tests, automation, and unknown paths use the appropriate conservative scopes", () => {
  assert.deepEqual(
    Object.entries(classifyChanges(["apps/web/e2e/example.spec.ts"]))
      .filter(([, enabled]) => enabled)
      .map(([name]) => name),
    ["e2e"],
  );
  const automation = classifyChanges([".github/scripts/pr-command.mjs"]);
  assert.ok(automation.automation && automation.codeql && !automation.web && !automation.api);
  assert.deepEqual(
    classifyChanges(["new-build-system.conf"]),
    Object.fromEntries(SCOPES.map((s) => [s, true])),
  );
  assert.deepEqual(
    classifyChanges([], { force: true }),
    classifyChanges(["new-build-system.conf"]),
  );
});
