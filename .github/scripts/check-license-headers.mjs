// Checks that every source file of the repository starts with a copyright and a license line.
// Run it from the repository root. `--fix` adds the two lines to the files that lack them.
// It keeps the OpenSSF criteria `copyright_per_file` and `license_per_file` true.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const COPYRIGHT = "Copyright (c) MGM Laboratory contributors";
export const LICENSE = "SPDX-License-Identifier: GPL-3.0-only";

const SOURCE_EXTENSION = /\.(ts|tsx|mjs|cjs|js|jsx|css)$/;
const SOURCE_ROOT = /^(apps|packages)\/|^\.github\/scripts\//;
const SKIPPED = /(^|\/)(node_modules|generated|\.next|public|coverage|dist)\/|\.d\.ts$/;

/** The files that need a header, from a list of paths that git tracks. */
export function filesNeedingHeader(paths) {
  return paths.filter(
    (path) => SOURCE_ROOT.test(path) && SOURCE_EXTENSION.test(path) && !SKIPPED.test(path),
  );
}

/** True when both lines sit in the first lines of the text, after an optional shebang. */
export function hasHeader(text) {
  const head = text.split("\n", 6).join("\n");
  return head.includes(COPYRIGHT) && head.includes(LICENSE);
}

/** The text with the header added, kept below a shebang line. */
export function withHeader(path, text) {
  const header = path.endsWith(".css")
    ? `/* ${COPYRIGHT} */\n/* ${LICENSE} */\n\n`
    : `// ${COPYRIGHT}\n// ${LICENSE}\n\n`;
  if (text.startsWith("#!")) {
    const end = text.indexOf("\n") + 1;
    return text.slice(0, end) + header + text.slice(end);
  }
  return header + text;
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

function main() {
  const fix = process.argv.includes("--fix");
  const missing = [];
  for (const path of filesNeedingHeader(trackedFiles())) {
    const text = readFileSync(path, "utf8");
    if (hasHeader(text)) continue;
    if (fix) writeFileSync(path, withHeader(path, text));
    else missing.push(path);
  }
  if (missing.length > 0) {
    console.error(`${missing.length} source file(s) have no copyright and license header:`);
    for (const path of missing.slice(0, 50)) console.error(`  ${path}`);
    if (missing.length > 50) console.error(`  and ${missing.length - 50} more`);
    console.error("Run `node .github/scripts/check-license-headers.mjs --fix` to add them.");
    process.exit(1);
  }
  console.log(
    fix ? "Headers added where they were missing." : "Every source file has a license header.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
