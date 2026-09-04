"""Curated demo asset relationships (~90 edges across recognizable clusters).

Deliberately **not** a fully-connected mesh: each environment forms its own
realistic tiered topology (edge network -> load balancer -> web -> API ->
data/cache -> Kubernetes hosting -> monitoring/backup/identity), using only
the six implemented relationship types (see
``app/models/relationship.py::RelationshipType``). Only asset keys that exist
in :data:`app.seeds.assets.ASSET_SPECS` are referenced.
"""

from __future__ import annotations

from dataclasses import dataclass

DEPENDS_ON = "depends_on"
HOSTS = "hosts"
CONNECTS_TO = "connects_to"
USES = "uses"
PROVIDES_SERVICE_TO = "provides_service_to"
MEMBER_OF = "member_of"


@dataclass(frozen=True, slots=True)
class RelationshipSpec:
    #: Stable key = "{source_key}:{relationship_type}:{target_key}" (derived
    #: below) - the seed's idempotency key, distinct from the display name.
    source_key: str
    relationship_type: str
    target_key: str
    description: str | None = None

    @property
    def key(self) -> str:
        return f"{self.source_key}:{self.relationship_type}:{self.target_key}"


def _R(source: str, rel: str, target: str, description: str | None = None) -> RelationshipSpec:
    return RelationshipSpec(source, rel, target, description)


