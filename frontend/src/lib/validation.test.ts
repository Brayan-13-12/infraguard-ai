import { describe, expect, it } from "vitest";

import {
  validateEmail,
  validateLogin,
  validatePassword,
  validateRegistration,
} from "@/lib/validation";

describe("validateEmail", () => {
  it("accepts a normal address", () => {
    expect(validateEmail("user@example.com")).toBeNull();
  });
  it("flags a missing address", () => {
    expect(validateEmail("  ")).toBe("emailRequired");
  });
  it.each(["nope", "a@b", "a b@example.com"])("rejects %o as invalid", (value) => {
    expect(validateEmail(value)).toBe("emailInvalid");
  });
});

describe("validatePassword", () => {
  it("accepts a 12+ char passphrase", () => {
    expect(validatePassword("correct horse battery")).toBeNull();
  });
  it("rejects an empty password", () => {
    expect(validatePassword("")).toBe("passwordRequired");
  });
  it("rejects a short password", () => {
    expect(validatePassword("short")).toBe("passwordTooShort");
  });
  it("rejects an overlong password", () => {
    expect(validatePassword("x".repeat(129))).toBe("passwordTooLong");
  });
});

describe("validateRegistration / validateLogin", () => {
  it("registration flags both fields", () => {
    const errors = validateRegistration("bad", "short");
    expect(errors.email).toBe("emailInvalid");
    expect(errors.password).toBe("passwordTooShort");
  });
  it("login only checks presence of password", () => {
    expect(validateLogin("user@example.com", "x").password).toBeUndefined();
    expect(validateLogin("user@example.com", "").password).toBe("passwordRequired");
  });
});
