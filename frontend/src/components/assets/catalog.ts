/**
 * Display helpers for the asset catalog vocabularies.
 *
 * The values themselves are English and match the backend enums; these maps only
 * translate them for display. Each `*Options` helper returns
 * `{ value, label }[]` for a `<Select>` (value = English, label = translated).
 */

import type { SelectOption } from "@/components/ui/Select";
import type { TranslationKey } from "@/i18n";
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  CRITICALITIES,
  ENVIRONMENTS,
  type AssetStatus,
  type AssetType,
  type Criticality,
  type Environment,
} from "@/types/asset";

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export const ASSET_TYPE_KEYS: Record<AssetType, TranslationKey> = {
  Server: "assetCatalog.type.server",
  "Virtual Machine": "assetCatalog.type.virtualMachine",
  Database: "assetCatalog.type.database",
  Application: "assetCatalog.type.application",
  "Network Device": "assetCatalog.type.networkDevice",
  Container: "assetCatalog.type.container",
  "Kubernetes Cluster": "assetCatalog.type.kubernetesCluster",
  "Cloud Resource": "assetCatalog.type.cloudResource",
};

export const ENVIRONMENT_KEYS: Record<Environment, TranslationKey> = {
  Production: "assetCatalog.environment.production",
  Staging: "assetCatalog.environment.staging",
  Development: "assetCatalog.environment.development",
  Test: "assetCatalog.environment.test",
};

export const CRITICALITY_KEYS: Record<Criticality, TranslationKey> = {
  Critical: "assetCatalog.criticality.critical",
  High: "assetCatalog.criticality.high",
  Medium: "assetCatalog.criticality.medium",
  Low: "assetCatalog.criticality.low",
};

export const STATUS_KEYS: Record<AssetStatus, TranslationKey> = {
  Operational: "assetCatalog.status.operational",
  Degraded: "assetCatalog.status.degraded",
  Maintenance: "assetCatalog.status.maintenance",
  Offline: "assetCatalog.status.offline",
};

export const assetTypeLabel = (t: T, v: AssetType) => t(ASSET_TYPE_KEYS[v]);
export const environmentLabel = (t: T, v: Environment) => t(ENVIRONMENT_KEYS[v]);
export const criticalityLabel = (t: T, v: Criticality) => t(CRITICALITY_KEYS[v]);
export const statusLabel = (t: T, v: AssetStatus) => t(STATUS_KEYS[v]);

const opts = <V extends string>(values: readonly V[], keys: Record<V, TranslationKey>, t: T) =>
  values.map((v): SelectOption => ({ value: v, label: t(keys[v]) }));

export const assetTypeOptions = (t: T) => opts(ASSET_TYPES, ASSET_TYPE_KEYS, t);
export const environmentOptions = (t: T) => opts(ENVIRONMENTS, ENVIRONMENT_KEYS, t);
export const criticalityOptions = (t: T) => opts(CRITICALITIES, CRITICALITY_KEYS, t);
export const statusOptions = (t: T) => opts(ASSET_STATUSES, STATUS_KEYS, t);

/**
 * Tailwind tone for a criticality badge - a clear severity ramp:
 * Critical = danger (red), High = warning (orange), Medium = caution (amber /
 * yellow), Low = success (green). Never colour-only: the translated label is
 * always shown.
 */
export const CRITICALITY_TONE: Record<
  Criticality,
  "danger" | "warning" | "caution" | "success"
> = {
  Critical: "danger",
  High: "warning",
  Medium: "caution",
  Low: "success",
};

/** Tailwind tone for a status badge. */
export const STATUS_TONE: Record<AssetStatus, "success" | "warning" | "info" | "danger"> = {
  Operational: "success",
  Degraded: "warning",
  Maintenance: "info",
  Offline: "danger",
};
