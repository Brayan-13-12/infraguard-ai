"""Curated demo incidents (~30) with realistic asset relationships.

Each spec is turned into a persisted :class:`~app.models.incident.Incident`
plus a well-formed, backdated timeline (``CREATED`` -> ``ASSET_ADDED`` ->
status / severity / priority changes -> ``RESOLVED``) by
:mod:`app.seeds.timeline`. Only enum values from
:mod:`app.models.incident` are used.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.incident import IncidentPriority, IncidentSeverity, IncidentStatus

S_CRIT = IncidentSeverity.CRITICAL.value
S_HIGH = IncidentSeverity.HIGH.value
S_MED = IncidentSeverity.MEDIUM.value
S_LOW = IncidentSeverity.LOW.value

OPEN = IncidentStatus.OPEN.value
INVESTIGATING = IncidentStatus.INVESTIGATING.value
IDENTIFIED = IncidentStatus.IDENTIFIED.value
MONITORING = IncidentStatus.MONITORING.value
RESOLVED = IncidentStatus.RESOLVED.value
CLOSED = IncidentStatus.CLOSED.value

P1 = IncidentPriority.P1.value
P2 = IncidentPriority.P2.value
P3 = IncidentPriority.P3.value
P4 = IncidentPriority.P4.value


@dataclass(frozen=True, slots=True)
class IncidentSpec:
    key: str
    title: str
    description: str
    severity: str
    priority: str
    owner: str
    asset_keys: tuple[str, ...]
    started_days_ago: float
    #: Ordered statuses the incident moved through after ``Open`` (the last entry
    #: is the current status). Empty -> stays ``Open``.
    path: tuple[str, ...] = ()
    #: Hours from ``started_at`` to the final timeline event.
    span_hours: float = 6.0
    comments: tuple[str, ...] = ()
    severity_changed_from: str | None = None
    priority_changed_from: str | None = None
    trashed_days_ago: float | None = None

    @property
    def status(self) -> str:
        return self.path[-1] if self.path else OPEN


def _I(key, title, description, severity, priority, owner, assets, started_days_ago, **kw):
    return IncidentSpec(
        key=key,
        title=title,
        description=description,
        severity=severity,
        priority=priority,
        owner=owner,
        asset_keys=tuple(assets),
        started_days_ago=started_days_ago,
        **kw,
    )


INCIDENT_SPECS: tuple[IncidentSpec, ...] = (
    # --- Active / recent ------------------------------------------------
    _I("api-latency-degradation",
       "Elevated p99 latency on the customer API",
       "p99 response time on /v1 endpoints rose above the 800ms SLO after the "
       "afternoon traffic peak. Connection pool to the primary database is "
       "saturating under load.",
       S_HIGH, P2, "Platform Engineering",
       ["prod-api-01", "prod-api-02", "prod-api-03", "prod-db-primary"],
       0.3, path=(INVESTIGATING,), span_hours=3,
       comments=("Escalada al equipo de base de datos para revisar el pool de conexiones.",)),
    _I("db-connection-saturation",
       "Database connection pool saturation",
       "prod-db-primary reached max_connections during the nightly batch window. "
       "API nodes are queuing and shedding a small percentage of requests.",
       S_CRIT, P1, "Database Team",
       ["prod-db-primary", "prod-api-01", "prod-api-02"],
       1.2, path=(INVESTIGATING, IDENTIFIED), span_hours=5,
       comments=("Causa raíz: una consulta analítica sin límite abrió cientos de conexiones.",)),
    _I("k8s-node-disk-pressure",
       "Disk pressure on Kubernetes worker node",
       "kubelet on prod-k8s-worker-03 reported DiskPressure and began evicting "
       "pods. Container image cache and log volume filled the node disk.",
       S_MED, P3, "Platform Engineering",
       ["prod-k8s-worker-03"],
       0.6, path=(INVESTIGATING,), span_hours=2),
    _I("cert-expiry-warning",
       "TLS certificate approaching expiry on the production edge",
       "The wildcard certificate served by prod-lb-01 / prod-lb-02 expires in "
       "9 days. Automated renewal did not complete because the ACME challenge "
       "path was blocked.",
       S_MED, P2, "Security Operations",
       ["prod-lb-01", "prod-lb-02"],
       2.0, path=(IDENTIFIED,), span_hours=1),
    _I("lb-healthcheck-flapping",
       "Load balancer health checks flapping for the API pool",
       "prod-lb-01 is intermittently marking API backends unhealthy. Health-check "
       "timeout is too aggressive for the current GC pause profile.",
       S_MED, P3, "Network Operations",
       ["prod-lb-01", "prod-api-03", "prod-api-04"],
       3.5, path=(INVESTIGATING, MONITORING), span_hours=8,
       comments=("Se aumentó el timeout del health-check a 5s; en observación.",)),
    _I("auth-service-outage",
       "Authentication service outage",
       "prod-idp-01 became unresponsive and failover to prod-idp-02 was delayed. "
       "Internal tools could not obtain OIDC tokens for roughly 12 minutes.",
       S_CRIT, P1, "Security Operations",
       ["prod-idp-01", "prod-idp-02"],
       0.9, path=(INVESTIGATING, IDENTIFIED, MONITORING), span_hours=4,
       comments=(
           "Failover manual ejecutado; sesiones existentes no se vieron afectadas.",
           "Postmortem programado. Revisar los health-checks del par HA.",
       )),
    _I("packet-loss-network-segment",
       "Packet loss between production network segments",
       "Intermittent 2-4% packet loss observed between the compute row switch "
       "and the core router. A failing SFP on prod-switch-01 is the likely cause.",
       S_HIGH, P2, "Network Operations",
       ["prod-switch-01", "prod-router-core-01"],
       4.5, path=(INVESTIGATING, IDENTIFIED), span_hours=10),
    _I("redis-memory-pressure",
       "Redis memory pressure and eviction storm",
       "prod-cache-01 crossed the maxmemory threshold and started evicting keys "
       "aggressively, increasing cache-miss rate and database load.",
       S_HIGH, P2, "Platform Engineering",
       ["prod-cache-01", "prod-cache-02", "prod-db-primary"],
       5.5, path=(INVESTIGATING, MONITORING), span_hours=6),
    _I("dns-resolution-degradation",
       "DNS resolution degradation",
       "prod-dns-02 is returning SERVFAIL for a subset of external zones. Recursive "
       "resolver cache appears corrupted after an upstream timeout.",
       S_MED, P2, "Network Operations",
       ["prod-dns-01", "prod-dns-02"],
       0.2, span_hours=1),
    _I("http-5xx-elevated",
       "Elevated HTTP 5xx responses on the customer portal",
       "prod-web-02 is serving ~3% HTTP 502 responses. Upstream API timeouts "
       "during the latency incident are surfacing as gateway errors.",
       S_MED, P3, "Application Operations",
       ["prod-web-02", "prod-api-01"],
       0.5, path=(INVESTIGATING,), span_hours=2),
    _I("storage-latency-spike",
       "Elevated I/O latency on block storage",
       "prod-storage-01 write latency doubled during a rebalance operation, "
       "slowing database checkpoints.",
       S_LOW, P4, "Infrastructure",
       ["prod-storage-01", "prod-db-primary"],
       6.0, path=(MONITORING,), span_hours=12),
    _I("mq-consumer-lag",
       "Consumer lag building on the event pipeline",
       "Kafka consumer group for the notifications service is lagging by ~40k "
       "messages after a deploy introduced a slow handler.",
       S_LOW, P3, "Platform Engineering",
       ["prod-mq-01"],
       1.8, path=(INVESTIGATING,), span_hours=3),
    # --- Resolved: recent (feeds "resolved recently") -----------------
    _I("backup-job-failure",
       "Nightly backup job failed",
       "The 02:00 UTC snapshot job on prod-backup-01 failed with a transient "
       "object-store timeout. A manual re-run completed successfully.",
       S_MED, P3, "Infrastructure",
       ["prod-backup-01", "prod-db-primary"],
       2.5, path=(INVESTIGATING, IDENTIFIED, RESOLVED), span_hours=4,
       comments=("Re-ejecución manual completada; se añadió reintento con backoff.",)),
    _I("monitoring-agent-unavailable",
       "Monitoring agent unavailable on several nodes",
       "The metrics agent stopped reporting from six worker nodes after a config "
       "push. Rolled back the config and restarted the agents.",
       S_LOW, P4, "SRE",
       ["prod-monitoring-01", "prod-k8s-worker-01", "prod-k8s-worker-02"],
       3.0, path=(INVESTIGATING, RESOLVED), span_hours=2),
    _I("unexpected-service-restart",
       "Unexpected restart of the API gateway process",
       "The gateway process on prod-api-05 was OOM-killed and restarted by the "
       "supervisor. Memory limit was raised and a leak ticket filed.",
       S_MED, P3, "Platform Engineering",
       ["prod-api-05"],
       4.0, path=(INVESTIGATING, IDENTIFIED, RESOLVED), span_hours=5),
    _I("cache-replica-desync",
       "Redis replica fell out of sync",
       "prod-cache-02 disconnected from the primary and required a full resync. "
       "No client impact; served from the primary throughout.",
       S_LOW, P4, "Platform Engineering",
       ["prod-cache-02"],
       5.0, path=(RESOLVED,), span_hours=1),
    _I("staging-deploy-failure",
       "Release-candidate deploy failed in staging",
       "The pipeline failed to roll out to staging-k8s-worker-01/02 due to an "
       "image pull error. Registry credentials had expired.",
       S_LOW, P3, "DevOps",
       ["staging-k8s-worker-01", "staging-k8s-worker-02", "staging-cicd-01"],
       6.5, path=(INVESTIGATING, RESOLVED), span_hours=3),
    _I("db-replica-lag",
       "Replication lag on the read replica",
       "prod-db-replica-01 lag rose to ~90s during a bulk import. Read traffic "
       "was shifted to the primary until it caught up.",
       S_MED, P3, "Database Team",
       ["prod-db-replica-01", "prod-db-primary"],
       6.8, path=(INVESTIGATING, MONITORING, RESOLVED), span_hours=7),
    _I("firewall-rule-misconfig",
       "Firewall change blocked internal service traffic",
       "A perimeter rule change on prod-fw-01 inadvertently dropped traffic from "
       "the CI network to the artifact store. Reverted within the change window.",
       S_HIGH, P2, "Security Operations",
       ["prod-fw-01"],
       5.5, path=(IDENTIFIED, RESOLVED), span_hours=2,
       comments=("Cambio revertido; se añadió validación previa en el proceso de cambios.",)),
    # --- Resolved / closed: older --------------------------------------
    _I("k8s-node-unavailable",
       "Kubernetes worker node unavailable",
       "prod-k8s-worker-05 stopped responding to the control plane after a "
       "kernel panic. The node was cordoned, drained and replaced.",
       S_HIGH, P2, "Platform Engineering",
       ["prod-k8s-worker-05", "prod-k8s-cp-01"],
       22.0, path=(INVESTIGATING, IDENTIFIED, RESOLVED, CLOSED), span_hours=18),
    _I("storage-capacity-threshold",
       "Storage capacity threshold exceeded",
       "The block-storage pool crossed 85% utilization. Reclaimed space from "
       "orphaned volumes and expanded the pool.",
       S_MED, P3, "Infrastructure",
       ["prod-storage-01", "prod-storage-02"],
       30.0, path=(IDENTIFIED, RESOLVED, CLOSED), span_hours=48),
    _I("idp-token-latency",
       "Slow OIDC token issuance",
       "Token issuance latency on prod-idp-01 exceeded 1s during business hours. "
       "Tuned the JVM heap and connection pool.",
       S_LOW, P4, "Security Operations",
       ["prod-idp-01"],
       35.0, path=(INVESTIGATING, RESOLVED, CLOSED), span_hours=12),
    _I("router-firmware-bug",
       "Core router memory leak after firmware upgrade",
       "prod-router-core-01 exhibited a slow memory leak following a firmware "
       "upgrade. Vendor provided a patched build; applied during maintenance.",
       S_HIGH, P2, "Network Operations",
       ["prod-router-core-01"],
       44.0, path=(INVESTIGATING, IDENTIFIED, MONITORING, RESOLVED, CLOSED), span_hours=72),
    _I("analytics-etl-failure",
       "Analytics ETL pipeline failure",
       "The nightly ETL into prod-db-analytics-01 failed for two consecutive "
       "runs due to a schema drift in an upstream export.",
       S_LOW, P4, "Database Team",
       ["prod-db-analytics-01"],
       52.0, path=(INVESTIGATING, RESOLVED, CLOSED), span_hours=20),
    _I("web-tier-memory-leak",
       "Memory leak in the web tier",
       "prod-web-01 required a rolling restart every ~36h due to a slow memory "
       "leak in a logging middleware. Fixed in the following release.",
       S_MED, P3, "Application Operations",
       ["prod-web-01", "prod-web-03"],
       60.0, path=(IDENTIFIED, MONITORING, RESOLVED, CLOSED), span_hours=96),
    _I("vault-seal-event",
       "Vault auto-unseal failure after node reboot",
       "prod-vault-01 came up sealed after an unplanned reboot because the KMS "
       "endpoint was briefly unreachable. Unsealed once connectivity returned.",
       S_CRIT, P1, "Security Operations",
       ["prod-vault-01"],
       75.0, path=(INVESTIGATING, IDENTIFIED, RESOLVED, CLOSED), span_hours=3),
    _I("cdn-origin-errors",
       "Origin errors during a traffic spike",
       "A marketing campaign drove a 4x traffic spike; the web tier returned "
       "origin errors until additional capacity was added.",
       S_MED, P3, "Application Operations",
       ["prod-web-01", "prod-web-02", "prod-lb-01"],
       90.0, path=(INVESTIGATING, IDENTIFIED, RESOLVED, CLOSED), span_hours=6,
       severity_changed_from=S_LOW),
    # --- Trashed demo incidents (soft-deleted) ------------------------
    _I("dup-latency-report",
       "Duplicate latency report (merged)",
       "Duplicate of the API latency incident, opened by a second on-call "
       "engineer. Merged and moved to Trash.",
       S_LOW, P4, "Platform Engineering",
       ["prod-api-02"],
       1.0, path=(INVESTIGATING,), span_hours=1, trashed_days_ago=0.7),
    _I("false-alarm-disk",
       "False alarm: disk usage alert",
       "A disk-usage alert on staging-db-01 fired on a stale metric. No action "
       "needed; record moved to Trash.",
       S_LOW, P4, "Database Team",
       ["staging-db-01"],
       4.0, span_hours=1, trashed_days_ago=2.5),
    _I("test-incident-runbook",
       "Runbook validation exercise",
       "A planned game-day exercise to validate the incident runbook. Kept for "
       "reference in Trash rather than deleted.",
       S_MED, P3, "SRE",
       ["prod-monitoring-01", "prod-api-01"],
       14.0, path=(INVESTIGATING, IDENTIFIED, RESOLVED), span_hours=2,
       trashed_days_ago=10.0),
)
