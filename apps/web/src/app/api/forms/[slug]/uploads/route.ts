import { forwardPublicUpload, type SlugContext } from "../../_lib/public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The raw file streams straight through: `?fieldId=&sessionId=`, the file's
// content-type, and its URI-encoded name in x-file-name.
export async function POST(request: Request, context: SlugContext) {
  return forwardPublicUpload(request, context);
}
