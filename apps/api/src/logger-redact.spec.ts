import { Writable } from "node:stream";

import { pinoHttp } from "pino-http";
import { describe, expect, it } from "vitest";

import { LOG_REDACT } from "./logger-redact.js";

describe("LOG_REDACT", () => {
  it("keeps the secret headers out of a log line", () => {
    let output = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const logger = pinoHttp({ redact: LOG_REDACT }, stream).logger;

    logger.info({
      req: {
        method: "GET",
        headers: {
          authorization: "Bearer token-value",
          cookie: "session=cookie-value",
          "x-cms-passphrase": "passphrase-value",
          "x-form-token": "form-token-value",
          "user-agent": "vitest",
        },
      },
      res: { statusCode: 200, headers: { "set-cookie": "session=set-cookie-value" } },
    });

    for (const secret of [
      "token-value",
      "cookie-value",
      "passphrase-value",
      "form-token-value",
      "set-cookie-value",
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("vitest");
    expect(output).toContain("[redacted]");
  });
});
