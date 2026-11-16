// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";

// Zod 4 probes for `eval` with `Function("")` the first time a schema is built, to decide if it may compile a faster parser.
// A browser that enforces a Content-Security-Policy without `unsafe-eval` reports that probe as a violation. The browser build
// turns the compiler off, so the probe never runs. The API keeps it, because it runs on a server where it is allowed.
if ("window" in globalThis) z.config({ jitless: true });
