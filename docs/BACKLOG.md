# Backlog

Every requirement from PRODUCT_REQUIREMENTS.md appears here. Status: ⬜ not started · 🟨 in progress · ✅ done and verified.
Phase order may shift for dependencies; nothing is removed without a note in PROJECT_STATUS.md.

## Phase 00 — Design
| ID | Item | Status |
|---|---|---|
| BL-000 | Repository inspection | ✅ |
| BL-001 | Product requirements, UI flows | ✅ |
| BL-002 | Architecture (system, MVVM, clean, repository) | ✅ |
| BL-003 | API/RPC catalogue, error codes | ✅ |
| BL-004 | Database design, ERD, data dictionary | ✅ |
| BL-005 | Security model, authorization matrix | ✅ |
| BL-006 | Feature configuration, admin spec, offline design | ✅ |
| BL-007 | Testing strategy, deployment guide | ✅ |
| BL-008 | Phase plans, backlog, status, limitations | ✅ |

## Phase 01 — Foundation
| ID | Item | Status |
|---|---|---|
| BL-101 | `git init` in project folder, `.gitignore`, `.editorconfig`, new GitHub repo (OD-01) | ✅ |
| BL-102 | npm workspaces root, TypeScript base config (strict), ESLint + Prettier, architecture boundary lint rules | ✅ |
| BL-103 | `packages/contracts`: error codes, feature keys, first Zod schemas, DB types generation script | ✅ |
| BL-104 | `packages/domain-core`: money, quantity, tax, rounding, invoice number, FY + shared fixtures + tests | ✅ |
| BL-105 | `apps/mobile`: Expo app with Router, providers, container, core (config, errors, logging, secure storage, connectivity, i18n en/hi), theme + Paper wrappers, `<ScreenState>` | ✅ |
| BL-106 | `apps/admin`: Next.js app shell, Supabase SSR client, operator guard skeleton, UI kit | ✅ (shadcn/ui deferred to Phase 11) |
| BL-107 | `supabase/`: CLI config, first migration (schemas, default privileges, private helpers stub, audit schema), pgTAP harness, money parity test | ✅ (pgTAP verified in CI; PGlite locally) |
| BL-108 | CI workflow (typecheck, lint, unit, db tests, admin build, expo export) | ✅ |
| BL-109 | Sentry wiring (DSN via env, disabled when absent) | ⬜ deferred — needs DSN |
| BL-110 | Dependency compatibility verification record (`docs/phases/PHASE_01…` appendix) | ✅ |

## Phase 02 — Auth, tenancy, shop setup
| ID | Item | Status |
|---|---|---|
| BL-201 | Phone/email OTP login | ✅ (live login needs Supabase Auth config — see PHASE_02 report) |
| BL-202 | profiles trigger | ✅ |
| BL-203 | shops/settings/members/invitations/devices tables + RLS | ✅ |
| BL-204 | `role_permissions` seed (checked against contracts) | ✅ |
| BL-205 | RPCs per feature spec | ✅ |
| BL-206 | entitlement/plan seed + basic resolution + trial on shop creation | ✅ |
| BL-207 | client config basic + min version gate | 🟨 RPC done; app-side version gate screen moves to Phase 12 |
| BL-208 | audit foundation | ✅ |
| BL-209 | mobile screens (login, OTP, create/select shop, staff, settings, home, more) | ✅ (language picker on profile → Phase 03) |
| BL-210 | security tests S-01, S-02, S-03, S-05, S-07, S-08, S-10 | ✅ |
| BL-211 | module registry + route guards | ✅ |

## Phase 03 — Catalogue & import
BL-301 categories/products/barcodes/aliases/price history + RLS + triggers · BL-302 units/tax rates seed · BL-303 `search_products` (trigram, Hindi) ·
BL-304 mobile products, product form, categories · BL-305 private bucket `import-files` + policies · BL-306 Edge `import-preview` (CSV/XLSX) ·
BL-307 import review + commit RPC · BL-308 quota enforcement `products.max` · BL-309 tests.

