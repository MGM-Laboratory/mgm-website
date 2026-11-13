// A light answer for the Docker health check and the rolling update. It makes no call to the API, so a slow or down API does
// not mark the web copy as unhealthy, and the check does not render a page.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
