// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { bulkRoute } from "@/lib/admin-bulk-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { POST } = bulkRoute("careers", "/cms/jobs/applications/bulk");
