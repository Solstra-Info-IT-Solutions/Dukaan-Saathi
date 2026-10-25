# Phase 04 — Quick Amount-Based Billing and Transaction-Safe Sale Creation

Status: **Complete — awaiting approval** · Date: 2026-10-25 · Spec: [../features/billing.md](../features/billing.md)

## Features implemented (end-to-end)

### 1. Quick bill on the keypad
`BillingScreen` (new **Bill** tab, first tab) → `useBillingViewModel`:
- Keypad builds a rupee amount (`pressKeypad`, two decimals max); an optional item name; **Add** appends a line.
- **Pay** adds a pending keypad amount first, so a one-amount bill is *amount → Pay → Cash received* (2 taps after the amount).
- Optional bill discount, shown only with `sale.discount` and a limit > 0; checked against the role limit
  (owner 100 %, manager / cashier from shop settings) before the sheet opens (`discountAllowed`, twin of the SQL rule).
- Totals come from `draftTotals` → `computeBill` in `@ds/domain-core`, the same arithmetic the server runs.

### 2. Payment sheet
Methods are the shop's enabled ones among cash / UPI / card / other (udhaar waits for customers in Phase 08).
- **Cash:** amount received → "Give back ₹X" (`changeDue`).
- **UPI:** static QR `upi://pay?pa=…&pn=…&am=…&cu=INR` (`upiPaymentUri`, `react-native-qrcode-svg`) when the shop has a UPI ID.
  The shopkeeper taps *UPI received*; the payment is stored with `confirmation = 'manual'` and the receipt says
  "confirmed by shop". Nothing claims the payment was verified.

### 3. Saving exactly once
`CreateQuickSale` → `BillingRepository` → `SupabaseBillingDataSource` → `create_sale` RPC.
- The ViewModel creates one **sale attempt** (UUID v7 operation id + time) per version of the bill and keeps it while the
  user retries; any change to the bill (lines, discount, method) starts a new attempt. A busy flag ignores double taps.
- The next invoice number is `max(counter in SecureStore, lastSeq from register_device) + 1` for the current financial year.
  If the server answers `DS_INVOICE_SEQUENCE_CONFLICT` it returns the expected number; the use case stores it, then resends
  the **same** operation once (ADR-035). After a lost response, a retry sends the identical payload and the server replays
  the saved bill.
- Server, one transaction (`create_sale`): membership + `sale.create`; idempotency lookup (advisory lock per operation);
  active device of the shop; time within −24 h / +5 min; FY matches the time; 1–200 quick lines; totals by
  `private.compute_bill` must equal the client's (`DS_TOTAL_MISMATCH`); discount permission and limit
  (`DS_DISCOUNT_LIMIT_EXCEEDED`); enabled methods; Σ payments = total; series row locked `FOR UPDATE`, only `last_seq + 1`
  accepted; inserts sale, items, payments; audit event for discounts; stores the result for replays.

### 4. Receipt and sharing
After saving, the app opens `ReceiptScreen` → `useReceiptViewModel` → `GetSale` → `get_sale` RPC (cashiers only reach their
own bills unless the shop allows more). `buildReceipt` (pure) turns the sale into lines, totals (discount, round-off,
CGST/SGST split for GST shops, "bill of supply" for composition), payments and footer, with labels from i18n (en/hi) and the
date in IST. `ShareReceipt`:
- **WhatsApp:** `receiptText` → `whatsapp://send?text=…`, falling back to the system share sheet.
- **PDF:** `receiptHtml` (escaped) → `expo-print` → `expo-sharing`.
**New bill** returns to the Bill tab.

## Inventory
- **Screens / ViewModels:** Billing (+ payment sheet) / useBilling; Receipt / useReceipt.
- **Use cases:** CreateQuickSale, GetSale, ShareReceipt; pure: `draftTotals`, `discountLimitBp`, `discountAllowed`, `maxDiscount`,
  `changeDue`, `upiPaymentUri`, `pressKeypad`, `keypadToPaise`, `buildReceipt`, `receiptText`, `receiptHtml`.
- **Repository interface → implementation:** BillingRepository → BillingRepositoryImpl (maps the sequence conflict to the
  domain error `InvoiceSequenceConflict`).
- **Data sources / ports:** SupabaseBillingDataSource; `InvoiceCounterStore` → `core/storage/invoiceCounterStore` (SecureStore);
  `ReceiptSharer` → `core/sharing/receiptSharer` (expo-print, expo-sharing, Linking/Share).
- **Shared code:** `@ds/contracts` `billing.ts` (CreateSaleInput/Output, Sale, BillTotals, payment methods);
  `@ds/domain-core` `isDiscountWithinLimit`, `maxDiscountPaise`; 4 new bill fixtures (round-off down/up, GST shop quick
  lines, 100 % discount).
