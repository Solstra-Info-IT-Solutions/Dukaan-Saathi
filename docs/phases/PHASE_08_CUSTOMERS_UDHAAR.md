# Phase 08 — Customers, Udhaar, Repayments, Ledger

Status: **Complete — awaiting approval** · Date: 2026-10-26 · Spec: [../features/customers-and-udhaar.md](../features/customers-and-udhaar.md)

## Features implemented (end-to-end)

### 1. Customers
More → **Udhaar (customers)** (`customer.view`, all roles) → `UdhaarListScreen` → **Add customer** →
`CustomerFormScreen` / `useCustomerFormViewModel` → `SaveCustomer` → `save_customer`:
- name, phone (normalised to +91…, unique per shop among active customers), note;
- owners and managers (`customer.manage`) can also enter udhaar already owed (a minus sign = advance) and a credit
  limit; cashiers (`customer.quick_create`) add name and phone only;
- client-generated id, so saving twice is safe; the opening balance counts only when the customer is created;
- `customers.max` quota checked on creation (free trial: unlimited).

### 2. Udhaar on a bill
Bill → **Pay** → the payment sheet offers **Udhaar** when the shop has it switched on and the user has `udhaar.grant`
(owner, manager, cashier). Udhaar can take the whole bill, or be the second part of a split (e.g. ₹40 cash + ₹60
udhaar). A customer is required: search by name or phone, or **New customer** (name + phone, quick add) without
leaving the bill. The sheet shows the customer's balance and warns when the bill would cross their credit limit.
`CreateSale` sends `udhaarPaise` + `customerId` → `create_sale`, in one transaction:
- customer locked, must be active; udhaar method must be enabled; `udhaar.grant` checked;
- credit limit policy from shop settings (ADR-053): **block** refuses with `DS_CREDIT_LIMIT_EXCEEDED`, **warn**
  (default) saves and returns a `CREDIT_LIMIT` warning, **none** skips the check;
- the sale stores the customer; a `sale` ledger entry raises the balance; the new balance is returned.

### 3. Customer account (ledger)
Udhaar list → customer → `CustomerLedgerScreen` / `useCustomerLedgerViewModel` → `get_customer_ledger`: balance
("Owes ₹…", "Advance ₹…" or "Settled"), credit limit, and every entry newest first with the balance after it
(opening, bill on udhaar, paid, bill voided, returned goods, correction). Entries with a bill open its receipt.
Entries are never edited or deleted; the balance is always the sum of entries (ADR-054), checked by
`check_customer_drift`.

### 4. Repayment
**Payment received** (`udhaar.collect`: owner, manager, cashier) → amount, method (cash / UPI / card / other), note →
`RecordRepayment` → `record_customer_repayment`. Paying more than owed is allowed and becomes an advance. One
operation id per typed payment: a retry after a timeout is not counted twice (tested). Cash repayments on a phone are
added to that phone's expected cash at day close (`cashRepaymentsPaise`); the dashboard shows udhaar given and
udhaar collected today.

### 5. Owner correction
**Correct the balance (owner)** (`udhaar.adjust`, owner only) → reduce / add, amount, reason (required) →
`AdjustBalance` → `adjust_customer_balance`: an `adjustment` entry, audited with the reason and the balance before
and after.

### 6. WhatsApp reminder
On a customer who owes money → **Send WhatsApp reminder** → pure `buildReminderMessage` (English or Hindi, by the
app language) with the amount and, when the shop has a UPI id, a UPI payment link for exactly that amount →
`https://wa.me/<phone>?text=…` opens WhatsApp with the text filled in. Nothing is sent automatically; the
shopkeeper presses send.

### 7. Voids and returns of credit bills
- Voiding a credit bill adds a `sale_void` entry that takes the udhaar back off the balance.
- A bill with returns can no longer be voided (`DS_CONFLICT`, `sale_has_returns`): the returns already gave stock and
  money back, so a void would return them twice (ADR-052). This also closes the same gap for cash bills from
  Phase 06.
- A return of a bill with a customer can be refunded **to udhaar** (`refundMethod: 'udhaar'`): a `sale_return`
  entry lowers the balance instead of money leaving the drawer.
- Receipts (screen, WhatsApp text, PDF) show "On udhaar ₹…" and the customer's name.

## Mobile
- **New feature `customers`:** screens UdhaarList, CustomerForm, CustomerLedger; ViewModels `useUdhaarListViewModel`,
  `useCustomerFormViewModel`, `useCustomerLedgerViewModel`; use cases `ListCustomers`, `SaveCustomer`,
  `GetCustomerLedger`, `RecordRepayment`, `AdjustBalance`; pure `buildReminderMessage`, `whatsappUrl`;
  `CustomerRepository` → `CustomerRepositoryImpl` → `SupabaseCustomerDataSource` (RPCs only).
- **Billing:** `BillMethod` (money methods + udhaar), generic `splitPayments`, `CustomerFinder` port (search + quick
  add, adapted from the customers feature in the composition root), payment-sheet customer picker, `CreateSale`
  udhaar checks (`CUSTOMER_REQUIRED`), receipt udhaar/customer lines, refund to udhaar.
- **Shared:** `upiPaymentUri` moved to `@ds/domain-core` (billing QR and reminders use the same builder).
- **Reports:** dashboard "Udhaar given" / "Udhaar collected"; day close "Udhaar collected in cash".
- **Contracts:** new `customers.ts`; `CreateSaleInput` + `udhaarPaise`/`customerId`; sale output
  `customerBalancePaise`, credit-limit warning fields; `SaleSchema.customer`; refund method `udhaar`;
  `udhaarCollectedPaise`, `cashRepaymentsPaise` (default 0 for older data).
