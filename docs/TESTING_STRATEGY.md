# Testing Strategy

Rule: a test counts only when it has been **executed** and its result recorded in the phase report.
Never weaken RLS or permissions to make a test pass — fix the fixture instead.

## 1. Pyramid

| Level | Scope | Tool | Runs |
|---|---|---|---|
| Domain unit | `packages/domain-core`, feature `domain/` | Jest (or Vitest in packages) | every commit |
| State/ViewModel | reducers, `useXxxViewModel` with fake container | Jest + RNTL `renderHook` | every commit |
| Repository/mapper | DTO mapping, error translation, pagination, offline enqueue | Jest with fake data sources | every commit |
| Component/screen | five states, main interactions, accessibility labels | RNTL | every commit |
| Database | RLS, RPC transactions, privileges, money parity | pgTAP (`supabase test db`) | every commit (CI with Docker) |
| Data-source integration | real supabase-js against local stack | Jest (`integration` project) | CI |
| Edge Functions | handler unit tests + local invoke | Deno test | CI |
| Admin | components/ViewModels (Vitest), E2E (Playwright) against local stack | Vitest, Playwright | CI |
| Mobile E2E | critical journeys J-01…J-06 | Maestro on emulator / dev build | nightly + pre-release |
| Manual | real devices (low-end Android), Hindi UI, printers | checklist | per release |

## 2. Shared fixtures

- `packages/domain-core/fixtures/money-cases.json` — inputs/expected outputs for line amount, tax back-calc, rounding, bill totals; consumed by Jest **and** pgTAP.
- `supabase/seed/test_fixtures.sql` — two shops (A, B), users per role in each, platform operators per role, products, customers.
- `supabase/tests/helpers/` — `tests.authenticate_as(user)`, `tests.expect_ds_error(sql, code)`.
- Mobile `tests/fakes/` — fake repositories and `createFakeContainer(overrides)`.

## 3. ViewModel test checklist (each ViewModel)

initial state · loading · success · validation error · server error (mapped message) · network error with
retry using the same `client_operation_id` · duplicate submit ignored · offline/queued (Phase 09+) · cleanup on unmount.

## 4. Database test checklist (each RPC)

anon denied · non-member denied · each role allowed/denied per matrix · cross-shop ids rejected ·
validation errors · idempotent replay · conflicting replay · ledger/stock side effects · entitlement denial ·
concurrency case where relevant (two sessions via `dblink` or sequential lock simulation).

## 5. Security suite (maps to SECURITY_MODEL.md §12)

Generated test iterates **every table in `public`** and asserts: RLS enabled; as Shop A user, `select` of
Shop B rows returns 0; `insert` with Shop B `shop_id` fails. Plus S-01…S-10 specific tests. Plus a catalogue
test: every `security definer` function has `search_path` set and no `anon`/`public` execute grant.

## 6. CI gates (GitHub Actions)

1. `npm ci`
2. `typecheck` (all workspaces, strict)
3. `lint` (incl. architecture boundary rules)
4. unit tests (mobile, admin, packages) with coverage report (target: domain-core 95 %, use cases/ViewModels 80 %)
5. `supabase start` → `supabase db reset` → `supabase test db` → integration tests
6. generated DB types up to date
7. admin `next build`
8. mobile `expo-doctor` + `npx expo export` (bundle check)

Release pipeline adds: EAS build (preview/production), Maestro on emulator, Playwright E2E.

## 7. Performance and accessibility checks

- Billing screen render and keypad latency measured on a low-end device each release (manual, recorded).
- RPC timing: `create_sale` p95 < 150 ms DB time with 100k sales per shop (load script in Phase 13).
- Accessibility: RNTL queries by role/label (forces labels); manual TalkBack pass per release.

## 8. Environment note

This machine has no Docker yet (OD-13). Until it is installed, DB tests run only in CI; locally use unit
tests plus a dedicated dev Supabase project.