- **Navigation:** Bill tab (`RequirePermission('sale.create')`), hidden `receipt` route (`?saleId=`).
- **Native packages added:** expo-print, expo-sharing, react-native-svg, react-native-qrcode-svg (all in Expo Go / SDK 58).
- **Strings:** en + hi, 285 keys each, parity checked.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261025012656_p04_sales` | `private.compute_bill`; `sales`, `sale_items`, `sale_payments`; `rls.can_view_sale`; RLS policies; `private.sale_json`; RPCs `create_sale`, `get_sale` |
| `20261025012957_p04_fk_indexes` | Covering indexes for three foreign keys flagged by the performance advisor after Phase 03 |

**RLS / security:** clients have SELECT only on the three sale tables; rows visible when the caller created the sale, the shop
has `cashier_sees_all_sales`, or the role has `sale.view_all`. No INSERT/UPDATE/DELETE grants. `create_sale` / `get_sale` are
SECURITY DEFINER with `search_path = ''`, re-check membership per call and are executable by `authenticated` only.
Security advisor after the migration: only the expected findings (RPC-only tables without policies; intended RPCs callable by
`authenticated`; `get_client_config` by `anon`).

## Tests executed (2026-10-25)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **119 / 119** (9 suites; 16 new) |
| admin (Vitest) | **11 / 11** |
| @ds/contracts | **29 / 29** |
| @ds/domain-core | **77 / 77** |
| DB pre-check (PGlite) | **175 / 175** assertions, 10 files (new `010_sales` 28; money fixtures 24 → 32) |
| DB pgTAP + concurrency on real Supabase (CI `database` job) | see PROJECT_STATUS.md §3 |

New tests cover:
- **Idempotency:** a replay returns the same sale; the same operation id with another bill is a conflict; ViewModel double
  tap → one request; retry after a lost response → replay, one sale; an edited bill gets a new operation id.
- **Invoice numbers:** first number of the device; next number; gap refused; reuse refused; client moves to the server's
  number and resends the same operation; CI script races two bills for one number (one wins) and submits one bill twice at
  once (one sale), then checks there are no gaps.
- **Totals parity:** all 8 bill fixtures in TypeScript and SQL; `DS_TOTAL_MISMATCH`.
- **Payments:** must add up to the total; disabled methods refused; UPI stored as manual confirmation; udhaar needs a customer.
- **Discounts:** a cashier above the shop limit is refused even through the RPC; owner discount allowed and audited; manager
  limit in the ViewModel.
- **Security:** device of another shop / revoked device refused; shop B cannot bill or read in shop A; a cashier sees only their
  own bills and cannot open the owner's receipt; `cashierSeesAllSales` widens it; direct inserts denied (42501).
- **UI:** amount → Pay → Cash received with change due; UPI QR carries the amount; Hindi receipt shares WhatsApp text.

Static checks: format ✅, typecheck (4 workspaces) ✅, lint ✅ (0 warnings), SQL fixtures regenerated ✅, admin `next build` ✅,
Android Metro export ✅.

Found and fixed while testing: the domain layer imported `AppError` (caught by the boundary lint rule) → the repository now
throws a domain `InvoiceSequenceConflict`; the audit assertion needed the database owner role.

**Flaky tests:** 2 of 10 full mobile runs on this PC had timing failures in screen tests, and CI failed the unit-test step on
the Phase 03 docs commit `e4dfe64` while the same code passed on `f8559d3`. Two assertions read the screen right after a
change instead of waiting for it: the ProductsScreen search test checked for "Salt" as soon as "Sugar" disappeared (the list
is briefly empty in between), and two BillingScreen tests read the payment sheet without waiting. Both now wait
(`findBy…`), and the async timeout is 5 s (`tests/setupAfterEnv.ts`). Afterwards: 3 of 3 runs with 2 workers passed 119/119.
SelectShopScreen failed once and has no obvious race; it is watched under BL-406.

## Acceptance criteria
- [x] Quick bill saved exactly once under double-tap, timeout and retry (ViewModel, use-case and pgTAP tests; concurrent duplicate in CI).
- [x] Server totals equal domain-core totals for every fixture (8 bill fixtures run in both).
- [x] Invoice numbers unique and gap-free per device series, including concurrent submissions (unique keys + row lock; pgTAP; CI race script).
- [~] Receipt share as PDF and WhatsApp text (en/hi) — implemented; WhatsApp text and the HTML are tested in en/hi. PDF
  creation and the share sheet run only on a device and have **not** been tried on one yet.

## Decisions (DECISIONS.md)
ADR-035 device proposes the invoice number, server accepts only `last_seq + 1` · ADR-036 one sale attempt per bill version ·
ADR-037 Phase 04 `create_sale` takes camelCase input and quick lines only.

## Known limitations (Phase 04)
- Product lines, barcode scanning, sales history and void arrive in Phase 05 (the tables already hold product lines).
- One payment method per bill in the UI (the RPC accepts up to 10 payments); split payment UI in Phase 05.
- Udhaar is hidden until customers exist (Phase 08); online only — offline queue in Phase 09.
- If a save times out and the user then **changes** the bill, the first bill may already exist; the changed bill is saved
  as a new one with the next number. It will be visible and voidable from history in Phase 05.
- Quick lines carry no GST; GST shops get tax on product lines (Phase 05).
- Thermal printing pending OD-08. App not run on a device in this environment.
- The SQL applied through the Supabase MCP had a few explanatory comments removed; statements match the committed files.

## External configuration still required
- **Supabase Auth (dev project):** the "Magic Link" email template must contain `{{ .Token }}`; I could not change it because
  the dashboard needs your sign-in (the built-in browser is open on the sign-in page). Phone OTP needs an SMS provider
  account and keys (OD-02), which only you can create.
- **EAS account** for a development build, needed once a native module outside Expo Go is added (not yet).

## Recommended next phase
Phase 05 — product billing, barcode scanning, payment split, sales history and void.
