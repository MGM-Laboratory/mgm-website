import assert from "node:assert/strict";
import test from "node:test";

import { collectPullRequestContributorLogins } from "./gh-api.mjs";

test("collectPullRequestContributorLogins tags every unique human commit identity", () => {
  const logins = collectPullRequestContributorLogins(
    [
      { author: { login: "alice" }, committer: { login: "alice" } },
      { author: { login: "BOB" }, committer: { login: "carol" } },
      { author: { login: "github-actions[bot]" }, committer: null },
    ],
    "alice",
  );

  assert.deepEqual(logins, ["alice", "BOB", "carol"]);
});

test("collectPullRequestContributorLogins keeps the PR author when commits are unlinked", () => {
  assert.deepEqual(
    collectPullRequestContributorLogins([{ author: null, committer: null }], "dana"),
    ["dana"],
  );
});
