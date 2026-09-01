import { describe, expect, it } from "vitest";

import { validateEmail, validateLogin, validatePassword, validateRegistration } from "@/lib/validation";

describe("validateEmail", () => {
  it("accepts a normal address", () => {
    expect(validateEmail("user@example.com")).toBeNull();
  });
  it.each(["", "  ", "nope", "a@b", "a b@example.com"])("rejects %o", (value) => {
    expect(validateEmail(value)).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it("accepts a 12+ char passphrase", () => {
    expect(validatePassword("correct horse battery")).toBeNull();
  });
  it("rejects an empty password", () => {
    expect(validatePassword("")).toBe("Password is required.");
  });
  it("rejects a short password", () => {
    expect(validatePassword("short")).toMatch(/at least 12/);
  });
  it("rejects an overlong password", () => {
    expect(validatePassword("x".repeat(129))).toMatch(/at most 128/);
  });
});

describe("validateRegistration / validateLogin", () => {
  it("registration flags both fields", () => {
    const errors = validateRegistration("bad", "short");
    expect(errors.email).toBeDefined();
    expect(errors.password).toBeDefined();
  });
  it("login only checks presence of password", () => {
    expect(validateLogin("user@example.com", "x").password).toBeUndefined();
    expect(validateLogin("user@example.com", "").password).toBeDefined();
  });
});
