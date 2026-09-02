"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useTranslation, type TranslationKey } from "@/i18n";
import { INCIDENT_LIMITS } from "@/lib/config";
import type { IncidentError, IncidentResult } from "@/services/incidents";
import {
  type IncidentCreateInput,
  type IncidentDetail,
  type IncidentPriority,
  type IncidentSeverity,
  type IncidentStatus,
} from "@/types/incident";

import { IncidentAssetPicker } from "./IncidentAssetPicker";
import { incidentStatusOptions, priorityOptions, severityOptions } from "./catalog";

interface IncidentFormProps {
  mode: "create" | "edit";
  initial?: IncidentDetail;
  onSubmit: (input: IncidentCreateInput) => Promise<IncidentResult<IncidentDetail>>;
  onSuccess: (incident: IncidentDetail) => void;
  onCancel: () => void;
}

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const trimOrNull = (s: string): string | null => {
  const v = s.trim();
  return v === "" ? null : v;
};

function formErrorKey(error: IncidentError): TranslationKey {
  if (error.kind === "unreachable") return "incidentForm.errorUnreachable";
  if (error.kind === "not_found") return "incidentForm.errorNotFound";
  return "incidentForm.errorGeneric";
}

export function IncidentForm({ mode, initial, onSubmit, onSuccess, onCancel }: IncidentFormProps) {
  const { t } = useTranslation();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [severity, setSeverity] = useState<IncidentSeverity | "">(initial?.severity ?? "");
  const [priority, setPriority] = useState<IncidentPriority | "">(initial?.priority ?? "");
  const [status, setStatus] = useState<IncidentStatus>(initial?.status ?? "Open");
  const [owner, setOwner] = useState(initial?.owner ?? "");
  const [startedAt, setStartedAt] = useState(isoToLocalInput(initial?.started_at));
  const [detectedAt, setDetectedAt] = useState(isoToLocalInput(initial?.detected_at));
  const [assetIds, setAssetIds] = useState<string[]>(
    initial?.affected_assets.map((a) => a.id) ?? [],
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (title.trim() === "") errs.title = t("incidentForm.errorTitleRequired");
    else if (title.trim().length > INCIDENT_LIMITS.title)
      errs.title = t("incidentForm.errorTitleTooLong", { max: INCIDENT_LIMITS.title });
    if (severity === "") errs.severity = t("incidentForm.errorTitleRequired");
    if (priority === "") errs.priority = t("incidentForm.errorTitleRequired");
    if (owner.trim().length > INCIDENT_LIMITS.owner)
      errs.owner = t("incidentForm.errorOwnerTooLong", { max: INCIDENT_LIMITS.owner });
    if (description.trim().length > INCIDENT_LIMITS.description)
      errs.description = t("incidentForm.errorDescriptionTooLong", {
        max: INCIDENT_LIMITS.description,
      });
    return errs;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    const input: IncidentCreateInput = {
      title: title.trim(),
      description: trimOrNull(description),
      severity: severity as IncidentSeverity,
      priority: priority as IncidentPriority,
      status,
      owner: trimOrNull(owner),
      started_at: localInputToIso(startedAt),
      detected_at: localInputToIso(detectedAt),
      asset_ids: assetIds,
    };

    setSubmitting(true);
    const result = await onSubmit(input);
    setSubmitting(false);

    if (result.ok) {
      onSuccess(result.data);
      return;
    }
    if (result.error.kind === "validation" && result.error.fields) {
      const mapped: Record<string, string> = { ...result.error.fields };
      if (mapped.asset_ids) mapped.asset_ids = t("incidentForm.errorAssets");
      setFieldErrors(mapped);
    }
    setFormError(t(formErrorKey(result.error)));
  }

  const optional = `(${t("incidentForm.optional")})`;
  const choose = { value: "", label: "—" };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <Input
        label={t("incidentFields.title")}
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={fieldErrors.title}
        disabled={submitting}
        autoComplete="off"
        maxLength={INCIDENT_LIMITS.title + 20}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t("incidentFields.severity")}
          value={severity}
          onChange={(e) => setSeverity(e.target.value as IncidentSeverity | "")}
          options={[choose, ...severityOptions(t)]}
          error={fieldErrors.severity}
          disabled={submitting}
        />
        <Select
          label={t("incidentFields.priority")}
          value={priority}
          onChange={(e) => setPriority(e.target.value as IncidentPriority | "")}
          options={[choose, ...priorityOptions(t)]}
          error={fieldErrors.priority}
          disabled={submitting}
        />
        <Select
          label={t("incidentFields.status")}
          value={status}
          onChange={(e) => setStatus(e.target.value as IncidentStatus)}
          options={incidentStatusOptions(t)}
          disabled={submitting}
        />
        <Input
          label={`${t("incidentFields.owner")} ${optional}`}
          name="owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          error={fieldErrors.owner}
          disabled={submitting}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={`${t("incidentFields.started")} ${optional}`}
          name="started_at"
          type="datetime-local"
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
          hint={t("incidentForm.hintStarted")}
          disabled={submitting}
        />
        <Input
          label={`${t("incidentFields.detected")} ${optional}`}
          name="detected_at"
          type="datetime-local"
          value={detectedAt}
          onChange={(e) => setDetectedAt(e.target.value)}
          hint={t("incidentForm.hintDetected")}
          disabled={submitting}
        />
      </div>

      <Textarea
        label={`${t("incidentFields.description")} ${optional}`}
        name="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={fieldErrors.description}
        hint={t("incidentForm.hintDescription")}
        disabled={submitting}
        rows={4}
        maxLength={INCIDENT_LIMITS.description + 200}
      />

      <IncidentAssetPicker
        value={assetIds}
        onChange={setAssetIds}
        seed={
          initial?.affected_assets.map((a) => ({
            id: a.id,
            name: a.name,
            asset_type: a.asset_type,
            environment: a.environment,
            criticality: a.criticality,
          })) ?? []
        }
        disabled={submitting}
        error={fieldErrors.asset_ids}
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          {t("incidentForm.cancel")}
        </Button>
        <Button type="submit" loading={submitting}>
          {submitting
            ? t("incidentForm.saving")
            : mode === "create"
              ? t("incidentForm.submitCreate")
              : t("incidentForm.submitEdit")}
        </Button>
      </div>
    </form>
  );
}
