import { describe, expect, it } from "vitest";

import { requestResetSchema, setNewPasswordSchema, signInSchema, signUpSchema } from "./schemas";

describe("signInSchema", () => {
  it("accepts a valid email and password", () => {
    expect(
      signInSchema.safeParse({ email: "ada@example.com", password: "secret123" }).success,
    ).toBe(true);
  });

  it("trims the email and rejects blanks, invalid emails and missing passwords", () => {
    expect(signInSchema.safeParse({ email: "  ada@example.com  ", password: "x" }).success).toBe(
      true,
    );
    expect(signInSchema.safeParse({ email: "", password: "secret123" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "not-an-email", password: "secret123" }).success).toBe(
      false,
    );
    expect(signInSchema.safeParse({ email: "ada@example.com", password: "" }).success).toBe(false);
  });
});

describe("signUpSchema", () => {
  it("accepts an optional name and enforces the password minimum", () => {
    expect(
      signUpSchema.safeParse({ email: "ada@example.com", password: "secret123" }).success,
    ).toBe(true);
    expect(
      signUpSchema.safeParse({ fullName: "Ada", email: "ada@example.com", password: "secret123" })
        .success,
    ).toBe(true);
    expect(signUpSchema.safeParse({ email: "ada@example.com", password: "short" }).success).toBe(
      false,
    );
  });

  it("rejects overlong names", () => {
    expect(
      signUpSchema.safeParse({
        fullName: "a".repeat(81),
        email: "a@example.com",
        password: "secret123",
      }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({
        fullName: "a".repeat(80),
        email: "a@example.com",
        password: "secret123",
      }).success,
    ).toBe(true);
  });
});

describe("requestResetSchema", () => {
  it("accepts valid emails and rejects the rest", () => {
    expect(requestResetSchema.safeParse({ email: "ada@example.com" }).success).toBe(true);
    expect(requestResetSchema.safeParse({ email: "" }).success).toBe(false);
    expect(requestResetSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("setNewPasswordSchema", () => {
  it("requires matching confirmation of sufficient length", () => {
    expect(
      setNewPasswordSchema.safeParse({ password: "new-secret-1", confirmPassword: "new-secret-1" })
        .success,
    ).toBe(true);
    expect(
      setNewPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success,
    ).toBe(false);
    const mismatch = setNewPasswordSchema.safeParse({
      password: "new-secret-1",
      confirmPassword: "other-secret-2",
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });
});
