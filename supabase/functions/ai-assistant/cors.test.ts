import { describe, expect, it } from "vitest";

import { CORS_ALLOW_HEADERS, CORS_HEADERS, preflightResponse } from "./cors";

describe("cors contract", () => {
  it("lets any origin read the answer and send auth headers", () => {
    expect(CORS_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
    expect(CORS_HEADERS["Access-Control-Allow-Methods"]).toContain("POST");
    expect(CORS_HEADERS["Access-Control-Allow-Methods"]).toContain("OPTIONS");
    // Without these two the browser blocks supabase-js before the request runs.
    expect(CORS_ALLOW_HEADERS).toContain("authorization");
    expect(CORS_ALLOW_HEADERS).toContain("content-type");
    expect(CORS_ALLOW_HEADERS).toContain("apikey");
  });

  it("answers the preflight with 204 and no body", async () => {
    const response = preflightResponse();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  });
});