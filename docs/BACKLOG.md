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
| ID | Item | Status |
|---|---|---|
| BL-301 | categories/products/barcodes/aliases/price history + RLS + triggers | ✅ |
| BL-302 | units/tax rates seed (+ unit synonyms) | ✅ |
| BL-303 | `search_products` (trigram, Hindi, aliases, barcode) | ✅ (timing on hosted DB → Phase 13) |
| BL-304 | mobile products, product form, categories | ✅ |
| BL-305 | private bucket `import-files` + policies | ➡️ Phase 11 (CSV is parsed on the device, nothing is uploaded — ADR-032) |
| BL-306 | Edge `import-preview` (CSV/XLSX) | 🟨 CSV parsed on the device + server staging RPCs; XLSX → Phase 11 |
| BL-307 | import review + commit RPC | ✅ |
| BL-308 | quota enforcement `products.max` | ✅ |
| BL-309 | tests | ✅ |
| BL-310 | opening stock from import | ➡️ Phase 07 (ADR-034) |
| BL-311 | category reorder UI, import template download | ⬜ backlog |

## Phase 04 — Quick billing
| ID | Item | Status |
|---|---|---|
| BL-401 | `invoice_series`, `sales`, `sale_items`, `sale_payments`, idempotency | ✅ |
| BL-402 | `create_sale` (quick lines, cash/UPI/card/other) + `get_sale` | ✅ |
| BL-403 | device invoice counter (SecureStore; server accepts `last_seq + 1`) | ✅ |
| BL-404 | billing keypad, payment sheet, UPI QR, receipt screen + share | ✅ (PDF share not yet tried on a device) |
| BL-405 | tests incl. idempotency/concurrency | ✅ (concurrency script runs in CI) |
| BL-406 | intermittent screen-test timing failures (2 races fixed in Phase 04; recurred once in CI on `4cd3bf3`; sales-history race found via annotations and fixed in Phase 07) | 🟨 |
| BL-407 | split payment UI (RPC already accepts several payments) | ✅ Phase 05 (two methods) |

## Phase 05 — Product billing, barcode, history, void
| ID | Item | Status |
|---|---|---|
| BL-501 | product lines + loose quantity/amount entry | ✅ |
| BL-502 | discounts/overrides per role | ✅ |
| BL-503 | barcode scanning (`expo-camera`) | ✅ (not yet tried with a real camera) |
| BL-504 | stock movement on sale (`stock_movements` created now) | ✅ |
| BL-505 | sales history + detail | ✅ |
| BL-506 | `void_sale` | ✅ (ledger reversal with udhaar in Phase 08) |
| BL-507 | GST receipt variant | ✅ |
| BL-508 | thermal printer spike (OD-08) | 🟨 desk research ([spike](spikes/THERMAL_PRINTING.md)); needs pilot printers |
| BL-509 | tests + Maestro J-01/J-04 | 🟨 unit/component/pgTAP ✅; Maestro needs a device |

## Phase 06 — Reports, expenses, reconciliation
| ID | Item | Status |
|---|---|---|
| BL-601 | dashboard snapshot | ✅ |
| BL-602 | sales report + entitlement gating | ✅ |
| BL-603 | export | ✅ CSV built on the phone after `begin_report_export` (quota); no Edge Function (ADR-044) |
| BL-604 | expenses + attachments | ✅ private bucket + storage policies |
| BL-605 | day close | ✅ per phone per day |
| BL-606 | `create_sale_return` | ✅ |
| BL-607 | push token + daily summary notification | ⬜ blocked: FCM / Expo push credentials and a device |
| BL-608 | tests | ✅ (seeded-day fixture in pgTAP and app tests) |
| BL-609 | shop-wide cash-up across phones; profit net of returns | ⬜ backlog |

## Phase 07 — Inventory & purchases
| ID | Item | Status |
|---|---|---|
| BL-701 | stock screens, adjustments, stock count | ✅ |
| BL-702 | low-stock list + digest | 🟨 list ✅; push digest needs notification credentials (with BL-607) |
| BL-703 | suppliers + ledger | ✅ |
| BL-704 | `receive_purchase` | ✅ (stock, cost, optional new price, ledger, payments in one transaction) |
| BL-705 | supplier payments | ✅ |
| BL-706 | rebuild functions + drift check | ✅ `private.stock_from_movements`, `check_stock_drift` |
| BL-707 | tests | ✅ |
| BL-708 | purchase history list, supplier edit/archive screens, returns to supplier | ⬜ backlog |

## Phase 08 — Customers & udhaar
| ID | Item | Status |
|---|---|---|
| BL-801 | customers + ledger tables, RPCs | ✅ (`save_customer`, `list_customers`, `get_customer_ledger`, drift check — ADR-051) |
| BL-802 | udhaar on billing (enable payment method) | ✅ whole bill or split part; customer search and quick add |
| BL-803 | udhaar list, ledger screen, repayment | ✅ |
| BL-804 | owner adjustment | ✅ reason required, audited |
| BL-805 | WhatsApp reminder | ✅ en/hi with UPI link; user sends it |
| BL-806 | credit limit policy | ✅ block / warn / none (ADR-053) |
| BL-807 | tests + Maestro J-02/J-03 | 🟨 pgTAP fixture + app tests ✅; Maestro needs a device |
| BL-808 | customer edit/archive screens, ledger "load more", repayment concurrency script | ⬜ backlog |

