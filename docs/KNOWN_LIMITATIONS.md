# Known Limitations

Deliberate gaps. Each has a reason and, where relevant, a backlog item.

## Current state (Phase 00)
- **No code exists.** Only documentation. Nothing has been built, run, or tested.
- No external service is configured: no Supabase project, SMS provider, Sentry, Expo/EAS, payment provider, Play account.
- The project folder is inside an unrelated git repository (`D:\`, remote `aayesha-fashion-admin`). Must be fixed before the first commit (ADR-001).
- Docker is not installed, so local Supabase and pgTAP cannot run on this machine yet (OD-13).

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
| Offline SQLite data not encrypted at rest in v1 | Android app sandbox; SQLCipher decision in Phase 13 (BL-1304) |
| Feature-flag changes reach installed apps within the refresh interval (default 15 min), not instantly | Server-enforced features are instant |
| Subscription purchase flow undecided (Play billing policy) | OD-05; manual activation path designed |
| Data-retention periods are defaults, not legal advice | OD-12 legal review before pilot |
