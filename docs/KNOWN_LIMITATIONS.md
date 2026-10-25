# Known Limitations

Deliberate gaps. Each has a reason and, where relevant, a backlog item.

## Current state (end of Phase 05)
- Mobile: sign-in, shops, staff, settings (02); catalogue and CSV import (03); quick and product bills with search, barcode scan, line edits, discounts, overrides, split payment, UPI QR, receipts, sales history and void (04–05).
- Not yet tried on a device: the whole app, camera scanning, PDF sharing. Sign-in on a device needs the Supabase Auth settings (email template with `{{ .Token }}`, SMS provider).
- Billing is online only (offline queue in Phase 09); no udhaar until customers (Phase 08); split payment UI is two methods.
- Stock moves only for products with `trackStock`; there is no stock-tracking UI until inventory (Phase 07).
- If a save times out and the bill is then changed, the first bill may already exist; it can be found in Sales and voided.
- Import accepts CSV only (XLSX in Phase 11); opening stock from import ignored until Phase 07.
- Thermal printing: not built; see docs/spikes/THERMAL_PRINTING.md (OD-08).
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

## Technical
| Limitation | Mitigation |
|---|---|
| ESLint pinned to 9.x (deprecated upstream) | Expo's ESLint plugins do not support 10 yet (ADR-022) |
| `database.types.ts` is generated, then narrowed by hand (table Insert/Update set to `never` because clients write only through RPCs), so the CI diff against `supabase gen types` stays advisory | Review the CI diff when migrations change; regenerate with the Supabase MCP/CLI |
| Offline SQLite data not encrypted at rest in v1 | Android app sandbox; SQLCipher decision in Phase 13 (BL-1304) |
| Feature-flag changes reach installed apps within the refresh interval (default 15 min), not instantly | Server-enforced features are instant |
| Subscription purchase flow undecided (Play billing policy) | OD-05; manual activation path designed |
| Data-retention periods are defaults, not legal advice | OD-12 legal review before pilot |
