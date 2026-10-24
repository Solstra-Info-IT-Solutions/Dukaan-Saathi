# Product Requirements — Dukaan Saathi

Status: Draft v1 (Phase 00). Owner: product owner (you). Requirements IDs are referenced from
[BACKLOG.md](BACKLOG.md) and feature specs.

## 1. Problem and positioning

Small Indian retailers bill on paper, a calculator, or memory. They lose track of udhaar (credit given
to customers), cannot tell what they earned today, run out of fast-moving stock, and cannot easily
see what a staff member billed. Existing POS products are either desktop-first, English-only, need a
full product catalogue before the first bill, or are too expensive.

Dukaan Saathi is a phone-first billing app that:

1. Lets a shopkeeper bill **from the first minute with no catalogue** (quick amount billing).
2. Grows into catalogue billing, barcode scanning, stock and purchases as the shop is ready.
3. Treats **udhaar** as a first-class ledger, not a notes field.
4. Works in **Hindi and English**, with Hindi/Hinglish voice billing.
5. Keeps billing working **offline** and syncs safely.
6. Is sold as a subscription with plans and entitlements controlled from an admin panel, with
   **managed onboarding** (our operators import the shop's product list for them).

## 2. Personas

| Persona | Description | Primary needs |
|---|---|---|
| Owner | Runs the shop, often alone, mid-range Android phone, comfortable with WhatsApp, limited English | Fast bills, today's earnings, udhaar list, low-stock list, control over staff |
| Manager | Trusted family member or senior staff | Billing, purchases, stock, customers; no subscription or staff control |
| Cashier | Staff at the counter | Billing only, cannot see profits, cannot void or give large discounts |
| Customer (indirect) | Buys from the shop | Receives receipt on WhatsApp; may receive udhaar reminders from the owner |
| Onboarding operator (platform) | Our staff | Import catalogue from photos/Excel, configure shop, train owner |
| Support agent (platform) | Our staff | Look up shop, read tickets, read-only diagnostics |
| Billing admin (platform) | Our staff | Plans, subscriptions, entitlement overrides |
| Super admin (platform) | You | Everything administrative, feature flags, platform config, admin user management |

## 3. Scope (functional requirements)

Each requirement has an ID `FR-xx`. "Phase" is the target delivery phase.

### FR-01 Authentication (Phase 02)
- Phone number + OTP login for shop users. Email OTP available for development and as fallback.
- Session persisted securely on device; sign out clears local secrets and local business data for that shop
  (after warning if unsynced data exists).
- Admin panel: email + password with mandatory TOTP MFA for platform roles.

### FR-02 Shop registration and membership (Phase 02)
- A new user creates a shop: name, business category, address (optional), phone, language, GST status.
- The creator becomes `owner`. A user may belong to multiple shops and switch between them.
- Owner invites staff by phone number with a role (`manager`, `cashier`). Invitation is accepted on first login with that phone.
- Owner can change roles and deactivate members. A shop must always have at least one active owner.
- Each installed app registers as a **device** of the shop (needed for invoice series and offline sync).

### FR-03 Quick billing without a catalogue (Phase 04)
- Amount keypad; add multiple amounts as lines with an optional label ("doodh", "sabzi").
- Bill discount, payment method selection (cash / UPI / card / udhaar / split).
- Cash tendered and change due display.
- Completes in ≤ 3 taps after entering the amount.

### FR-04 Product catalogue and categories (Phase 03)
- Products: name (Hindi and/or English), aliases (for search and voice), category, unit, selling price,
  optional MRP, optional cost price, optional barcode(s), optional tax rate, optional HSN code, active flag,
  optional low-stock threshold, stock tracking on/off.
- Units: piece, kg, gram, litre, ml, dozen, packet, box, metre (system list, extendable by platform config).
- Loose items (kg, litre) support fractional quantity to 3 decimals.
- Categories: owner-defined, with system suggestions per business category.
- Product count limited by plan entitlement.
- Price changes are recorded in price history.

### FR-05 Product-based billing (Phase 05)
- Search by name/alias (Hindi or English text), browse by category, recent/frequent items.
- Quantity entry including loose quantities ("250 g", "1.5 kg") and amount-based entry for loose items
  ("₹40 ka pyaaz" → quantity computed from price).
- Line discount (permission-gated), price override (permission-gated and shop-setting-gated).
- Mixed bills: catalogue lines and quick amount lines in the same bill.

### FR-06 Barcode scanning (Phase 05)
- Camera scanning of EAN-13, EAN-8, UPC-A, UPC-E, Code-128, QR.
- Unknown barcode → offer to create product (if permitted) or add as quick line.
- Continuous scanning mode for multiple items.

### FR-07 Payment recording (Phase 04–05)
- Methods: cash, UPI, card, other, udhaar (credit to customer). Split payments across methods.
- UPI: show the shop's UPI QR (generated from shop VPA and bill amount). The cashier **manually confirms**
  receipt. The app never claims a UPI payment is verified without a trusted payment-provider integration.
- Udhaar requires a customer.

### FR-08 Receipts and invoice history (Phase 05)
- Receipt with shop details, invoice number, date/time, lines, taxes (if GST-registered), payments, balance due.
- Share as PDF/image and as WhatsApp text; reprint/reshare from history.
- Invoice history with search (invoice number, customer, amount, date) and filters (date, payment method, status, staff).
- Void a sale (permission-gated, reason required, within a configurable window). Voids reverse stock and udhaar; never delete.
- Bluetooth thermal printing: **open decision** (see DECISIONS.md, OD-08).

### FR-09 Sales reports (Phase 06)
- Today dashboard: sales total, bill count, payment method split, udhaar given today, udhaar collected today, cash in hand estimate.
- Date-range reports: sales by day, by payment method, by category, by product, by staff member.
- Profit estimate where cost price is known (owner-only).
- Export CSV/PDF (entitlement-gated).

### FR-10 Expenses (Phase 06)
- Record expense: category, amount, date, payment method, note, optional photo of bill.
- Expense categories: system defaults + owner-defined.
- Included in daily summary and profit estimate.

### FR-11 Day close and reconciliation (Phase 06)
- End-of-day cash reconciliation: expected cash (opening + cash sales + cash repayments − cash expenses − cash supplier payments) vs counted cash, with difference recorded.

### FR-12 Inventory and stock movements (Phase 07)
- Stock tracked per product (optional per product). Every change is a stock movement with type and reason:
  sale, sale void, return, purchase receipt, adjustment (damage, expiry, count correction, opening stock).
- Stock count (physical count) workflow producing adjustment movements.
- Low-stock list and notifications.
- Negative stock allowed or blocked per shop setting (default: allowed with warning).

### FR-13 Suppliers and purchases (Phase 07)
- Suppliers with phone, GSTIN (optional), opening balance.
- Purchase entry: supplier, invoice number/date, lines (product, quantity, cost price), payments, amount due.
- Receiving a purchase increases stock and updates last cost price atomically.
- Supplier ledger (amount payable) with payments to supplier.

### FR-14 Customers (Phase 08)
- Customer: name, phone (optional but needed for WhatsApp), address, notes, credit limit (optional).
- Quick-add customer from billing.
- Customer purchase history.

### FR-15 Udhaar and customer ledger (Phase 08)
- Ledger entries: credit sale (debit), repayment (credit), opening balance, sale void reversal, adjustment (owner-only, reason required).
- Balance = sum of entries; cached on customer row inside the same transaction.
- Udhaar list sorted by balance / oldest due; reminder via WhatsApp deep link (sent by the owner from their own WhatsApp).
- Credit limit warning or block (shop setting).

### FR-16 Managed onboarding (Phase 11)
- Owner requests onboarding from the app (choose: upload Excel/CSV, upload photos of product list, or call-back).
- Operator in admin panel sees the queue, works the request, creates an import job on behalf of the shop, owner reviews and approves.

### FR-17 CSV/Excel import and review (Phase 03 basic, Phase 11 operator workflow)
- Upload CSV/XLSX → server parses into staged rows → validation (required fields, duplicates, price formats, unit mapping) → review screen with per-row errors and edits → commit atomically.
- Import limits from entitlements. Commit is idempotent.

### FR-18 Offline billing and synchronization (Phase 09)
- Billing (quick and catalogue), customer repayment, expense entry and quick customer creation work offline.
- Catalogue, customers and settings are cached locally for offline use.
- Clear sync status (pending count, last synced time, failures needing attention).
- No financial record is silently overwritten or dropped.

### FR-19 Hindi/Hinglish voice billing (Phase 10)
- Speak items: "do kilo cheeni, ek Parle-G, paanch sau ka tel" → draft cart.
- Always shown as a draft for explicit confirmation; nothing is billed from voice without a tap.
- Unrecognised items shown clearly with options (pick product, add as quick line, discard).

### FR-20 Notifications (Phase 06+ incremental, consolidated Phase 11)
- Push to owner/manager: low stock digest, daily summary, sync failures, subscription expiry, announcements.
- Customer-facing messages (receipts, udhaar reminders) are sent by the shopkeeper via WhatsApp deep links in v1.

### FR-21 Super admin panel (Phase 11)
- See [ADMIN_PANEL_SPECIFICATION.md](ADMIN_PANEL_SPECIFICATION.md).

### FR-22 Subscription plans and entitlements (Phase 12)
- Plans with structured entitlements (booleans and limits). Trial period configuration.
- Shop subscription lifecycle: trialing → active → past_due → grace → expired / cancelled.
- Server-side enforcement of entitlements and quotas.
- Payment collection: **open decision** (OD-05). App shows plan status; purchase flow decided per Play policy review.

### FR-23 Audit logging (Phase 02 foundation, extended every phase)
- Append-only audit log for sensitive shop actions (voids, price overrides, discounts above threshold,
  role changes, stock adjustments, ledger adjustments) and all admin actions.

### FR-24 Support workflows (Phase 11)
- In-app: help articles (dynamic content), create ticket with category and optional screenshot, view ticket replies.
- Admin: ticket queue, assignment, replies, status, internal notes.

### FR-25 Security hardening, backup, recovery, monitoring (Phase 13–14)
- See SECURITY_MODEL.md and DEPLOYMENT_GUIDE.md.

### FR-26 Shop settings (Phase 02 foundation, extended per feature)
- Language, receipt header/footer, UPI VPA, enabled payment methods, GST registration and GSTIN,
  tax-inclusive pricing, rounding, negative stock policy, credit limit policy, void window, discount limit per role.

## 4. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | Quick bill completion p95 ≤ 1.5 s online on a 4G connection; offline bills complete locally ≤ 300 ms. |
| NFR-02 | Runs on Android 9+ with 3 GB RAM. Cold start ≤ 4 s on a mid-range device. Android first; iOS later (OD-10). |
| NFR-03 | All monetary values stored as integer paise. No floating-point money anywhere authoritative. |
| NFR-04 | Tenant isolation enforced by PostgreSQL RLS and tested automatically. |
| NFR-05 | Every financial write is atomic (single DB transaction) and idempotent (client operation ID). |
| NFR-06 | Financial records are never hard-deleted or rewritten; corrections are new entries. |
| NFR-07 | UI available in English and Hindi; all user-facing strings localised; numbers in Indian grouping (1,23,456.00). |
| NFR-08 | Accessibility: touch targets ≥ 48 dp, screen-reader labels, sufficient contrast, scalable fonts up to 130 %. |
| NFR-09 | Data hosted in India region (Supabase `ap-south-1` Mumbai) — supports DPDP Act expectations; legal review pending (OD-12). |
| NFR-10 | Personal data minimised; customer phone numbers visible only to shop members with permission. |
| NFR-11 | Old app versions keep working for at least 90 days after a new release, or are forced to update via `min_supported_app_version`. |
| NFR-12 | Backups: point-in-time recovery on production database; documented restore drill before pilot. |
| NFR-13 | Observability: crash and error reporting on mobile and admin; DB and Edge Function logs reviewed. |

## 5. Business rules (cross-cutting)

| ID | Rule |
|---|---|
| BR-01 | Money is integer paise (`bigint` in DB, branded integer `Paise` in TypeScript). |
| BR-02 | Quantity is integer milli-units (`quantity_milli`; 1 kg = 1000, 1 piece = 1000). |
| BR-03 | Line amount = round_half_up(unit_price_paise × quantity_milli / 1000) − line_discount_paise. |
| BR-04 | Bill total = Σ line amounts − bill discount + round-off. Round-off (to nearest rupee) is a shop setting, default off. |
| BR-05 | Prices are tax-inclusive by default. For GST-registered shops, tax is back-calculated per line from the snapshot tax rate: tax = round_half_up(amount × rate / (100 + rate)). CGST/SGST split equally (odd paisa to CGST). |
| BR-06 | Tax rates are configuration (`tax_rates` table), never hard-coded, because GST slabs change. |
| BR-07 | Σ payments (non-udhaar) + udhaar amount = bill total. Overpayment is not stored; change due is display-only. |
| BR-08 | Udhaar requires a customer. Credit limit enforcement follows the shop setting (`warn` default, `block` optional). |
| BR-09 | Each sale stores snapshots: product name, unit, price, tax rate, cost price at time of sale. |
| BR-10 | Invoice numbers are per shop, per device, per Indian financial year (April–March): `{prefix}/{FY}/{device_code}-{seq}` e.g. `DS/2627/B-000123`. Unique and gap-free per series. |
| BR-11 | Business date is derived from `occurred_at` in the shop's time zone (default `Asia/Kolkata`). |
| BR-12 | A void reverses the sale's stock movements and ledger entries with new entries; the sale is marked `voided`. Voids are allowed within the shop's void window (default 24 h, owner unlimited). |
| BR-13 | Cashier discount limit (default 0 % / ₹0) and manager discount limit (default 10 %) are shop settings; owner unlimited. |
| BR-14 | Plan entitlements are enforced on the server for protected operations; the app only uses them for display. |
| BR-15 | A synced offline sale is never rejected for business reasons (stale price, stock); it is accepted and flagged `needs_review` when something is unusual. Only authorization failures quarantine it. |

## 6. Out of scope for v1 (documented, not forgotten)

- GST e-invoicing (IRN) and GST return filing.
- Multi-branch shops sharing one stock pool (single shop per tenant in v1; multiple shops per user is supported).
- Customer-facing app or loyalty programme.
- Payment-provider-verified UPI collection (static QR + manual confirmation only).
- WhatsApp Business API automated messaging (deep links only).
- iOS release (architecture supports it; release decision OD-10).

## 7. Success metrics for pilot

- 10 real shops billing daily for 30 days.
- ≥ 80 % of their sales recorded in the app (owner self-report + bill count trend).
- Zero cross-tenant data incidents; zero lost synced sales.
- Median bill time ≤ 10 s for quick bills.
