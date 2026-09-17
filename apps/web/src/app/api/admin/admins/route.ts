import { gateSuperadminRequest, proxyJson } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const gate = await gateSuperadminRequest();
  if (!gate.ok) return gate.response;
  return proxyJson("/cms/admins");
}

export async function POST(request: Request) {
  const gate = await gateSuperadminRequest();
  if (!gate.ok) return gate.response;
  return proxyJson("/cms/admins", {
    body: JSON.stringify(await request.json()),
    method: "POST",
  });
}
