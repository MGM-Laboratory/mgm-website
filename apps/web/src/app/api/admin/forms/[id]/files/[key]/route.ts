import { NextResponse } from "next/server";

import { gateAdminRequest } from "@/lib/admin-proxy";
import { cmsApi } from "@/lib/cms-api";

import { enc, formPath } from "../../../_lib/forward";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; key: string }> };

type SignedFile = { url?: string; message?: unknown };

/**
 * A respondent's upload: a 302 to its short-lived signed URL, or with
 * `?download=1` the bytes the API streams back, relayed through this origin
 * as an attachment so the responses panel can fetch and zip files
 * same-origin.
 */
export async function GET(request: Request, { params }: Context) {
  const gate = await gateAdminRequest("forms", "read");
  if (!gate.ok) return gate.response;
  const { id, key } = await params;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const path = formPath(id, `/files/${enc(key)}${download ? "?download=1" : ""}`);

  let response: Response;
  try {
    response = await cmsApi(path);
  } catch {
    return NextResponse.json({ message: "The forms API is not reachable." }, { status: 502 });
  }

  if (!download) {
    const signed = (await response.json().catch(() => ({}))) as SignedFile;
    if (response.status !== 200 || !signed.url) {
      return NextResponse.json(
        { message: signed.message ?? "File not found." },
        { status: response.status === 200 ? 404 : response.status },
      );
    }
    return NextResponse.redirect(signed.url, 302);
  }

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => ({}))) as SignedFile;
    return NextResponse.json(
      { message: body.message ?? "The file could not be read." },
      { status: response.ok ? 502 : response.status },
    );
  }
  const headers = new Headers({
    "content-type": response.headers.get("content-type") ?? "application/octet-stream",
    "content-disposition": response.headers.get("content-disposition") ?? "attachment",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  const length = response.headers.get("content-length");
  if (length) headers.set("content-length", length);
  return new NextResponse(response.body, { headers });
}
