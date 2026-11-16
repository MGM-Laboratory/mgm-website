// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { gateAdminRequest, listRoute } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The admin list endpoint includes unpublished drafts.
export const { GET } = listRoute(() => gateAdminRequest("articles", "read"), "/cms/articles/admin");
