"""Curated demo infrastructure inventory (~72 assets).

A believable enterprise estate: recognizable groups (``prod-api-0N``,
``prod-k8s-worker-0N``, ...) across Production / Staging / Test / Development,
with a deliberate spread of criticality and status so the Dashboard charts,
filters, search and pagination all have something to show.

Only values from :mod:`app.models.asset` enums are used.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.asset import AssetStatus, AssetType, Criticality, Environment

SERVER = AssetType.SERVER.value
VM = AssetType.VIRTUAL_MACHINE.value
DB = AssetType.DATABASE.value
APP = AssetType.APPLICATION.value
NET = AssetType.NETWORK_DEVICE.value
CONTAINER = AssetType.CONTAINER.value
K8S = AssetType.KUBERNETES_CLUSTER.value
CLOUD = AssetType.CLOUD_RESOURCE.value

PROD = Environment.PRODUCTION.value
STAGING = Environment.STAGING.value
DEV = Environment.DEVELOPMENT.value
TEST = Environment.TEST.value

CRIT = Criticality.CRITICAL.value
HIGH = Criticality.HIGH.value
MED = Criticality.MEDIUM.value
LOW = Criticality.LOW.value

OP = AssetStatus.OPERATIONAL.value
DEGRADED = AssetStatus.DEGRADED.value
MAINT = AssetStatus.MAINTENANCE.value
OFFLINE = AssetStatus.OFFLINE.value

# Ownership domains (data strings, not RBAC users).
PLATFORM = "Platform Engineering"
SRE = "SRE"
NETOPS = "Network Operations"
DBTEAM = "Database Team"
SECOPS = "Security Operations"
CLOUDP = "Cloud Platform"
INFRA = "Infrastructure"
APPOPS = "Application Operations"
DEVOPS = "DevOps"


@dataclass(frozen=True, slots=True)
class AssetSpec:
    key: str
    asset_type: str
    environment: str
    criticality: str
    owner: str
    description: str
    ip_address: str
    status: str = OP
    is_active: bool = True
    created_days_ago: int = 150
    #: Set -> the asset is seeded straight into Trash (soft-deleted N days ago).
    trashed_days_ago: int | None = None
    #: Set -> the asset was trashed then restored (audit shows DELETE + RESTORE);
    #: the asset itself stays live.
    restored_days_ago: int | None = None

    @property
    def name(self) -> str:
        return self.key

    @property
    def hostname(self) -> str:
        return f"{self.key}.infra.internal"


def _A(key, asset_type, environment, criticality, owner, description, ip, **kw) -> AssetSpec:
    return AssetSpec(
        key=key,
        asset_type=asset_type,
        environment=environment,
        criticality=criticality,
        owner=owner,
        description=description,
        ip_address=ip,
        **kw,
    )


ASSET_SPECS: tuple[AssetSpec, ...] = (
    # --- Production: application & web tier -------------------------------
    _A("prod-api-01", APP, PROD, CRIT, PLATFORM,
       "Customer-facing REST API node behind the production load balancer.",
       "10.20.10.11", created_days_ago=210),
    _A("prod-api-02", APP, PROD, HIGH, PLATFORM,
       "Customer-facing REST API node behind the production load balancer.",
       "10.20.10.12", created_days_ago=210),
    _A("prod-api-03", APP, PROD, HIGH, PLATFORM,
       "Customer-facing REST API node (added for horizontal scale-out).",
       "10.20.10.13", created_days_ago=120),
    _A("prod-api-04", APP, PROD, HIGH, PLATFORM,
       "Customer-facing REST API node (added for horizontal scale-out).",
       "10.20.10.14", created_days_ago=64),
    _A("prod-api-05", APP, PROD, MED, PLATFORM,
       "Internal REST API node serving back-office and admin traffic.",
       "10.20.10.15", created_days_ago=64),
    _A("prod-web-01", SERVER, PROD, HIGH, APPOPS,
       "Nginx web tier serving the marketing site and static assets.",
       "10.20.11.11", created_days_ago=230),
    _A("prod-web-02", SERVER, PROD, HIGH, APPOPS,
       "Nginx web tier serving the marketing site and static assets.",
       "10.20.11.12", status=DEGRADED, created_days_ago=230),
    _A("prod-web-03", SERVER, PROD, MED, APPOPS,
       "Nginx web tier reverse-proxying the customer portal SPA.",
       "10.20.11.13", created_days_ago=140),
    # --- Production: data tier ------------------------------------------
    _A("prod-db-primary", DB, PROD, CRIT, DBTEAM,
       "Primary PostgreSQL 17 cluster (streaming-replication source) for core services.",
       "10.20.20.10", created_days_ago=240),
    _A("prod-db-replica-01", DB, PROD, HIGH, DBTEAM,
       "Hot-standby PostgreSQL replica for read scaling and failover.",
       "10.20.20.11", status=MAINT, created_days_ago=240),
    _A("prod-db-analytics-01", DB, PROD, MED, DBTEAM,
       "Analytics warehouse replica feeding BI dashboards via nightly ETL.",
       "10.20.20.20", created_days_ago=175),
    # --- Production: Kubernetes ----------------------------------------
    _A("prod-k8s-cp-01", K8S, PROD, CRIT, PLATFORM,
       "Kubernetes control-plane node (kube-apiserver and etcd member).",
       "10.20.30.11", created_days_ago=200),
    _A("prod-k8s-cp-02", K8S, PROD, CRIT, PLATFORM,
       "Kubernetes control-plane node (kube-apiserver and etcd member).",
       "10.20.30.12", created_days_ago=200),
    _A("prod-k8s-worker-01", SERVER, PROD, HIGH, PLATFORM,
       "Kubernetes worker node running production stateless workloads.",
       "10.20.31.11", created_days_ago=200),
    _A("prod-k8s-worker-02", SERVER, PROD, HIGH, PLATFORM,
       "Kubernetes worker node running production stateless workloads.",
       "10.20.31.12", created_days_ago=200),
    _A("prod-k8s-worker-03", SERVER, PROD, MED, PLATFORM,
       "Kubernetes worker node in the general compute pool.",
       "10.20.31.13", status=DEGRADED, created_days_ago=150),
    _A("prod-k8s-worker-04", SERVER, PROD, MED, PLATFORM,
       "Kubernetes worker node in the general compute pool.",
       "10.20.31.14", created_days_ago=150),
    _A("prod-k8s-worker-05", SERVER, PROD, LOW, PLATFORM,
       "Kubernetes worker node (spot capacity, batch workloads).",
       "10.20.31.15", status=OFFLINE, is_active=False, created_days_ago=95),
    # --- Production: network & edge ------------------------------------
    _A("prod-lb-01", NET, PROD, CRIT, NETOPS,
       "HAProxy load balancer terminating TLS for the production edge (active).",
       "10.20.0.10", created_days_ago=240),
    _A("prod-lb-02", NET, PROD, CRIT, NETOPS,
       "HAProxy load balancer terminating TLS for the production edge (standby).",
       "10.20.0.11", created_days_ago=240),
    _A("prod-fw-01", NET, PROD, CRIT, SECOPS,
       "Perimeter firewall / IPS at the datacenter edge (HA pair, active).",
       "10.20.0.1", created_days_ago=240),
    _A("prod-fw-02", NET, PROD, CRIT, SECOPS,
       "Perimeter firewall / IPS at the datacenter edge (HA pair, passive).",
       "10.20.0.2", created_days_ago=240),
    _A("prod-router-core-01", NET, PROD, CRIT, NETOPS,
       "Core router aggregating datacenter uplinks and BGP peering.",
       "10.20.0.5", created_days_ago=240),
    _A("prod-switch-01", NET, PROD, MED, NETOPS,
       "Top-of-rack switch for the production compute row.",
       "10.20.0.20", created_days_ago=220),
    _A("prod-dns-01", NET, PROD, HIGH, NETOPS,
       "Authoritative and recursive DNS resolver (anycast pair, node 1).",
       "10.20.0.53", created_days_ago=220),
    _A("prod-dns-02", NET, PROD, HIGH, NETOPS,
       "Authoritative and recursive DNS resolver (anycast pair, node 2).",
       "10.20.0.54", status=DEGRADED, created_days_ago=220),
    # --- Production: platform services --------------------------------
    _A("prod-cache-01", SERVER, PROD, HIGH, PLATFORM,
       "Redis cache and session store (Sentinel-managed, primary).",
       "10.20.12.11", created_days_ago=190),
    _A("prod-cache-02", SERVER, PROD, HIGH, PLATFORM,
       "Redis cache and session store (Sentinel-managed, replica).",
       "10.20.12.12", created_days_ago=190),
    _A("prod-mq-01", SERVER, PROD, HIGH, PLATFORM,
       "Kafka broker for the asynchronous event pipeline.",
       "10.20.13.11", created_days_ago=160),
    _A("prod-storage-01", CLOUD, PROD, HIGH, INFRA,
       "Distributed block-storage node backing stateful workloads.",
       "10.20.40.11", created_days_ago=210),
    _A("prod-storage-02", CLOUD, PROD, HIGH, INFRA,
       "Distributed block-storage node backing stateful workloads.",
       "10.20.40.12", status=MAINT, created_days_ago=210),
    _A("prod-backup-01", SERVER, PROD, MED, INFRA,
       "Backup coordinator running nightly snapshots and off-site replication.",
       "10.20.41.10", created_days_ago=200, restored_days_ago=26),
    _A("prod-monitoring-01", SERVER, PROD, HIGH, SRE,
       "Prometheus and Grafana observability stack for production.",
       "10.20.50.11", created_days_ago=205),
    _A("prod-monitoring-02", SERVER, PROD, MED, SRE,
       "Alertmanager and Loki log-aggregation node.",
       "10.20.50.12", status=MAINT, created_days_ago=205),
    _A("prod-idp-01", APP, PROD, CRIT, SECOPS,
       "Keycloak identity provider issuing OIDC tokens for internal apps (HA node 1).",
       "10.20.15.11", created_days_ago=220),
    _A("prod-idp-02", APP, PROD, HIGH, SECOPS,
       "Keycloak identity provider issuing OIDC tokens for internal apps (HA node 2).",
       "10.20.15.12", created_days_ago=220),
    _A("prod-vault-01", APP, PROD, CRIT, SECOPS,
       "HashiCorp Vault secrets manager (auto-unseal, HA).",
       "10.20.15.20", created_days_ago=215),
    # --- Staging -------------------------------------------------------
    _A("staging-api-01", APP, STAGING, HIGH, PLATFORM,
       "Pre-production API node mirroring the production topology.",
       "10.30.10.11", created_days_ago=170),
    _A("staging-api-02", APP, STAGING, MED, PLATFORM,
       "Pre-production API node used for load and soak testing.",
       "10.30.10.12", status=DEGRADED, created_days_ago=120),
    _A("staging-api-03", APP, STAGING, MED, PLATFORM,
       "Pre-production API node used for release validation.",
       "10.30.10.13", created_days_ago=90),
    _A("staging-web-01", SERVER, STAGING, MED, APPOPS,
       "Staging web tier for UAT of the customer portal.",
       "10.30.11.11", created_days_ago=150, restored_days_ago=40),
    _A("staging-web-02", SERVER, STAGING, LOW, APPOPS,
       "Staging web tier (secondary, occasionally powered down).",
       "10.30.11.12", status=OFFLINE, is_active=False, created_days_ago=150),
    _A("staging-db-01", DB, STAGING, HIGH, DBTEAM,
       "Staging PostgreSQL restored weekly from a production snapshot.",
       "10.30.20.10", created_days_ago=170),
    _A("staging-k8s-worker-01", SERVER, STAGING, MED, PLATFORM,
       "Staging Kubernetes worker node running release candidates.",
       "10.30.31.11", created_days_ago=160),
    _A("staging-k8s-worker-02", SERVER, STAGING, MED, PLATFORM,
       "Staging Kubernetes worker node running release candidates.",
       "10.30.31.12", status=MAINT, created_days_ago=160),
    _A("staging-k8s-worker-03", SERVER, STAGING, LOW, PLATFORM,
       "Staging Kubernetes worker node (batch and CI workloads).",
       "10.30.31.13", created_days_ago=110),
    _A("staging-cache-01", SERVER, STAGING, MED, PLATFORM,
       "Staging Redis instance for portal session testing.",
       "10.30.12.11", created_days_ago=140),
    _A("staging-lb-01", NET, STAGING, MED, NETOPS,
       "Staging load balancer fronting the pre-production environment.",
       "10.30.0.10", created_days_ago=170),
    _A("staging-monitoring-01", SERVER, STAGING, MED, SRE,
       "Staging observability stack (Prometheus / Grafana).",
       "10.30.50.11", created_days_ago=150, trashed_days_ago=18),
    _A("staging-cicd-01", SERVER, STAGING, MED, DEVOPS,
       "Staging deployment controller for release-pipeline dry runs.",
       "10.30.60.11", created_days_ago=130),
    # --- Test / QA ----------------------------------------------------
    _A("qa-api-01", APP, TEST, HIGH, APPOPS,
       "QA API node for the regression and end-to-end test suites.",
       "10.40.10.11", created_days_ago=120),
    _A("qa-api-02", APP, TEST, LOW, APPOPS,
       "QA API node for exploratory and manual testing.",
       "10.40.10.12", created_days_ago=80),
    _A("qa-web-01", SERVER, TEST, MED, APPOPS,
       "QA web tier for cross-browser UI testing.",
       "10.40.11.11", status=DEGRADED, created_days_ago=100),
    _A("qa-db-01", DB, TEST, MED, DBTEAM,
       "QA PostgreSQL seeded with synthetic datasets for automated tests.",
       "10.40.20.10", created_days_ago=120),
    _A("qa-k8s-worker-01", SERVER, TEST, MED, PLATFORM,
       "QA Kubernetes worker node running the automated test environment.",
       "10.40.31.11", created_days_ago=110),
    _A("qa-k8s-worker-02", SERVER, TEST, LOW, PLATFORM,
       "QA Kubernetes worker node (ephemeral test namespaces).",
       "10.40.31.12", created_days_ago=70, trashed_days_ago=9),
    _A("qa-lb-01", NET, TEST, LOW, NETOPS,
       "QA load balancer for integration-test traffic shaping.",
       "10.40.0.10", created_days_ago=110),
    _A("qa-runner-01", CONTAINER, TEST, LOW, DEVOPS,
       "Containerized QA test runner (parallel executor pool).",
       "10.40.61.11", created_days_ago=60),
    _A("qa-runner-02", CONTAINER, TEST, LOW, DEVOPS,
       "Containerized QA test runner (scaled down outside business hours).",
       "10.40.61.12", status=OFFLINE, is_active=False, created_days_ago=60),
    # --- Development -------------------------------------------------
    _A("dev-app-01", APP, DEV, HIGH, PLATFORM,
       "Shared development API used by the platform team's feature branches.",
       "10.50.10.11", created_days_ago=180),
    _A("dev-app-02", APP, DEV, MED, APPOPS,
       "Shared development API for the application squads.",
       "10.50.10.12", created_days_ago=140),
    _A("dev-app-03", APP, DEV, MED, APPOPS,
       "Development API host for the payments integration work.",
       "10.50.10.13", created_days_ago=95),
    _A("dev-app-04", APP, DEV, LOW, APPOPS,
       "Development API host for prototype and spike work.",
       "10.50.10.14", created_days_ago=55),
    _A("dev-db-01", DB, DEV, MED, DBTEAM,
       "Development PostgreSQL shared across feature environments.",
       "10.50.20.10", status=MAINT, created_days_ago=175),
    _A("dev-db-02", DB, DEV, LOW, DBTEAM,
       "Development PostgreSQL for the analytics prototype.",
       "10.50.20.11", created_days_ago=85),
    _A("dev-k8s-01", K8S, DEV, MED, PLATFORM,
       "Single-node development Kubernetes cluster for local-style integration.",
       "10.50.30.10", created_days_ago=160),
    _A("dev-cache-01", SERVER, DEV, LOW, PLATFORM,
       "Development Redis instance for cache-behaviour testing.",
       "10.50.12.11", created_days_ago=120, trashed_days_ago=33),
    _A("dev-sandbox-01", VM, DEV, LOW, CLOUDP,
       "Engineer sandbox VM for infrastructure-as-code experiments.",
       "10.50.90.11", created_days_ago=70, trashed_days_ago=5),
    _A("dev-sandbox-02", VM, DEV, LOW, CLOUDP,
       "Engineer sandbox VM for security-tooling evaluation.",
       "10.50.90.12", created_days_ago=45),
    _A("dev-sandbox-03", VM, DEV, LOW, CLOUDP,
       "Engineer sandbox VM (powered off when not in use).",
       "10.50.90.13", status=OFFLINE, is_active=False, created_days_ago=45),
    _A("dev-ci-01", SERVER, DEV, LOW, DEVOPS,
       "Development CI runner for pre-merge pipeline checks.",
       "10.50.60.11", created_days_ago=130),
)
