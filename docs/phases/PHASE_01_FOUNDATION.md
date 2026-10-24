# Phase 01 — Monorepo Foundation, Tooling, Contracts, Supabase, CI

Status: Not started · Depends on: Phase 00 approval, OD-01, OD-13 (Docker optional but recommended)

## Goal
A repository where every later feature can be added by following the docs: apps boot, packages are shared,
the database has a hardened baseline, and CI enforces types, lint (including architecture boundaries) and tests.

## Steps
1. `git init` in `D:\Dukaan Saathi`; `.gitignore` (node, expo, next, env, supabase/.temp); create GitHub repo (you create the remote, or approve me using `gh`).
2. Root `package.json` with npm workspaces `apps/*`, `packages/*`; `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`); ESLint flat config with boundary rules (CLEAN_ARCHITECTURE.md §4); Prettier.
3. `packages/domain-core`: `Paise`, `QuantityMilli`, `BasisPoints` branded types; `lineAmount`, `taxFromInclusive`, `billTotals`, `roundHalfUp`, `financialYear`, `formatInvoiceNumber`; `fixtures/money-cases.json`; tests.
4. `packages/contracts`: `errors.ts` (codes from API_AND_RPC_CONTRACTS.md §2), `features.ts` (entitlement + flag keys), `permissions.ts`, initial Zod schemas, `database.types.ts` placeholder + generation script.
5. `apps/mobile`: create with the Expo template for the current stable SDK; verify every added dependency with `npx expo install`; Expo Router layout groups `(auth)`, `(onboarding)`, `(shop)`; `src/app` providers (Query, Dependencies, i18n, Paper theme); `src/core` (config with Zod-validated env, errors + translate, logger, secure storage adapter, connectivity, localization en/hi); shared `<ScreenState>`; one placeholder screen proving the MVVM wiring with a test.
6. `apps/admin`: Next.js App Router, Tailwind + shadcn/ui, `@supabase/ssr` server client, `requireOperator` stub, login page shell.
7. `supabase/`: `supabase init`; migration `p01_baseline`: schemas `private`, `audit`; default privilege revokes; `private.round_half_up_div`, `private.line_amount`, `private.tax_from_inclusive`; `audit.events`; pgTAP test running money fixtures; privilege catalogue test.
8. CI (`.github/workflows/ci.yml`) per TESTING_STRATEGY.md §6.
9. Sentry SDK wiring guarded by env presence.
10. Record dependency versions and compatibility checks in this document's appendix.

## Acceptance criteria
- [ ] `npm run typecheck`, `npm run lint`, `npm test` pass from the root (output recorded).
- [ ] Mobile app starts on an Android emulator/device and shows the placeholder screen in en and hi.
- [ ] Admin `next build` succeeds.
- [ ] `supabase test db` passes locally (if Docker) and in CI; money parity test passes in Jest and pgTAP.
- [ ] A deliberate boundary violation (screen importing supabase) fails lint.
- [ ] No secrets committed; `.env.example` files list required variables.

## Credentials needed
None to complete the phase locally. GitHub repo (you), optional Supabase dev project and Sentry DSN.

## Appendix — dependency compatibility record
(filled during the phase)
