"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Dialog } from "@/components/ui/overlay";
import { useTranslation } from "@/i18n";

export type FieldEditKind = "text" | "textarea" | "select" | "date" | "datetime";

export type FieldSaveResult = { ok: true } | { ok: false; error: string };

export interface FieldEditDialogProps {
  open: boolean;
  onClose: () => void;
  /** e.g. "Editar responsable". */
  title: string;
  kind: FieldEditKind;
  /** Current value as a string (ISO-less local string for date/datetime). */
  initialValue: string;
  /** Options for `kind: "select"`. */
  options?: SelectOption[];
  placeholder?: string;
  hint?: string;
  /** Allow an empty value (clears the field). Ignored for `select`. */
  optional?: boolean;
  maxLength?: number;
  /** `md` gives a roomier surface for long text (descriptions). */
  size?: "sm" | "md";
  /** Client validation → message or `null`. Runs before {@link onSave}. */
  validate?: (value: string) => string | null;
  /** Persist the change. The dialog stays open (and editable) on failure. */
  onSave: (value: string) => Promise<FieldSaveResult>;
}

/**
 * Reusable single-field editor. A small focused {@link Dialog} with the control,
 * inline validation / operation errors, and a Cancelar / Guardar footer. Used
 * for every scalar editable field on the Asset and Incident detail workspaces so
 * there is one editing primitive, not one dialog per field.
 */
export function FieldEditDialog({
  open,
  onClose,
  title,
  kind,
  initialValue,
  options = [],
  placeholder,
  hint,
  optional = false,
  maxLength,
  size = "sm",
  validate,
  onSave,
}: FieldEditDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = kind === "textarea" || kind === "text" ? value.trim() : value;
    if (!optional && kind !== "select" && trimmed === "") {
      setError(t("fieldEdit.required"));
      return;
    }
    const clientError = validate?.(trimmed) ?? null;
    if (clientError) {
      setError(clientError);
      return;
    }
    setError(null);
    setSaving(true);
    const res = await onSave(trimmed);
    setSaving(false);
    if (res.ok) {
      onClose();
    } else {
      setError(res.error);
    }
  }

  const control =
    kind === "select" ? (
      <Select
        label={title}
        hideLabel
        options={options}
        value={value}
        hint={hint}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
      />
    ) : kind === "textarea" ? (
      <Textarea
        label={title}
        rows={size === "md" ? 8 : 4}
        value={value}
        placeholder={placeholder}
        hint={hint}
        maxLength={maxLength}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
      />
    ) : (
      <Input
        label={title}
        hideLabel
        type={kind === "date" ? "date" : kind === "datetime" ? "datetime-local" : "text"}
        value={value}
        placeholder={placeholder}
        hint={hint}
        maxLength={maxLength}
        autoComplete="off"
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void handleSave();
          }
        }}
      />
    );

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title={title}
      size={size}
      hideClose
      dismissable={!saving}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            {t("fieldEdit.cancel")}
          </Button>
          <Button size="sm" onClick={() => void handleSave()} loading={saving}>
            {t("fieldEdit.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {control}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Dialog>
  );
}
