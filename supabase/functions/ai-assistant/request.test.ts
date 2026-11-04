import { describe, expect, it } from "vitest";

import {
  isContentLengthExceeded,
  MAX_BODY_BYTES,
  MAX_MESSAGE_CHARS,
  parseChatRequestBody,
  parseDecideRequestBody,
  utf8ByteLength,
} from "./request.ts";

describe("parseChatRequestBody", () => {
  it("rejects bodies over MAX_BODY_BYTES before parsing", () => {
    const oversized = "x".repeat(MAX_BODY_BYTES + 1);
    expect(utf8ByteLength(oversized)).toBeGreaterThan(MAX_BODY_BYTES);
    const result = parseChatRequestBody(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("too_large");
    }
  });

  it("rejects invalid JSON", () => {
    const result = parseChatRequestBody("{oops");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_json");
    }
  });

  it("rejects non-object bodies and empty or overlong messages", () => {
    for (const body of [`[1,2]`, `null`, `"hi"`, `{}`, `{"message":"  "}`]) {
      const result = parseChatRequestBody(body);
      expect(result.ok, body).toBe(false);
    }
    const overlong = parseChatRequestBody(
      JSON.stringify({ message: "x".repeat(MAX_MESSAGE_CHARS + 1) }),
    );
    expect(overlong.ok).toBe(false);
    if (!overlong.ok) {
      expect(overlong.error.code).toBe("invalid_schema");
    }
  });

  it("rejects non-UUID conversationId", () => {
    const result = parseChatRequestBody(
      JSON.stringify({ message: "hi", conversationId: "someone-else" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_schema");
    }
  });

  it("accepts a valid chat request with and without conversationId", () => {
    const without = parseChatRequestBody(JSON.stringify({ message: "Plan my week" }));
    expect(without).toStrictEqual({
      ok: true,
      request: { message: "Plan my week", conversationId: null },
    });
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const withConversation = parseChatRequestBody(
      JSON.stringify({ message: "Continue", conversationId: uuid }),
    );
    expect(withConversation).toStrictEqual({
      ok: true,
      request: { message: "Continue", conversationId: uuid },
    });
  });
});

describe("parseDecideRequestBody (step 7)", () => {
  const PROPOSAL_ID = "123e4567-e89b-12d3-a456-426614174000";

  it("rejects bodies over MAX_BODY_BYTES before parsing", () => {
    const oversized = "x".repeat(MAX_BODY_BYTES + 1);
    const result = parseDecideRequestBody(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("too_large");
    }
  });

  it("rejects invalid JSON and non-object bodies", () => {
    const badJson = parseDecideRequestBody("{oops");
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) {
      expect(badJson.error.code).toBe("invalid_json");
    }
    for (const body of [`[1,2]`, `null`, `"hi"`, `{}`, `{"message":"hi"}`]) {
      expect(parseDecideRequestBody(body).ok, body).toBe(false);
    }
  });

  it("rejects unknown actions and non-UUID proposal ids", () => {
    const badAction = parseDecideRequestBody(
      JSON.stringify({ action: "chat", proposalId: PROPOSAL_ID }),
    );
    expect(badAction.ok).toBe(false);
    const badId = parseDecideRequestBody(
      JSON.stringify({ action: "approve", proposalId: "someone-else" }),
    );
    expect(badId.ok).toBe(false);
    if (!badId.ok) {
      expect(badId.error.code).toBe("invalid_schema");
    }
  });

  it("accepts approve and reject with a UUID proposal id", () => {
    expect(
      parseDecideRequestBody(JSON.stringify({ action: "approve", proposalId: PROPOSAL_ID })),
    ).toStrictEqual({ ok: true, request: { action: "approve", proposalId: PROPOSAL_ID } });
    expect(
      parseDecideRequestBody(JSON.stringify({ action: "reject", proposalId: PROPOSAL_ID })),
    ).toStrictEqual({ ok: true, request: { action: "reject", proposalId: PROPOSAL_ID } });
  });
});

describe("isContentLengthExceeded (header pre-check, fix b)", () => {
  it("returns true when the header exceeds 64 KiB", () => {
    expect(isContentLengthExceeded(String(MAX_BODY_BYTES + 1))).toBe(true);
    expect(isContentLengthExceeded(" 131072 ")).toBe(true);
  });

  it("returns false when the header is absent, malformed or within limit", () => {
    expect(isContentLengthExceeded(null)).toBe(false);
    expect(isContentLengthExceeded(String(MAX_BODY_BYTES))).toBe(false);
    expect(isContentLengthExceeded("1024")).toBe(false);
    expect(isContentLengthExceeded("not-a-number")).toBe(false);
    expect(isContentLengthExceeded("")).toBe(false);
  });
});
