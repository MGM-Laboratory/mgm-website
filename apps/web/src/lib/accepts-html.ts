/**
 * Whether an Accept header names `text/html` with a quality above zero. A
 * wildcard does not count, so a script that sends a star gets JSON, and
 * `text/html;q=0` is an explicit refusal.
 */
export function acceptsHtml(accept: string | null): boolean {
  if (!accept) return false;
  return accept.split(",").some((range) => {
    const [type, ...params] = range.split(";").map((part) => part.trim().toLowerCase());
    if (type !== "text/html") return false;
    const quality = params.find((param) => param.startsWith("q="));
    if (!quality) return true;
    const value = Number(quality.slice(2));
    return Number.isFinite(value) && value > 0;
  });
}