## Phase 04 — Quick billing
BL-401 `invoice_series`, `sales`, `sale_items`, `sale_payments`, idempotency table · BL-402 `create_sale` (quick lines, cash/UPI/card/other) ·
BL-403 device invoice counter · BL-404 billing screen keypad, payment sheet, UPI QR, receipt screen + share · BL-405 tests incl. idempotency/concurrency.

## Phase 05 — Product billing, barcode, history, void
BL-501 product lines + loose quantity/amount entry · BL-502 discounts/overrides per role · BL-503 barcode scanning (`expo-camera`) ·
BL-504 stock movement on sale (tables from Phase 03/07 prep) · BL-505 sales history + detail · BL-506 `void_sale` · BL-507 GST receipt variant ·
BL-508 thermal printer spike (OD-08) · BL-509 tests + Maestro J-01/J-04.

## Phase 06 — Reports, expenses, reconciliation
BL-601 dashboard snapshot · BL-602 sales report + entitlement gating · BL-603 export Edge Function · BL-604 expenses + attachments ·
BL-605 day close · BL-606 `create_sale_return` · BL-607 push token + daily summary notification · BL-608 tests.

## Phase 07 — Inventory & purchases
BL-701 stock screens, adjustments, stock count · BL-702 low-stock list + digest · BL-703 suppliers + ledger · BL-704 `receive_purchase` ·
BL-705 supplier payments · BL-706 rebuild functions + drift check · BL-707 tests.

## Phase 08 — Customers & udhaar
BL-801 customers + ledger tables, RPCs · BL-802 udhaar on billing (enable payment method) · BL-803 udhaar list, ledger screen, repayment ·
BL-804 owner adjustment · BL-805 WhatsApp reminder · BL-806 credit limit policy · BL-807 tests + Maestro J-02/J-03.

## Phase 09 — Offline
BL-901 SQLite + migrations · BL-902 catalogue/customers/settings pull cache · BL-903 outbox + local sales · BL-904 `sync_push`/`sync_pull` ·
BL-905 SyncService + status UX · BL-906 conflict/quarantine handling · BL-907 sign-out with unsynced data · BL-908 tests + Maestro J-05.

## Phase 10 — Voice billing
BL-1001 recognition spike + benchmark · BL-1002 normalizer/parser/matcher · BL-1003 voice screen + confirm flow · BL-1004 alias learning · BL-1005 tests.

## Phase 11 — Onboarding & admin panel
BL-1101 operator auth + MFA + guard · BL-1102 dashboard · BL-1103 shops module · BL-1104 users/memberships · BL-1105 onboarding queue + app request ·
BL-1106 import workbench · BL-1107 support (app + admin) · BL-1108 content & announcements · BL-1109 audit viewer · BL-1110 operators (Edge invite) · BL-1111 notification templates.

## Phase 12 — Subscriptions & flags
BL-1201 plans/entitlements admin · BL-1202 overrides · BL-1203 feature flags + overrides + kill switch · BL-1204 platform config editor + revisions/rollback ·
BL-1205 lifecycle job · BL-1206 payment webhook (OD-05) · BL-1207 plan screen + upsell · BL-1208 tests S-04, S-05, S-09.

## Phase 13 — Hardening
BL-1301 security audit (advisors, function review, pen-test checklist) · BL-1302 accessibility pass · BL-1303 performance (load script, indexes, rollups) ·
BL-1304 SQLite encryption decision · BL-1305 backups, PITR, restore drill · BL-1306 rate limiting · BL-1307 retention jobs · BL-1308 monitoring alerts.

## Phase 14 — Release & pilot
BL-1401 full regression · BL-1402 Play internal/closed testing · BL-1403 legal docs in app · BL-1404 pilot onboarding of 10 shops · BL-1405 support runbook.

## Phase 15 — Post-launch
Driven by pilot feedback. Candidate items:
BL-B07 held/parked bills · BL-I05 batch & expiry tracking · BL-S01 shared-device PIN switching (OD-06) · BL-L01 romanised Hinglish UI (OD-07) ·
BL-P01 product images · BL-M01 multi-branch · BL-G01 GST reports · BL-W01 WhatsApp Business API · BL-IOS iOS release (OD-10) · BL-V02 cloud voice parsing.
