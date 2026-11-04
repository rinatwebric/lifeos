import { describe, expect, it } from "vitest";

import {
  MAX_BODY_BYTES,
  MAX_MESSAGE_CHARS,
  parseChatRequestBody,
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
