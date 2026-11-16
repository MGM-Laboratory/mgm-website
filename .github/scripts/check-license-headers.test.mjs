// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import {
  COPYRIGHT,
  LICENSE,
  filesNeedingHeader,
  hasHeader,
  withHeader,
} from "./check-license-headers.mjs";

test("only source files of the apps, the packages and the CI scripts need a header", () => {
  assert.deepEqual(
    filesNeedingHeader([
      "apps/web/src/app/page.tsx",
      "apps/api/src/generated/prisma/client.ts",
      "apps/web/next-env.d.ts",
      "apps/web/public/sw.js",
      "apps/web/src/app/globals.css",
      "packages/shared/src/index.ts",
      "packages/shared/package.json",
      ".github/scripts/gh-api.mjs",
      "docs/ci-cd.md",
      "eslint.config.mjs",
    ]),
    [
      "apps/web/src/app/page.tsx",
      "apps/web/src/app/globals.css",
      "packages/shared/src/index.ts",
      ".github/scripts/gh-api.mjs",
    ],
  );
});

test("a header is found only in the first lines", () => {
  const text = `// ${COPYRIGHT}\n// ${LICENSE}\n\nexport {};\n`;
  assert.ok(hasHeader(text));
  assert.ok(hasHeader(`#!/usr/bin/env node\n${text}`));
  assert.ok(!hasHeader("export {};\n"));
  assert.ok(!hasHeader(`${"\n".repeat(10)}${text}`));
  assert.ok(!hasHeader(`const note = "${COPYRIGHT}";\nconst id = "${LICENSE}";\n`));
});

test("a header keeps a shebang on the first line and adds comments by file type", () => {
  assert.equal(
    withHeader("a.ts", '"use client";\n'),
    `// ${COPYRIGHT}\n// ${LICENSE}\n\n"use client";\n`,
  );
  assert.equal(
    withHeader("a.css", "body {}\n"),
    `/* ${COPYRIGHT} */\n/* ${LICENSE} */\n\nbody {}\n`,
  );
  assert.ok(
    withHeader("a.mjs", "#!/usr/bin/env node\nconsole.log(1);\n").startsWith(
      "#!/usr/bin/env node\n// Copyright",
    ),
  );
  assert.ok(hasHeader(withHeader("a.mjs", "#!/usr/bin/env node\nconsole.log(1);\n")));
});
