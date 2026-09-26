import { NextResponse } from "next/server";

import { gateAdminRequest } from "@/lib/admin-proxy";
import { cmsApi } from "@/lib/cms-api";

import { enc, formPath } from "../../../_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; key: string }> };

type SignedFile = { url?: string; name?: string; type?: string; size?: number; message?: unknown };

/**
 * A respondent's upload: a 302 to its short-lived signed URL, or with
 * `?download=1` the bytes streamed through this origin as an attachment,
 * so the responses panel can fetch and zip files same-origin.
 */
export async function GET(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("forms", "read");
  if (!gate.ok) return gate.response;
  const { id, key } = await params;

  let signed: SignedFile;
  let status: number;
  try {
    const response = await cmsApi(formPath(id, `/files/${enc(key)}`));
    status = response.status;
    signed = (await response.json().catch(() => ({}))) as SignedFile;
  } catch {
    return NextResponse.json({ message: "The forms API is not reachable." }, { status: 502 });
  }
  if (status !== 200 || !signed.url) {
    return NextResponse.json(
      { message: signed.message ?? "File not found." },
      { status: status === 200 ? 404 : status },
    );
  }

  if (new URL(request.url).searchParams.get("download") !== "1") {
    return NextResponse.redirect(signed.url, 302);
  }

  const source = await fetch(signed.url, { cache: "no-store" }).catch(() => null);
  if (!source?.ok || !source.body) {
    return NextResponse.json({ message: "The file could not be read." }, { status: 502 });
  }
  const name = signed.name || key;
  const headers = new Headers({
    "content-type": signed.type || source.headers.get("content-type") || "application/octet-stream",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  const length = source.headers.get("content-length");
  if (length) headers.set("content-length", length);
  return new NextResponse(source.body, { headers });
}
