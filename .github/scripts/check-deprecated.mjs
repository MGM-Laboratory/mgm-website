// Fails when the TypeScript compiler reports a use of a deprecated API.
// Run it from a workspace folder, for example `node ../../.github/scripts/check-deprecated.mjs`.
// It reads the tsconfig.json of the current folder and the typescript package that the
// workspace installs, so it needs no dependency of its own. This keeps the OpenSSF
// criterion `interfaces_current` true, because a new deprecated call fails the typecheck.
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const ts = createRequire(path.join(root, "package.json"))("typescript");

// 6385 is "'x' is deprecated" and 6387 is "The signature of 'x' is deprecated".
const DEPRECATED_CODES = new Set([6385, 6387]);
const SKIPPED = /[\\/](node_modules|generated|\.next)[\\/]/;

const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);

const findings = [];
for (const file of program.getSourceFiles()) {
  if (file.isDeclarationFile || SKIPPED.test(file.fileName)) continue;
  for (const diagnostic of program.getSuggestionDiagnostics(file)) {
    if (!DEPRECATED_CODES.has(diagnostic.code) || diagnostic.start === undefined) continue;
    const { line } = file.getLineAndCharacterOfPosition(diagnostic.start);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ").slice(0, 160);
    findings.push(`${path.relative(root, file.fileName)}:${line + 1} ${message}`);
  }
}

if (findings.length > 0) {
  console.error(`Found ${findings.length} use(s) of a deprecated API:`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`No deprecated API in ${path.basename(root)}.`);
