import { forwardPublicJson, type SlugContext } from "../../_lib/public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: SlugContext) {
  return (await forwardPublicJson(request, context, "events")).response;
}
