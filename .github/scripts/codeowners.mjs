// Tiny CODEOWNERS parser — just enough to extract the set of @handles to
// mention/notify, without pulling in a real CODEOWNERS-matching library
// (path-pattern matching isn't needed here: every automation that reads this
// just wants "who owns this repo overall").
import { readFileSync } from "node:fs";

export function codeowners(repoRoot = process.cwd()) {
  let text;
  try {
    text = readFileSync(`${repoRoot}/CODEOWNERS`, "utf8");
  } catch {
    return [];
  }
  const handles = new Set();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    for (const token of trimmed.split(/\s+/).slice(1)) {
      if (token.startsWith("@") && !token.includes("/")) {
        handles.add(token.slice(1)); // team handles ("@org/team") are skipped — nothing to @-mention usefully
      }
    }
  }
  return [...handles];
}
