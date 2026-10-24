# Phase 02 — Authentication, Tenant Membership, Shop Setup, Foundational RLS

Status: Not started · Depends on: Phase 01

## Scope
Backlog items BL-201…BL-211 in [../BACKLOG.md](../BACKLOG.md). Specification: [features/authentication-and-shops.md](../features/authentication-and-shops.md).

## Acceptance criteria
- [ ] Phone/email OTP sign-in works with Supabase test numbers.
- [ ] Create shop → trial subscription + default settings + owner membership in one transaction.
- [ ] Invite/accept/role change/deactivate per authorization matrix.
- [ ] Security tests S-01, S-02, S-03, S-07, S-10 pass.
- [ ] Route guards and module registry hide and block modules by permission.

## External credentials / configuration
Supabase dev project (your approval: has cost/terms). SMS provider for real phones (OD-02) — test numbers suffice for this phase.

## Phase report
Filled at phase end using the template in PROJECT_STATUS.md §4 (features, ViewModels, use cases, repositories, data sources, RPCs, migrations, RLS changes, executed test results, build/lint/typecheck results, docs updated, limitations, remaining work).
