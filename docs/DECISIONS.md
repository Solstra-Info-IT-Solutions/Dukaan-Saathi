# Decisions

Two lists: **ADRs** (taken; change only with a new ADR that supersedes) and **Open decisions** (need your
input; each has a recommended default that the plan assumes until you say otherwise).

## Architecture Decision Records

| ID | Decision | Rationale | Date |
|---|---|---|---|
| ADR-001 | Separate git repository rooted at `D:\Dukaan Saathi` | The current git root is `D:\` with remote `Solstra-Info-IT-Solutions/aayesha-fashion-admin`. Committing here would push Dukaan Saathi into an unrelated client repo. `git init` inside the project folder is Phase 01 step 1. | 2026-10-24 |
| ADR-002 | npm workspaces monorepo (`apps/*`, `packages/*`), optional Turborepo | npm is installed (11.x, Node 24); Expo supports npm workspaces without hoisting tweaks. | 2026-10-24 |
| ADR-003 | Modular monolith on Supabase; no microservices | Solo developer; one DB gives real transactions across sales, stock and ledger. | 2026-10-24 |
| ADR-004 | Money as integer paise, quantity as integer milli-units | Exact arithmetic everywhere, identical in TS and SQL. | 2026-10-24 |
| ADR-005 | Plain RLS-guarded table access for single-table CRUD; PostgreSQL RPC for any multi-table or financial write; Edge Functions only for secrets/third-party/parsing/webhooks | Avoids a fake REST layer, keeps atomic operations atomic. | 2026-10-24 |
| ADR-006 | Explicit dependency composition (a plain `createContainer()` + React context), no DI framework | Readable, debuggable, trivially mockable in tests. | 2026-10-24 |
| ADR-007 | One `create_sale` RPC for quick, itemized and mixed bills | One invoice/stock/ledger path to test and secure. Logical operations `create_quick_sale` and `complete_product_sale` map to it via line `kind`. | 2026-10-24 |
| ADR-008 | Per-device invoice series `{prefix}/{FY}/{device_code}-{seq}` generated on the device, uniqueness enforced by the server | Works identically online and offline across multiple devices without gaps or collisions. GST rules allow multiple series. | 2026-10-24 |
| ADR-009 | Server recomputes all totals; client totals are a checksum (`DS_TOTAL_MISMATCH` on online mismatch) | Never trust client prices/totals; also guarantees the receipt shown equals the saved sale. | 2026-10-24 |
| ADR-010 | Ledger tables for stock (`stock_movements`), customers (`customer_ledger_entries`) and suppliers (`supplier_ledger_entries`), with cached balances updated in the same transaction | Auditability and correctness; balances can be rebuilt. | 2026-10-24 |
| ADR-011 | Offline v1 writes limited to: sales, sale payments/udhaar, customer repayments, expenses, quick customer creation | Catalogue/settings edits stay online-only to avoid merge conflicts on master data. | 2026-10-24 |
| ADR-012 | Accepted offline sales are never rejected for business reasons; unusual ones are flagged `needs_review` | The money has already changed hands; rejecting would lose a real financial event. | 2026-10-24 |
| ADR-013 | Internal SQL helpers in a non-exposed `private` schema; audit log in `audit` schema; `SECURITY DEFINER` functions always `set search_path = ''` and check `auth.uid()` membership explicitly | Standard Supabase hardening. | 2026-10-24 |
| ADR-014 | Feature flags and entitlements resolved **server-side** by `get_shop_entitlements` / `private.assert_entitlement`; clients only read | Client cannot grant itself access. | 2026-10-24 |
| ADR-015 | Admin panel calls Supabase from Next.js server code with the operator's own JWT; admin RPCs check platform role + MFA (`aal2`). Service role used only inside specific Edge Functions | Least privilege; every admin action attributable. | 2026-10-24 |
| ADR-016 | Shared `packages/contracts` (Zod) and `packages/domain-core` (pure TS) | One definition of payloads and money math. | 2026-10-24 |
| ADR-018 | Admin app runs with Next.js Cache Components **off**; guarded pages call `connection()` so they are never prerendered | Every admin page is per-operator and dynamic; a static guarded page would bake in a redirect. Simpler mental model for a solo developer. | 2026-10-24 |
| ADR-019 | Mobile routes live in `apps/mobile/src/app` (Expo SDK 58 convention); the composition root is `src/bootstrap` (not `src/app` as first drafted) | Expo Router treats every file in `src/app` as a route | 2026-10-24 |
| ADR-020 | Route files read the container (`useDependencies`) and pass a feature's use cases to its screen as `deps`; screens call their ViewModel with those deps | Features never import the composition root, so there is no import cycle and screens/ViewModels are tested by passing fakes | 2026-10-24 |
| ADR-021 | Supabase session stored in a **chunked SecureStore adapter** (values split into ≤1800-char keystore entries, count written last) instead of an AES key + AsyncStorage blob | No custom crypto to maintain; data stays in the OS keystore; partial writes read as absent | 2026-10-24 |
| ADR-022 | ESLint pinned to 9.x | `eslint-plugin-import` and `eslint-plugin-react` (used by `eslint-config-expo` 58) do not support ESLint 10 yet; npm marks 9.x deprecated — revisit when the Expo config supports 10 | 2026-10-24 |
| ADR-023 | Supabase `auto_expose_new_tables = false` | Every table needs an explicit grant, matching SECURITY_MODEL.md §4 | 2026-10-24 |
| ADR-024 | `scripts/db-check-pglite.mjs` runs migrations and DB tests in PGlite with Supabase stubs as a local pre-check | No Docker on the dev machine (OD-13); the real pgTAP run is the CI `database` job | 2026-10-24 |
| ADR-025 | RLS policy helpers live in a separate non-exposed schema `rls` (usage + execute for `authenticated` only); `private` stays closed to clients | Policies run as the querying role, so their helpers must be executable by it; keeping them apart from privileged helpers keeps the "nothing in private is client-executable" check simple | 2026-10-24 |
| ADR-026 | Invitations match by verified phone **or** verified email | Lets development and shops without SMS work with email OTP; matching uses `auth.users` confirmed contacts only | 2026-10-24 |
| ADR-027 | `staff_accounts.max` counts active non-owner members plus pending invitations | Prevents bypassing the limit by sending many invitations | 2026-10-24 |
| ADR-028 | Migrations applied to hosted projects through the Supabase MCP are renamed locally to the version the server recorded | Keeps `supabase db push` / CI in sync with what is deployed | 2026-10-24 |
| ADR-029 | ViewModels never navigate; screens receive callbacks (`onActivated`, `onCodeSent`) and route files decide where to go | Keeps ViewModels router-free and testable (MVVM_ARCHITECTURE.md §3) | 2026-10-24 |
| ADR-017 | Voice parsing is deterministic (grammar + fuzzy match) in v1; LLM parsing is an optional, flag-gated later addition | Predictable, offline-capable, no per-request cost, no customer data leaving device. | 2026-10-24 |

## Open decisions (recommended defaults assumed)

| ID | Question | Recommended default | Impact if changed |
|---|---|---|---|
| OD-01 | ~~Run `git init` in `D:\Dukaan Saathi` and create a new GitHub repo?~~ **Resolved 2026-10-24:** repo `https://github.com/Solstra-Info-IT-Solutions/Dukaan-Saathi.git`, branch `main`; commit and push after every step | — | — |
| OD-02 | SMS OTP provider for Supabase phone auth (India needs DLT-registered sender/template) | MSG91 or Twilio Verify via Supabase SMS hook; until then use **email OTP** (template must include `{{ .Token }}`) on the dev project | Phone login blocked until configured |
| OD-03 | Shop roles fixed (owner/manager/cashier) or custom per shop? | Fixed three roles in v1, permissions stored in `role_permissions` so they can be tuned centrally | Custom roles = more UI and test surface |
| OD-04 | GST scope in v1 | Support unregistered (no tax) and registered-regular (tax-inclusive, CGST/SGST split on receipt, HSN optional). Composition scheme = "bill of supply" receipt. No e-invoicing | More tax features = more compliance testing |
| OD-05 | How shops pay the subscription. Google Play policy may require Play Billing for in-app digital subscriptions; India alternative-billing rules apply | Sell outside the app (sales-assisted + payment link from a payment provider such as Razorpay; webhook to Edge Function). App shows plan status and "contact us", no in-app purchase button, until a policy/legal review is done | Play Billing integration is a separate workstream |
| OD-06 | Shared single phone used by several staff? | Not in v1: each staff member logs in with their own phone. Backlog item for PIN-based quick user switch | Shared-device mode changes auth/session design |
| OD-07 | Hinglish (romanised Hindi) as a UI language? | v1 UI: English + Hindi (Devanagari). Search/voice understand Hinglish. Romanised UI later if pilots ask | Third string set to maintain |
| OD-08 | Bluetooth thermal printer support | Phase 05 spike; v1 ships PDF/image/WhatsApp sharing; ESC/POS printing added if pilot shops have printers | Native module, needs dev build, device testing |
| OD-09 | Mobile UI kit | React Native Paper wrapped by `shared/components` | Alternative: gluestack/NativeWind; switching cost is contained by wrappers |
| OD-10 | iOS release | Android only for pilot; keep code platform-neutral | Apple review + billing rules |
| OD-11 | SQLite access layer | Hand-written SQL + migrations behind local data sources (decide Drizzle at Phase 09) | Low; isolated in data layer |
| OD-12 | Legal: privacy policy, terms, DPDP Act compliance, data retention periods | Get a lawyer's review before pilot; until then, defaults in SECURITY_MODEL.md §10 | Could change retention/consent UX |
| OD-13 | Local DB testing needs Docker (not installed on this machine) | Install Docker Desktop for `supabase start` + pgTAP; CI runs DB tests on GitHub runners regardless | Without Docker, DB tests only run in CI or against a dev cloud project |
| OD-14 | Admin hosting | Vercel (or any Node host). Needs only public anon key + server-side env | Low |
| OD-15 | Pricing and plan catalogue (names, prices, limits) | Seed placeholders: `free_trial` (30 days), `starter`, `pro`; real values set in admin later | None technically — plans are data |
| OD-16 | Negative stock default | Allowed with warning (kirana stock is rarely exact) | Setting per shop anyway |