## Phase 09 — Offline
| ID | Item | Status |
|---|---|---|
| BL-901 | SQLite + migrations | ✅ expo-sqlite; real SQL in tests (ADR-058) |
| BL-902 | catalogue/customers/settings pull cache | ✅ (categories pulled, not yet used offline) |
| BL-903 | outbox + local sales | ✅ bills, new customers, udhaar payments; expenses stay online (ADR-059) |
| BL-904 | `sync_push`/`sync_pull` | ✅ |
| BL-905 | SyncService + status UX | ✅ chip, Sync status screen, retry |
| BL-906 | conflict/quarantine handling | ✅ needs_review rules, quarantine, customer merge (ADR-056) |
| BL-907 | sign-out with unsynced data | ✅ confirmation; kept per user (ADR-057) |
| BL-908 | tests + Maestro J-05 | 🟨 pgTAP + app tests ✅; Maestro needs a device |
| BL-909 | offline expenses, unsynced bills in sales history, "refresh everything" pull, void/return after sync from the receipt | ⬜ backlog |

## Phase 10 — Voice billing
| ID | Item | Status |
|---|---|---|
| BL-1001 | recognition spike + benchmark | 🟨 module chosen, text benchmark 50/50 ([spike](spikes/VOICE_RECOGNITION.md)); audio benchmark needs a phone |
| BL-1002 | normalizer/parser/matcher | ✅ |
| BL-1003 | voice screen + confirm flow | ✅ review sheet, typed fallback |
| BL-1004 | alias learning | ✅ owner/manager corrections (`add_product_alias`) |
| BL-1005 | tests | ✅ 306-phrase table, benchmark, sheet, pgTAP |
| BL-1006 | quick line for unmatched phrases, quantity edit inside the sheet, en-IN second pass | ⬜ backlog |

## Phase 11 — Onboarding & admin panel
| ID | Item | Status |
|---|---|---|
| BL-1101 | operator auth + MFA + guard | ✅ TOTP enrol/verify, aal2 checked in every admin RPC |
| BL-1102 | dashboard | ✅ |
| BL-1103 | shops module | ✅ search, detail, suspend/reactivate |
| BL-1104 | users/memberships | 🟨 deactivate member, revoke device; replace owner not built |
| BL-1105 | onboarding queue + app request | ✅ photos from the app |
| BL-1106 | import workbench | 🟨 CSV upload into the shop's import; XLSX (`import-preview`) and operator commit not built |
| BL-1107 | support (app + admin) | ✅ internal notes hidden |
| BL-1108 | content & announcements | 🟨 announcements done; other content blocks in Phase 12 |
| BL-1109 | audit viewer | ✅ |
| BL-1110 | operators (Edge invite) | 🟨 built and tested in SQL; Edge Function not deployed yet |
| BL-1111 | notification templates | ⬜ deferred (with push credentials) |
| BL-1112 | admin login CAPTCHA, hosting (OD-14) | ⬜ |

## Phase 12 — Subscriptions & flags
| ID | Item | Status |
|---|---|---|
| BL-1201 | plans/entitlements admin | ✅ plan × entitlement table, plan editor |
| BL-1202 | overrides | ✅ entitlement and flag overrides per shop, with end date and reason |
| BL-1203 | feature flags + overrides + kill switch | ✅ rollout %, minimum app version, kill switch beats overrides |
| BL-1204 | platform config editor + revisions/rollback | ✅ validated keys, optimistic revision, restore |
| BL-1205 | lifecycle job | ✅ daily pg_cron; reminders pending (BL-1111) |
| BL-1206 | payment webhook (OD-05) | 🟨 Razorpay-format Edge Function written, not deployed (provider not chosen) |
| BL-1207 | plan screen + upsell | ✅ plan screen, locked modules; WhatsApp / call contact |
| BL-1208 | tests S-04, S-05, S-09 | ✅ `019_subscriptions_flags` |
| BL-1209 | `exports.monthly` usage counter, renewal reminders, pre-sign-in flags | ⬜ |

## Phase 13 — Hardening
| ID | Item | Status |
|---|---|---|
| BL-1301 | security audit (advisors, function review, pen-test checklist) | ✅ advisors justified, pre-request gate, CSP |
| BL-1302 | accessibility pass | 🟨 automated checks pass; TalkBack / font scale / contrast need a phone |
| BL-1303 | performance (load script, indexes, rollups) | ✅ CI load check at 100k bills; rollups not needed yet |
| BL-1304 | SQLite encryption decision | ✅ ADR-074 (stay unencrypted in v1) |
| BL-1305 | backups, PITR, restore drill | ⬜ needs paid plan and production (Phase 14) |
| BL-1306 | rate limiting | ✅ per user, per RPC |
| BL-1307 | retention jobs | ✅ daily |
| BL-1308 | monitoring alerts | 🟨 admin System health panel; email / Slack push needs a destination |

## Phase 14 — Release & pilot
| ID | Item | Status |
|---|---|---|
| BL-1401 | full regression | 🟨 `npm run verify` + CI green; manual checklist ready, needs 3 phones |
| BL-1402 | Play internal/closed testing | 🟨 EAS profiles ready; needs Expo and Google Play accounts |
| BL-1403 | legal docs in app | 🟨 consent flow done; drafts for legal review; needs final text and website |
| BL-1404 | pilot onboarding of 10 shops | 🟨 playbook ready; needs production and the shops |
| BL-1405 | support runbook | ✅ |
| BL-1406 | Play listing assets and data-safety form; Sentry wiring | ⬜ |

## Phase 15 — Post-launch
Driven by pilot feedback. Candidate items:
BL-B07 held/parked bills · BL-I05 batch & expiry tracking · BL-S01 shared-device PIN switching (OD-06) · BL-L01 romanised Hinglish UI (OD-07) ·
BL-P01 product images · BL-M01 multi-branch · BL-G01 GST reports · BL-W01 WhatsApp Business API · BL-IOS iOS release (OD-10) · BL-V02 cloud voice parsing.
