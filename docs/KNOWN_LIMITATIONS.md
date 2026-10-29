# Known Limitations

Deliberate gaps. Each has a reason and, where relevant, a backlog item.

## Current state (end of Phase 09)
- Mobile: sign-in, shops, staff, settings (02); catalogue and CSV import (03); billing with scan, discounts, overrides, split payment, UPI QR, receipts, history, void, returns (04–06); today & reports, expenses, day close (06); stock tracking, adjustments, counts, suppliers, goods received, supplier payments (07); customers, udhaar on bills, ledger, repayments, owner corrections, WhatsApp reminders (08); offline bills, new customers and udhaar payments with sync, status chip and screen (09); voice billing in Hindi/Hinglish with review before adding (10).
- Not yet tried on a device: the whole app, camera, photo upload, PDF/CSV sharing. Sign-in on a device needs the Supabase Auth settings (email template with `{{ .Token }}`, SMS provider).
- No push notifications yet (daily summary, low-stock digest) — credentials and a device needed.
- Offline: bills, new customers and udhaar payments. Expenses, voids, returns, purchases and edits need a connection; bills still on the phone are not in the sales history yet (BL-909). Split payment UI is two methods.
- No customer edit/archive screen, ledger "load more" or duplicate-customer merge yet (BL-808); no interest or automatic reminders.
- No purchase history screen, supplier edit/archive screens or returns to suppliers (BL-708); no batch/expiry.
- Profit is an estimate; day close is per phone.
- Import accepts CSV only (XLSX in Phase 11). Thermal printing not built (OD-08).
- Intermittent screen-test timing failures were seen on the dev PC (BL-406).
- The admin panel has a login page and a guarded placeholder dashboard. Operator MFA enrolment is Phase 11, so a real operator will see "MFA required" until then (by design: deny by default).
- External services: only the Supabase dev project (`dukaan-saathi-dev`) exists. No SMS provider, Sentry, Expo/EAS account, payment provider or Play account yet.
- Sentry is not wired; `logger.setLogReporter` is the integration point.
- The mobile app has not been run on an Android device or emulator in this environment. The bundle builds and screens are covered by component tests.

## Development machine (this PC)
| Issue | Effect | Workaround |
|---|---|---|
| **C: drive is full (0 GB free)** | npm's default cache and temp on C: fail with `ENOSPC` | Run npm with `npm_config_cache=D:\.npm-cache` and `TMP=TEMP=D:\.tmp`; freeing space on C: is recommended |
| Docker not installed (OD-13) | `supabase start` / `supabase test db` cannot run locally | `npm run db:check:local` (PGlite pre-check); real pgTAP runs in CI |
| `D:\node_modules` exists outside this repo (another project) and contains `react@19.2.0` | `expo-doctor` reports a duplicate React because Node resolution walks up to `D:\` | Not present in CI or a clean clone. Moving the repo to e.g. `D:\Projects\Dukaan Saathi` removes it |
| `D:\` is itself a git repo (aayesha-fashion-admin) | Commands run from the wrong folder could commit there | Dukaan Saathi has its own nested `.git`; always run git inside the project folder |

## Product scope (v1)
| Limitation | Reason | Backlog |
|---|---|---|
| UPI payments are confirmed manually, not verified | Verification needs a payment-provider integration and merchant onboarding | — |
| No GST e-invoicing, GSTR reports, IGST/inter-state | Target shops are small; compliance scope large | BL-G01 |
| No thermal printing at first release (pending spike) | Native module + device matrix | BL-508 / OD-08 |
| Offline: no catalogue edits, voids, returns, purchases, stock adjustments | Avoid master-data merge conflicts | ADR-011 |
| One stock pool per shop; no multi-branch | Simplicity | BL-M01 |
| No batch/expiry tracking | Needed mostly by medical shops | BL-I05 |
| No held/parked bills | Scope | BL-B07 |
| Customer messages only via WhatsApp deep links sent by the shopkeeper | No Business API in v1 | BL-W01 |
| Voice billing: Hindi/Hinglish/English only; accuracy depends on device recognizer | | BL-V02 |
| Android only for pilot | Focus | BL-IOS |
| Each staff member needs their own phone login | Shared-device mode not designed yet | BL-S01 |
| Profit is an estimate when cost prices are missing | Data quality | — |
| Managed onboarding: owners approve every prepared import; operators upload CSV only (no XLSX); shops send photos, spreadsheets are collected by our team | Owner control (ADR-062); scope | BL-1106 |
| No push or WhatsApp notice when our team replies to a ticket or an import is ready; the app shows it when opened | Notification templates and push credentials pending | BL-1111 |
| Admin panel: no ownership transfer, no CAPTCHA, not hosted yet; operator invites need the Edge Function deployed | Scope; OD-14 | BL-1104, BL-1110, BL-1112 |
| Dismissed announcements come back after the app restarts | Kept in memory only | — |
| No in-app purchase; plans are assigned by our team or by a verified payment webhook (not deployed) | Play billing policy and provider not decided (OD-05) | BL-1206 |
| No renewal reminders; `exports.monthly` not counted; no blocking update screen yet | Notification templates pending; Phase 13 | BL-1209, BL-1111 |

## Technical
| Limitation | Mitigation |
|---|---|
| ESLint pinned to 9.x (deprecated upstream) | Expo's ESLint plugins do not support 10 yet (ADR-022) |
| `database.types.ts` is generated, then narrowed by hand (table Insert/Update set to `never` because clients write only through RPCs), so the CI diff against `supabase gen types` stays advisory | Review the CI diff when migrations change; regenerate with the Supabase MCP/CLI |
| Offline SQLite data not encrypted at rest in v1 | Android file-based encryption + app sandbox (ADR-074); SQLCipher if shared phones or legal review require it |
| Rate limits are per user and RPC, not per IP | Supabase Auth limits OTP separately; add an edge/WAF limit if abuse appears |
| Health alerts only on the admin dashboard | Email / Slack push needs a destination (BL-1308) |
| Feature-flag changes reach installed apps within the refresh interval (default 15 min), not instantly | Server-enforced features are instant |
| Subscription purchase flow undecided (Play billing policy) | OD-05; manual activation path designed |
| Data-retention periods are defaults, not legal advice | OD-12 legal review before pilot |
