# Phase 01 — Monorepo Foundation, Tooling, Contracts, Supabase, CI

Status: **Complete — awaiting approval** · Dates: 2026-10-24 · Commits: `480efb4` … see `git log`

## Goal
A repository where every later feature can be added by following the docs: apps boot, packages are shared,
the database has a hardened baseline, and CI enforces types, lint (including architecture boundaries) and tests.

## What was built

| Area | Result |
|---|---|
| Repository | Own git repo in `D:\Dukaan Saathi` → `github.com/Solstra-Info-IT-Solutions/Dukaan-Saathi` (`main`). npm workspaces `apps/*`, `packages/*`; strict TS base; Prettier; `.editorconfig`, `.gitattributes` (LF) |
| `@ds/domain-core` | Money (`Paise`, `BasisPoints`, half-up BigInt division, rupee parsing, Indian formatting), quantity (milli-units), tax back-calculation + CGST/SGST split, bill totals with proportional bill-discount allocation and round-off, amount→quantity for loose items, financial year, device codes, invoice number format/parse. Shared `fixtures/money-cases.json` |
| `@ds/contracts` | Error-code catalogue (27 server + 3 client codes, retryability), shop roles + 34 permissions mirroring AUTHORIZATION_MATRIX, platform roles, entitlement + feature-flag keys with safe defaults, Zod primitives (paise, quantity, phone E.164, semver, pagination), Indian phone normaliser, client-config schema with fallback parsing and semver compare, `Database` type |
| `apps/mobile` | Expo SDK 58, Expo Router (`src/app`), React 19.3 (single copy via root `overrides`), RN Paper theme, i18next en/hi, TanStack Query client, Zustand connectivity store. **core:** validated env (refuses secret keys), `AppError` + `translateError`, scrubbing logger, chunked SecureStore storage, Supabase client factory + AppState token refresh, NetInfo monitor. **bootstrap:** container, `DependenciesProvider`, `AppProviders`. **Reference feature `diagnostics`:** full MVVM + clean slice with a real Supabase Auth health check |
| `apps/admin` | Next.js 16 App Router, Tailwind 4, security headers, `@supabase/ssr` operator session, `proxy.ts` session refresh + redirect, deny-by-default operator access decision (backend → session → platform role → MFA aal2 → allowed roles) using verified JWT claims, `requireOperator` (forces request-time rendering), login/sign-out server actions |
| `supabase/` | `config.toml` (`auto_expose_new_tables = false`), migration `20261024120000_p01_baseline.sql`, pgTAP tests (001 baseline security, 002 generated money fixtures, 003 privilege catalogue), fixture generator |
| Tooling | `scripts/db-check-pglite.mjs` (migrations + tests in PGlite, ADR-024); ESLint layer-boundary rules |
| CI | `.github/workflows/ci.yml`: `checks` job and `database` job (see below) |

## End-to-end data flow (reference slice: diagnostics)

```
src/app/index.tsx (route)            useDependencies() → container.diagnostics
  → DiagnosticsScreen({deps})        renders state, forwards refresh/changeLanguage
  → useDiagnosticsViewModel(deps)    reducer state, duplicate-request guard, translated errors
  → GetDiagnostics.execute()         domain use case (no platform imports)
  → DiagnosticsRepository            domain interface
  → DiagnosticsRepositoryImpl        maps DTOs, turns failures into 'unreachable'
      → AppInfoDataSource            expo-constants version + validated env
      → SupabaseHealthDataSource     GET {url}/auth/v1/health with publishable key, 8 s timeout
```

## Inventory

