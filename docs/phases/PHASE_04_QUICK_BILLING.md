# Phase 04 — Quick Amount-Based Billing and Transaction-Safe Sale Creation

Status: Not started · Depends on: Phase 03 (units/tax tables), Phase 02

## Scope
Backlog items BL-401…BL-405 in [../BACKLOG.md](../BACKLOG.md). Specification: [features/billing.md](../features/billing.md).

## Acceptance criteria
- [ ] Quick bill saved exactly once under double-tap, timeout and retry.
- [ ] Server totals equal domain-core totals for every fixture.
- [ ] Invoice numbers unique and gap-free per device series, including concurrent submissions.
- [ ] Receipt share as PDF and WhatsApp text (en/hi).

## External credentials / configuration
EAS account for a development build (needed once native modules are added).

## Phase report
Filled at phase end using the template in PROJECT_STATUS.md §4 (features, ViewModels, use cases, repositories, data sources, RPCs, migrations, RLS changes, executed test results, build/lint/typecheck results, docs updated, limitations, remaining work).
