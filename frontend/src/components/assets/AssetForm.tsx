"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useTranslation, type TranslationKey } from "@/i18n";
import { ASSET_LIMITS } from "@/lib/config";
import {
  validateAssetForm,
  type AssetFieldCode,
  type AssetFieldErrorMap,
} from "@/lib/assetValidation";
import type { AssetError, AssetResult } from "@/services/assets";
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  CRITICALITIES,
  ENVIRONMENTS,
  type Asset,
  type AssetCreateInput,
  type AssetStatus,
  type AssetType,
  type Criticality,
  type Environment,
} from "@/types/asset";

import {
  assetTypeOptions,
  criticalityOptions,
  environmentOptions,
  statusOptions,
} from "./catalog";

interface AssetFormProps {
  mode: "create" | "edit";
  initial?: Asset;
  onSubmit: (input: AssetCreateInput) => Promise<AssetResult<Asset>>;
  onSuccess: (asset: Asset) => void;
  onCancel: () => void;
}

const FIELD_ERROR_KEYS: Record<AssetFieldCode, TranslationKey> = {
  nameRequired: "assetForm.errorNameRequired",
  nameTooLong: "assetForm.errorNameTooLong",
  ipInvalid: "assetForm.errorIpInvalid",
  hostnameTooLong: "assetForm.errorHostnameTooLong",
  ownerTooLong: "assetForm.errorOwnerTooLong",
  descriptionTooLong: "assetForm.errorDescriptionTooLong",
};

function formErrorKey(error: AssetError): TranslationKey {
  if (error.kind === "unreachable") return "assetForm.errorUnreachable";
  if (error.kind === "not_found") return "assetForm.errorNotFound";
  return "assetForm.errorGeneric";
}

const trimOrNull = (s: string): string | null => {
  const t = s.trim();
  return t === "" ? null : t;
};

export function AssetForm({ mode, initial, onSubmit, onSuccess, onCancel }: AssetFormProps) {
  const { t } = useTranslation();

  const [name, setName] = useState(initial?.name ?? "");
  const [assetType, setAssetType] = useState<AssetType>(initial?.asset_type ?? ASSET_TYPES[0]);
  const [environment, setEnvironment] = useState<Environment>(
    initial?.environment ?? ENVIRONMENTS[0],
  );
  const [criticality, setCriticality] = useState<Criticality>(
    initial?.criticality ?? CRITICALITIES[2], // Medium
  );
  const [status, setStatus] = useState<AssetStatus>(initial?.status ?? ASSET_STATUSES[0]);
  const [hostname, setHostname] = useState(initial?.hostname ?? "");
  const [ipAddress, setIpAddress] = useState(initial?.ip_address ?? "");
  const [owner, setOwner] = useState(initial?.owner ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function translateFieldErrors(codes: AssetFieldErrorMap): Record<string, string> {
    const out: Record<string, string> = {};
    const maxFor: Record<string, number> = {
      name: ASSET_LIMITS.name,
      hostname: ASSET_LIMITS.hostname,
      owner: ASSET_LIMITS.owner,
      description: ASSET_LIMITS.description,
    };
    (Object.keys(codes) as (keyof AssetFieldErrorMap)[]).forEach((field) => {
      const code = codes[field];
      if (!code) return;
      out[field] = t(FIELD_ERROR_KEYS[code], {
        max: maxFor[field] ?? ASSET_LIMITS.description,
      });
    });
    return out;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const codes = validateAssetForm({
      name,
      hostname,
      ip_address: ipAddress,
      owner,
      description,
    });
    if (Object.keys(codes).length > 0) {
      setFieldErrors(translateFieldErrors(codes));
      return;
    }
    setFieldErrors({});

    const input: AssetCreateInput = {
      name: name.trim(),
      asset_type: assetType,
      environment,
      criticality,
      status,
      hostname: trimOrNull(hostname),
      ip_address: trimOrNull(ipAddress),
      owner: trimOrNull(owner),
      description: trimOrNull(description),
    };

    setSubmitting(true);
    const result = await onSubmit(input);
    setSubmitting(false);

    if (result.ok) {
      onSuccess(result.data);
      return;
    }
    if (result.error.kind === "validation" && result.error.fields) {
      setFieldErrors({ ...result.error.fields });
    }
    setFormError(t(formErrorKey(result.error)));
  }

  const optional = `(${t("assetForm.optional")})`;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <Input
        label={t("assetFields.name")}
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={fieldErrors.name}
        disabled={submitting}
        autoComplete="off"
        maxLength={ASSET_LIMITS.name + 20}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t("assetFields.type")}
          value={assetType}
          onChange={(e) => setAssetType(e.target.value as AssetType)}
          options={assetTypeOptions(t)}
          disabled={submitting}
        />
        <Select
          label={t("assetFields.environment")}
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as Environment)}
          options={environmentOptions(t)}
          disabled={submitting}
        />
        <Select
          label={t("assetFields.criticality")}
          value={criticality}
          onChange={(e) => setCriticality(e.target.value as Criticality)}
          options={criticalityOptions(t)}
          disabled={submitting}
        />
        <Select
          label={t("assetFields.status")}
          value={status}
          onChange={(e) => setStatus(e.target.value as AssetStatus)}
          options={statusOptions(t)}
          disabled={submitting}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={`${t("assetFields.hostname")} ${optional}`}
          name="hostname"
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          error={fieldErrors.hostname}
          hint={t("assetForm.hintHostname")}
          disabled={submitting}
          autoComplete="off"
        />
        <Input
          label={`${t("assetFields.ipAddress")} ${optional}`}
          name="ip_address"
          value={ipAddress}
          onChange={(e) => setIpAddress(e.target.value)}
          error={fieldErrors.ip_address}
          hint={t("assetForm.hintIpAddress")}
          disabled={submitting}
          autoComplete="off"
          inputMode="text"
        />
      </div>

      <Input
        label={`${t("assetFields.owner")} ${optional}`}
        name="owner"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
        error={fieldErrors.owner}
        disabled={submitting}
        autoComplete="off"
      />

      <Textarea
        label={`${t("assetFields.description")} ${optional}`}
        name="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={fieldErrors.description}
        hint={t("assetForm.hintDescription")}
        disabled={submitting}
        maxLength={ASSET_LIMITS.description + 200}
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          {t("assetForm.cancel")}
        </Button>
        <Button type="submit" loading={submitting}>
          {submitting
            ? t("assetForm.saving")
            : mode === "create"
              ? t("assetForm.submitCreate")
              : t("assetForm.submitEdit")}
        </Button>
      </div>
    </form>
  );
}
