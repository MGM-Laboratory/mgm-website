import { readLimitedText } from "@/lib/read-limited-text";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Reports are small. A larger body is not one, and is dropped before it is read in full. */
const MAX_BODY_BYTES = 8 * 1024;
/** The log lines that one process writes in a minute, so a page that loops or a caller that floods cannot fill the log. */
const MAX_LINES_PER_MINUTE = 60;

let windowStart = 0;
let linesInWindow = 0;

function allowLine(now: number) {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    linesInWindow = 0;
  }
  linesInWindow += 1;
  return linesInWindow <= MAX_LINES_PER_MINUTE;
}

function clip(value: unknown, length = 200) {
  return typeof value === "string" ? value.slice(0, length) : undefined;
}

/** The fields of a report that help to fix a policy. No query string and no fragment of a page address is kept. */
function summarize(report: Record<string, unknown>) {
  const page = (value: unknown) => clip(typeof value === "string" ? value.split(/[?#]/)[0] : value);
  return {
    page: page(report["document-uri"] ?? report.documentURL),
    blocked: page(report["blocked-uri"] ?? report.blockedURL),
    directive: clip(report["effective-directive"] ?? report.effectiveDirective),
    violated: clip(report["violated-directive"]),
    source: page(report["source-file"] ?? report.sourceFile),
    line: typeof report["line-number"] === "number" ? report["line-number"] : undefined,
    disposition: clip(report.disposition),
  };
}

/** Receives the reports of the Content-Security-Policy-Report-Only header and writes one line for each to the server log. */
export async function POST(request: Request) {
  // Read chunk by chunk and abandoned at the limit, so a body without a declared length cannot fill the memory either
  const text = await readLimitedText(request, MAX_BODY_BYTES).catch(() => "");
  if (text === null) return new Response(null, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }

  // The older report-uri format wraps one report, and the Reporting API format sends a list of reports with the fields in a body
  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const inner = (entry["csp-report"] ?? entry.body) as Record<string, unknown> | undefined;
    if (!inner || typeof inner !== "object") continue;
    if (!allowLine(Date.now())) break;
    console.warn("csp-report", JSON.stringify(summarize(inner)));
  }

  return new Response(null, { status: 204 });
}
