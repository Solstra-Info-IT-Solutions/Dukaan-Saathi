# Phase 12 — Dynamic Subscriptions, Plans, Feature Flags, Entitlements

Status: Not started · Depends on: Phase 11

## Scope
Backlog items BL-1201…BL-1208 in [../BACKLOG.md](../BACKLOG.md). Specification: [features/subscriptions-and-entitlements.md](../features/subscriptions-and-entitlements.md), [../FEATURE_CONFIGURATION.md](../FEATURE_CONFIGURATION.md).

## Acceptance criteria
- [ ] Plan/entitlement edits enforced immediately server-side.
- [ ] Flags with rollout %, overrides, kill switch, revisions and rollback.
- [ ] Lifecycle job transitions; billing never blocked.
- [ ] S-04, S-05, S-09 pass.

## External credentials / configuration
Payment provider account + webhook secret (OD-05), or manual activation only.

## Phase report
Filled at phase end using the template in PROJECT_STATUS.md §4 (features, ViewModels, use cases, repositories, data sources, RPCs, migrations, RLS changes, executed test results, build/lint/typecheck results, docs updated, limitations, remaining work).