- Screens / ViewModels: `DiagnosticsScreen` / `useDiagnosticsViewModel` (mobile); admin `LoginPage`, `DashboardPage`, `LoginForm` (client component with `useActionState`).
- Use cases: `GetDiagnostics`.
- Repository interfaces: `DiagnosticsRepository`. Implementations: `DiagnosticsRepositoryImpl`; admin `OperatorRepository` (server-only).
- Data sources: `AppInfoDataSource` (local), `SupabaseHealthDataSource` (remote).
- RPC contracts added: `public.get_my_platform_role()` → `text | null` (authenticated only; caller's own role).
- Migrations: `20261024120000_p01_baseline.sql`.
- Security: `private` / `audit` schemas closed to client roles; default privileges revoked on `public`; all SECURITY DEFINER functions `set search_path = ''`; `audit.events` append-only (trigger); `platform_admins` RLS on with no client grants; `private.is_platform_admin()` requires aal2.

## Tests executed (actual results, 2026-10-24, local Windows machine)

| Suite | Command | Result |
|---|---|---|
| domain-core | `vitest run` | **57 / 57 passed** |
| contracts | `vitest run` | **22 / 22 passed** |
| mobile | `jest` | **40 / 40 passed** (2 suites) |
| admin | `vitest run` | **11 / 11 passed** |
| database (PGlite pre-check) | `npm run db:check:local` | **45 / 45 assertions passed** (migration applied) |
| database (real Supabase + pgTAP) | CI `database` job (`supabase test db`) | **passed** (run 40096899950) |

Builds and static checks (local): `npm run format:check` ✅ · `npm run typecheck` (all 4 workspaces) ✅ · `npm run lint` ✅ ·
`next build` ✅ (`/` and `/login` dynamic) · `expo export --platform android` ✅ (4.6 MB Hermes bundle) ·
`expo-doctor` 19/20 (see limitations) · admin runtime smoke test: `/` → 307 `/login`, security headers present.

Boundary lint verified by probe files: a screen importing `@supabase/supabase-js` or the data layer, and a domain file importing `react-native`, each fail lint.

Bugs found and fixed during the phase: wrong hand-computed tax fixture (code was right: 10000 @ 18 % → 1525 paise);
duplicate React (19.3.0 + 19.3.1) fixed with root `overrides`; ViewModel reload loop when deps were unstable (now ref-based);
admin dashboard was prerendered static when no backend was configured (fixed with `connection()`).

## CI
Run 40096899950 on `998d56b`: **both jobs succeeded** — `checks` (format, typecheck, lint, unit tests, fixture freshness, PGlite pre-check, admin build, mobile export) and `database` (Supabase stack + `supabase test db` pgTAP). Details in PROJECT_STATUS.md §3.

## Acceptance criteria
- [x] `npm run typecheck`, `npm run lint`, `npm test` pass from the root (output above).
- [ ] Mobile app starts on an Android emulator/device and shows the placeholder screen in en and hi — **not verified**: no emulator/device available in this session. The Android bundle builds, and the screen renders in both languages in component tests.
- [x] Admin `next build` succeeds.
- [x] `supabase test db` passes in CI (real Supabase); locally not possible without Docker, PGlite pre-check passes 45/45. Money parity passes in Vitest and SQL.
- [x] A deliberate boundary violation fails lint.
- [x] No secrets committed; `.env.example` files list required variables.

## Deferred / not done (honest list)
- Sentry SDK not wired (needs a DSN and a native config plugin); `logger.setLogReporter` is the hook.
- shadcn/ui not installed yet in admin (plain Tailwind for two pages); added with the first admin module (Phase 11).
- Supabase project not created; generated DB types not produced (CI step advisory).
- Bill-level SQL fixtures wait for `private.compute_bill` (Phase 04).

## Appendix — dependency compatibility record

| Package | Version | Why this version |
|---|---|---|
| Node / npm | 24.15 / 11.12 | installed; `engines.node >= 20.19` |
| typescript | ~6.0.3 | Expo 58 template pins it; typescript-eslint 8.72 supports `< 6.1` (TS 7.0 not supported yet) |
| expo / react-native / react | ~58.0.19 / 0.88.0 / 19.3.0 | `create-expo-app@5` blank-typescript; React pinned via root `overrides` |
| expo-router & Expo modules | per `expo/bundledNativeModules.json` | router ~58.0.26, secure-store ~58.0.2, localization ~58.0.5, constants ~58.0.13, linking ~58.0.14, safe-area 5.10.1, screens 4.30.0, netinfo 12.0.1 |
| jest / jest-expo / RNTL / test-renderer | 30.5 / ~58.0.12 / 14.1.0 / 1.3.1 | jest-expo 58 requires Jest 30; RNTL 14 needs `test-renderer` (render/renderHook/fireEvent are async) |
| eslint / eslint-config-expo | ~9.39.5 / ~58.0.4 | ADR-022 |
| @supabase/supabase-js / @supabase/ssr | 2.118.0 / 0.12.7 | latest; Expo guide adds `react-native-url-polyfill` 4.0.0 |
| @tanstack/react-query / zustand / zod | 5.104.5 / 5.0.16 / 4.6.7 | latest |
| react-native-paper / i18next / react-i18next | 5.15.3 / 26.5.10 / 17.1.7 | latest; react-i18next 17 requires i18next ≥ 26.2 |
| next / eslint-config-next / tailwindcss | 16.4.3 / 16.4.3 / 4 | `create-next-app@16.4.3`; Next 16 uses `proxy.ts` (formerly middleware) |
| vitest / vite | 5.0.5 / 8.3.5 | admin + packages |
| supabase CLI | 2.122.0 (npm devDependency) | |
| @electric-sql/pglite | 0.5.11 | local DB pre-check |