RELATIONSHIP_SPECS: tuple[RelationshipSpec, ...] = (
    # -- Production: edge network -----------------------------------------
    _R("prod-fw-01", CONNECTS_TO, "prod-router-core-01"),
    _R("prod-fw-02", CONNECTS_TO, "prod-router-core-01"),
    _R("prod-router-core-01", CONNECTS_TO, "prod-switch-01"),
    _R("prod-switch-01", CONNECTS_TO, "prod-lb-01"),
    _R("prod-switch-01", CONNECTS_TO, "prod-lb-02"),
    _R("prod-dns-01", PROVIDES_SERVICE_TO, "prod-lb-01"),
    _R("prod-dns-02", CONNECTS_TO, "prod-dns-01", "Réplica secundaria de DNS"),
    # -- Production: load balancing -> web tier -----------------------------
    _R("prod-lb-01", PROVIDES_SERVICE_TO, "prod-web-01"),
    _R("prod-lb-01", PROVIDES_SERVICE_TO, "prod-web-02"),
    _R("prod-lb-02", PROVIDES_SERVICE_TO, "prod-web-03"),
    # -- Production: web tier -> API tier ------------------------------------
    _R("prod-web-01", DEPENDS_ON, "prod-api-01"),
    _R("prod-web-02", DEPENDS_ON, "prod-api-02"),
    _R("prod-web-03", DEPENDS_ON, "prod-api-03"),
    # -- Production: API tier -> data / cache / messaging --------------------
    _R("prod-api-01", DEPENDS_ON, "prod-db-primary"),
    _R("prod-api-01", USES, "prod-cache-01"),
    _R("prod-api-02", DEPENDS_ON, "prod-db-primary"),
    _R("prod-api-02", USES, "prod-cache-01"),
    _R("prod-api-03", DEPENDS_ON, "prod-db-replica-01"),
    _R("prod-api-03", USES, "prod-cache-02"),
    _R("prod-api-04", DEPENDS_ON, "prod-db-primary"),
    _R("prod-api-04", USES, "prod-mq-01"),
    _R("prod-api-05", DEPENDS_ON, "prod-db-analytics-01"),
    _R("prod-db-replica-01", DEPENDS_ON, "prod-db-primary", "Replicación en streaming"),
    # -- Production: identity ------------------------------------------------
    _R("prod-api-01", DEPENDS_ON, "prod-idp-01"),
    _R("prod-api-02", DEPENDS_ON, "prod-idp-01"),
    _R("prod-api-04", DEPENDS_ON, "prod-idp-01"),
    _R("prod-idp-01", DEPENDS_ON, "prod-vault-01"),
    _R("prod-idp-02", CONNECTS_TO, "prod-idp-01", "Instancia secundaria de alta disponibilidad"),
    # -- Production: Kubernetes -----------------------------------------------
    _R("prod-k8s-cp-02", CONNECTS_TO, "prod-k8s-cp-01", "Par de alta disponibilidad"),
    _R("prod-k8s-worker-01", MEMBER_OF, "prod-k8s-cp-01"),
    _R("prod-k8s-worker-02", MEMBER_OF, "prod-k8s-cp-01"),
    _R("prod-k8s-worker-03", MEMBER_OF, "prod-k8s-cp-01"),
    _R("prod-k8s-worker-04", MEMBER_OF, "prod-k8s-cp-01"),
    _R("prod-k8s-worker-05", MEMBER_OF, "prod-k8s-cp-01"),
    _R("prod-k8s-worker-01", HOSTS, "prod-api-01"),
    _R("prod-k8s-worker-02", HOSTS, "prod-api-02"),
    _R("prod-k8s-worker-03", HOSTS, "prod-api-03"),
    _R("prod-k8s-worker-04", HOSTS, "prod-web-01"),
    _R("prod-k8s-worker-05", HOSTS, "prod-web-02"),
    # -- Production: storage / backup / monitoring ----------------------------
    _R("prod-db-primary", USES, "prod-storage-01"),
    _R("prod-db-analytics-01", USES, "prod-storage-02"),
    _R("prod-backup-01", USES, "prod-storage-01"),
    _R("prod-backup-01", CONNECTS_TO, "prod-db-primary", "Respaldo nocturno programado"),
    _R("prod-monitoring-01", CONNECTS_TO, "prod-api-01"),
    _R("prod-monitoring-01", CONNECTS_TO, "prod-db-primary"),
    _R("prod-monitoring-01", CONNECTS_TO, "prod-web-01"),
    _R("prod-monitoring-02", CONNECTS_TO, "prod-k8s-cp-01"),
    _R("prod-monitoring-02", CONNECTS_TO, "prod-lb-01"),
    _R("prod-cache-02", CONNECTS_TO, "prod-cache-01", "Réplica de caché"),
    _R("prod-backup-01", CONNECTS_TO, "prod-db-analytics-01"),
    _R("prod-idp-02", DEPENDS_ON, "prod-vault-01"),
    _R("prod-dns-01", CONNECTS_TO, "prod-router-core-01"),
    # -- Staging --------------------------------------------------------------
    _R("staging-lb-01", PROVIDES_SERVICE_TO, "staging-web-01"),
    _R("staging-lb-01", PROVIDES_SERVICE_TO, "staging-web-02"),
    _R("staging-web-01", DEPENDS_ON, "staging-api-01"),
    _R("staging-web-02", DEPENDS_ON, "staging-api-02"),
    _R("staging-api-01", DEPENDS_ON, "staging-db-01"),
    _R("staging-api-01", USES, "staging-cache-01"),
    _R("staging-api-02", DEPENDS_ON, "staging-db-01"),
    _R("staging-api-03", DEPENDS_ON, "staging-db-01"),
    _R("staging-k8s-worker-01", HOSTS, "staging-api-01"),
    _R("staging-k8s-worker-02", HOSTS, "staging-api-02"),
    _R("staging-k8s-worker-03", HOSTS, "staging-web-01"),
    _R("staging-api-03", USES, "staging-cache-01"),
    _R("staging-monitoring-01", CONNECTS_TO, "staging-api-01"),
    _R("staging-monitoring-01", CONNECTS_TO, "staging-web-02"),
    _R("staging-cicd-01", PROVIDES_SERVICE_TO, "staging-api-01", "Despliegue continuo"),
    _R("staging-cicd-01", PROVIDES_SERVICE_TO, "staging-web-01"),
    # -- QA ---------------------------------------------------------------
    _R("qa-lb-01", PROVIDES_SERVICE_TO, "qa-web-01"),
    _R("qa-web-01", DEPENDS_ON, "qa-api-01"),
    _R("qa-api-01", DEPENDS_ON, "qa-db-01"),
    _R("qa-api-02", DEPENDS_ON, "qa-db-01"),
    _R("qa-k8s-worker-01", HOSTS, "qa-api-01"),
    _R("qa-k8s-worker-02", HOSTS, "qa-web-01"),
    _R("qa-runner-01", USES, "qa-api-01", "Pruebas automatizadas"),
    _R("qa-runner-02", USES, "qa-api-02"),
    # -- Development -----------------------------------------------------
    _R("dev-app-01", DEPENDS_ON, "dev-db-01"),
    _R("dev-app-02", DEPENDS_ON, "dev-db-01"),
    _R("dev-app-03", DEPENDS_ON, "dev-db-02"),
    _R("dev-app-04", USES, "dev-cache-01"),
    _R("dev-k8s-01", HOSTS, "dev-app-01"),
    _R("dev-k8s-01", HOSTS, "dev-app-02"),
    _R("dev-sandbox-01", USES, "dev-cache-01"),
    _R("dev-sandbox-01", CONNECTS_TO, "dev-app-01"),
    _R("dev-sandbox-02", CONNECTS_TO, "dev-app-02"),
    _R("dev-sandbox-03", CONNECTS_TO, "dev-db-01"),
    _R("dev-ci-01", PROVIDES_SERVICE_TO, "dev-app-01"),
    _R("dev-ci-01", PROVIDES_SERVICE_TO, "dev-app-02"),
)
