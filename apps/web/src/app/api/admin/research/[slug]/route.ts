// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { detailRoute, gateAdminRequest } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { PUT, DELETE } = detailRoute(
  () => gateAdminRequest("research", "write"),
  () => gateAdminRequest("research", "delete"),
  (slug) => `/cms/research/${encodeURIComponent(slug)}`,
);
