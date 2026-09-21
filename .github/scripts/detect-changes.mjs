import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ghPaginate } from "./gh-api.mjs";
import { classifyChanges } from "./change-scope.mjs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const eventName = process.env.GITHUB_EVENT_NAME;
let files = [];
let force = !["pull_request", "push"].includes(eventName);
if (eventName === "pull_request") {
  const changed = await ghPaginate(
    process.env.GITHUB_TOKEN,
    `/repos/${process.env.GITHUB_REPOSITORY}/pulls/${event.pull_request.number}/files`,
  );
  force = changed.length >= 3000 || changed.length !== event.pull_request.changed_files;
  files = changed.flatMap((file) => [file.filename, file.previous_filename].filter(Boolean));
} else if (eventName === "push") {
  // event.before can be a dangling SHA (force-push, recreated ref), and a
  // merely well-formed non-zero SHA doesn't mean git can diff against it.
  // Verify the commit is actually reachable in the full clone first; when it
  // isn't, force every scope on rather than let `git diff` fail the job.
  let beforeReachable = false;
  if (/^[0-9a-f]{40}$/.test(event.before) && !/^0+$/.test(event.before)) {
    try {
      execFileSync("git", ["cat-file", "-e", `${event.before}^{commit}`], { stdio: "ignore" });
      beforeReachable = true;
    } catch {
      beforeReachable = false;
    }
  }
  if (!beforeReachable) force = true;
  else
    files = execFileSync(
      "git",
      ["diff", "--name-only", "--no-renames", "-z", event.before, event.after],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean);
}
const scope = classifyChanges(files, { force });
console.log(JSON.stringify({ changedFiles: files.length, force, scope }, null, 2));
appendFileSync(
  process.env.GITHUB_OUTPUT,
  Object.entries(scope)
    .map(([key, value]) => `${key}=${value}\n`)
    .join(""),
);
