// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { gateAdminRequest, postRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { POST } = postRoute(
  () => gateAdminRequest("events", "write"),
  "/cms/events/resolve-maps-link",
);
