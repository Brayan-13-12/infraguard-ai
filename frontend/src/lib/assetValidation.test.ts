import { describe, expect, it } from "vitest";

import { ASSET_LIMITS } from "@/lib/config";
import { isValidIpAddress, validateAssetForm } from "@/lib/assetValidation";

describe("isValidIpAddress", () => {
  it.each(["10.0.0.5", "192.168.1.1", "0.0.0.0", "255.255.255.255", "2001:db8::1", "::1", "fe80::1"])(
    "accepts %s",
    (ip) => expect(isValidIpAddress(ip)).toBe(true),
  );

  it.each(["", "nope", "10.0.0.999", "1.2.3", "999.1.1.1", "10.0.0.1.1", "gggg::1", "1:2:3:4:5:6:7:8:9"])(
    "rejects %s",
    (ip) => expect(isValidIpAddress(ip)).toBe(false),
  );
});

describe("validateAssetForm", () => {
  const base = { name: "web-01", hostname: "", ip_address: "", owner: "", description: "" };

  it("passes a minimal valid form", () => {
    expect(validateAssetForm(base)).toEqual({});
  });

  it("flags a missing name", () => {
    expect(validateAssetForm({ ...base, name: "   " })).toEqual({ name: "nameRequired" });
  });

  it("flags an over-long name", () => {
    expect(validateAssetForm({ ...base, name: "x".repeat(ASSET_LIMITS.name + 1) })).toEqual({
      name: "nameTooLong",
    });
  });

  it("flags an invalid IP but allows an empty one", () => {
    expect(validateAssetForm({ ...base, ip_address: "not-an-ip" })).toEqual({
      ip_address: "ipInvalid",
    });
    expect(validateAssetForm({ ...base, ip_address: "" })).toEqual({});
  });

  it("flags an over-long description", () => {
    expect(
      validateAssetForm({ ...base, description: "x".repeat(ASSET_LIMITS.description + 1) }),
    ).toEqual({ description: "descriptionTooLong" });
  });
});
