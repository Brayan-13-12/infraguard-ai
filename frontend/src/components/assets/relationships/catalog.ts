import type { TranslationKey } from "@/i18n";
import type { RelationshipType } from "@/types/relationship";

/** i18n key pairs for a relationship type's forward / inverse Spanish label -
 * mirrors `app/models/relationship.py::RELATIONSHIP_TYPE_CATALOG` exactly. */
const LABEL_KEYS: Record<RelationshipType, TranslationKey> = {
  depends_on: "relationships.types.depends_on.label",
  hosts: "relationships.types.hosts.label",
  connects_to: "relationships.types.connects_to.label",
  uses: "relationships.types.uses.label",
  provides_service_to: "relationships.types.provides_service_to.label",
  member_of: "relationships.types.member_of.label",
};

const INVERSE_LABEL_KEYS: Record<RelationshipType, TranslationKey> = {
  depends_on: "relationships.types.depends_on.inverse",
  hosts: "relationships.types.hosts.inverse",
  connects_to: "relationships.types.connects_to.inverse",
  uses: "relationships.types.uses.inverse",
  provides_service_to: "relationships.types.provides_service_to.inverse",
  member_of: "relationships.types.member_of.inverse",
};

export type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function relationshipTypeLabel(t: T, type: RelationshipType): string {
  return t(LABEL_KEYS[type]);
}

export function relationshipInverseLabel(t: T, type: RelationshipType): string {
  return t(INVERSE_LABEL_KEYS[type]);
}

export function relationshipTypeOptions(t: T): { value: RelationshipType; label: string }[] {
  return (Object.keys(LABEL_KEYS) as RelationshipType[]).map((value) => ({
    value,
    label: relationshipTypeLabel(t, value),
  }));
}
