import { ASSET_LIMITS } from "@/lib/config";

/**
 * Client-side asset validation. Like `lib/validation.ts`, it returns stable
 * codes (not prose) so the UI owns the wording. The backend is the authority -
 * this only catches obvious mistakes before a round-trip.
 */

export type AssetFieldCode =
  | "nameRequired"
  | "nameTooLong"
  | "ipInvalid"
  | "hostnameTooLong"
  | "ownerTooLong"
  | "descriptionTooLong";

export interface AssetFieldErrorMap {
  name?: AssetFieldCode;
  ip_address?: AssetFieldCode;
  hostname?: AssetFieldCode;
  owner?: AssetFieldCode;
  description?: AssetFieldCode;
}

const IPV4 =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Permissive check - accepts standard IPv4 and a reasonable IPv6 shape. */
export function isValidIpAddress(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (IPV4.test(v)) return true;
  if (!v.includes(":")) return false;
  if (!/^[0-9a-fA-F:]+$/.test(v)) return false;
  if ((v.match(/::/g) ?? []).length > 1) return false;
  const groups = v.split(":").filter((g) => g !== "");
  return groups.length >= 1 && groups.length <= 8 && groups.every((g) => g.length <= 4);
}

export interface AssetFormText {
  name: string;
  hostname: string;
  ip_address: string;
  owner: string;
  description: string;
}

export function validateAssetForm(v: AssetFormText): AssetFieldErrorMap {
  const errors: AssetFieldErrorMap = {};

  const name = v.name.trim();
  if (!name) errors.name = "nameRequired";
  else if (name.length > ASSET_LIMITS.name) errors.name = "nameTooLong";

  if (v.ip_address.trim() && !isValidIpAddress(v.ip_address)) {
    errors.ip_address = "ipInvalid";
  }
  if (v.hostname.trim().length > ASSET_LIMITS.hostname) {
    errors.hostname = "hostnameTooLong";
  }
  if (v.owner.trim().length > ASSET_LIMITS.owner) {
    errors.owner = "ownerTooLong";
  }
  if (v.description.trim().length > ASSET_LIMITS.description) {
    errors.description = "descriptionTooLong";
  }
  return errors;
}
