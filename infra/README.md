# infra/

Home for infrastructure-as-code and deployment assets.

## Status: placeholder (v0.1)

Local orchestration for v0.1 lives in the root [`docker-compose.yml`](../docker-compose.yml).
Nothing else is implemented here yet - this directory is a deliberate marker of
where future work goes.

## Planned (future dedicated feature branches)

| Area | Directory (planned) | Notes |
| --- | --- | --- |
| Kubernetes manifests | `infra/k8s/` | Base + overlays (Kustomize) |
| Helm chart | `infra/helm/infraguard/` | Umbrella chart for the platform |
| Secret management | `infra/k8s/` | Kubernetes `Secret`s / external secret manager (e.g. External Secrets Operator, Vault). v0.1 uses env vars only. |
| CI/CD | `.github/workflows/` | Extends the v0.1 CI with security scanning + image publishing + deploy |
| Observability | `infra/observability/` | Metrics, logs, traces |

These are intentionally **not** part of v0.1. See
[`docs/architecture.md`](../docs/architecture.md) for the roadmap.