- **Navigation:** More → Udhaar (`customer.view`); hidden routes `udhaar`, `customer`, `customer-new`.
- **Strings:** en + hi, 576 keys each, parity checked.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261025072140_p08_customers_udhaar` | `customers`, `customer_ledger_entries` (with `balance_after_paise` and an identity `seq` for exact order); `sales.customer_id` foreign key and "udhaar needs a customer" check; refund method `udhaar`; `add_customer_entry`, `customer_json`; RPCs `save_customer`, `archive_customer`, `list_customers`, `get_customer_ledger`, `record_customer_repayment`, `adjust_customer_balance`, `check_customer_drift`; patched `create_sale`, `void_sale`, `create_sale_return`, `sale_json`, `get_dashboard_snapshot`, `cash_breakdown` |

**RLS / security:** customers and ledger readable with `customer.view`; no client writes. Writes are SECURITY DEFINER
RPCs with `search_path = ''`: creating (`customer.manage`, or `customer.quick_create` without balance or limit),
editing (`customer.manage`), repayment (`udhaar.collect`), correction (`udhaar.adjust`), credit bills
(`udhaar.grant`). Security and performance advisors after the migration: no new kinds of findings (SECURITY DEFINER
RPCs callable by signed-in users by design; new indexes not used yet).

## Tests executed (2026-10-26)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **165 / 165** (14 suites; new customers 7, billing udhaar 4) |
| admin (Vitest) | **11 / 11** |
| @ds/contracts | **30 / 30** |
| @ds/domain-core | **77 / 77** |
| DB pre-check (PGlite) | **305 / 305** assertions (new `015_customers_udhaar` 36) |
| DB pgTAP + storage + concurrency on real Supabase (CI) | ✅ passed on `a2036f2` ([run 40284535910](https://github.com/Solstra-Info-IT-Solutions/Dukaan-Saathi/actions/runs/40284535910)) |

**Database ledger fixture** (`015`): Ramesh starts with ₹500 owed → ₹300 credit bill (₹800) → ₹400 bill with ₹100
paid, over the ₹1,000 limit with policy "warn" (saved, warning, ₹1,100) → policy "block" refuses → udhaar switched
off is refused → ₹200 cash repayment (₹900), replay counted once → void of the ₹300-udhaar bill (₹600) → cashier
cannot correct; correction without a reason refused; owner −₹100 (₹500), audited → ₹300 bill returned to udhaar
(₹200) → a bill with returns cannot be voided → cashier collects ₹50 by UPI (₹150). Every step is a separate entry
with the balance after it, and the cached balance equals the sum of entries. Also: phone unique per shop; cashier
quick add allowed, opening balance and edits refused; udhaar needs a customer; udhaar list highest first with the
shop total; dashboard udhaar collected ₹250; day close counts only the ₹200 cash repayment; the bill carries the
customer; a customer who owes cannot be archived; shop B cannot read shop A's customers or ledger.

**App tests:** advance with a minus sign, credit limit, phone normalised, invalid phone and empty name refused;
repayment amount and correction reason rules, correction sign; reminder text in English and Hindi with and without
UPI, WhatsApp URL with and without a phone; udhaar list (total, highest first, settled hidden, search, open);
ledger (entries with balance after, repayment after a failed try reuses the operation id and counts once, owner
correction, WhatsApp reminder opens with the right text); cashier form has no balance fields; billing: udhaar part
of a split needs a customer, credit-limit hint, request carries cash + udhaar + customer; udhaar hidden without the
permission; whole bill on udhaar for a customer quick-added from the bill; receipt shows udhaar and customer.

Static checks: format ✅, typecheck ✅, lint ✅ (0 warnings), SQL fixtures current ✅.

One billing screen test failed once while all workspaces' tests ran at the same time on this PC; the full mobile
suite then passed 5 runs in a row (3 of them with 2 workers). Tracked with the other timing failures (BL-406).

## Acceptance criteria
- [x] Udhaar enabled in billing with credit-limit policy (block / warn / none).
- [x] Ledger entries for credit, repayment, void, return, adjustment; balances rebuildable (sum of entries, drift
  check, tests).
- [x] Credit sale increases balance; repayment decreases; void reverses — all visible as separate entries.
- [x] WhatsApp reminder deep link in en/hi with the amount and UPI link; nothing sent automatically.
- [~] Two repayments at once: every ledger write locks the customer row `for update`; no dedicated concurrency
  script yet (the CI script covers invoice numbers).
- [ ] Maestro journeys J-02/J-03 need a device (BL-807).

## Decisions (DECISIONS.md)
ADR-051 one `save_customer` RPC and RPC reads · ADR-052 bills with returns cannot be voided · ADR-053 credit limit
policy per shop, limit per customer · ADR-054 customer ledger is insert-only and stores the balance after each entry;
returns can go to udhaar; cash repayments count at day close.

## Known limitations (Phase 08)
- No interest or late fees; no automatic SMS/WhatsApp reminders (no Business API in v1).
- No customer edit or archive screen yet (the RPCs support both); no merge of duplicate customers (offline duplicates
  are Phase 09).
- The ledger screen shows the latest 100 entries (no "load more" yet).
- Repayments made on one phone are not part of another phone's day close (day close is per phone).
- The app is still untested on a device; the Supabase Auth settings are still pending.

## External configuration still required
Unchanged: Supabase Auth email template with `{{ .Token }}` and an SMS provider (OD-02); EAS account; push
credentials; pilot printer models (OD-08).

## Recommended next phase
Phase 09 — offline persistence and sync (local catalogue, customers and settings; outbox for bills).
