# Phase 06 — Reports, Expenses, Returns, Day Close

Status: **Complete — awaiting approval** · Date: 2026-10-25 · Spec: [../features/reports-expenses-dayclose.md](../features/reports-expenses-dayclose.md)

## Features implemented (end-to-end)

### 1. Today and the sales report
More → **Today & reports** → `ReportsScreen` / `useReportsViewModel` → `GetDashboard` / `GetSalesReport` →
`ReportsRepository` → `SupabaseReportsDataSource` → `get_dashboard_snapshot` / `get_sales_report`.
- **Today:** sales, bills, returns, net, expenses, voided bills, money received per method, and — with `report.view_profit` —
  an estimated profit with the share of items that have a cost price. Cashiers (no `report.view_sales`) get only their
  own sales and bill count of the day.
- **Report:** today / 7 days / this month, grouped by day, payment, item, category or staff. More than 7 days or the item /
  category / staff breakdowns need `reports.advanced`; on a basic plan the server answers `DS_ENTITLEMENT_REQUIRED` and the
  screen shows an upgrade message instead of an error.
- **Definitions** (match the feature spec): sales = Σ total of non-voided bills by business date; returns counted on the day
  they happen; net = sales − returns; profit estimate = Σ (line net − cost × qty) for lines with a known cost.
- **Business date** is now stored on every sale (`sales.business_date`, the shop's local date, set by a trigger and
  back-filled), so day totals do not depend on UTC.

### 2. CSV export (BL-603, adapted — ADR-044)
**Export CSV** → `ExportSalesReport`: `begin_report_export` first checks `report.export`, the `reports.export`
entitlement and the `exports.monthly` quota and counts the export; then the phone builds the CSV from the report it already
shows (`reportCsv`: plain rupee numbers, quoted text) and opens the share sheet (`core/sharing/fileSharer`). No Edge
Function or export bucket is needed for this.

### 3. Returns
Receipt → **Return items** (`sale.return`: owner, manager) → quantity per line (empty/0 keeps it sold; quick amounts
return whole), refund method, reason → `CreateSaleReturn` → `create_sale_return`:
- cannot return more than is left of a line; voided bills cannot be returned;
- refund = the line's net amount for the returned share, rounded half up; the **last** return of a line refunds exactly what
  is left, so a line's refunds always add up to what the customer paid for it (ADR-043);
- stock comes back (`sale_return` movement) only for products whose sale moved stock; audited; idempotent.
The receipt lists each return ("Returned ₹9.33 (Cash): Spoilt"), and so do the WhatsApp text and the PDF.

### 4. Expenses with receipt photos
More → **Expenses** (`expense.view`) → list for today / 7 days / month with the total (voided ones struck out, not counted);
**Add expense** (`expense.create`: owner, manager) → category, amount, method, note, **take or choose a receipt photo**
(`expo-image-picker`, compressed) → `RecordExpense`: the photo is uploaded first to the private bucket
`expense-attachments` at `<shop>/<expense>/receipt.jpg`, then `record_expense` stores the expense. The expense id is
generated once per form and is the idempotency key, so a retry returns the same expense (ADR-045). Owners void an expense
with a reason. Photos open through a 5-minute signed link.
Storage policies: upload needs `expense.create` for the shop in the first path segment; reading needs `expense.view`.

### 5. Day close
More → **Close the day** (`day.close`, every role) → `DayCloseScreen` / `useDayCloseViewModel` → `get_day_close` / `close_day`:
expected cash **for this phone** = opening cash + cash sales − cash refunds − cash expenses recorded on this phone; the
user types the counted cash and sees "₹2 short" / "₹3 extra" / "Cash matches" live; closing stores expected, counted,
difference and the breakdown, once per phone per day (ADR-046). Idempotent; a second closing is `DS_CONFLICT`.

## Inventory
- **New features:** `reports` (Reports + DayClose screens/ViewModels; use cases GetDashboard, GetSalesReport,
  ExportSalesReport, GetDayClose, CloseDay; pure `reportCsv`, `expectedCash`, `istDate`, `rangeFor`, `rangeDays`;
  ReportsRepository → Impl → SupabaseReportsDataSource) and `expenses` (Expenses + ExpenseForm screens/ViewModels;
  RecordExpense, ListExpenses, VoidExpense, GetExpensePhotoUrl; ExpenseRepository → Impl → SupabaseExpenseDataSource with
  storage upload and signed URLs).
- **Billing:** CreateSaleReturn, return dialog on the receipt, returns on receipts.
- **Ports / core:** `ReceiptPhotoPicker` → `core/files/receiptPhotoPicker` (expo-image-picker), `readFileBytes`;
  `FileSharer` → `core/sharing/fileSharer` (expo-file-system + expo-sharing).
- **Contracts:** `reports.ts` (dashboard, sales report, day close, expenses, returns); `SaleSchema` + returns and returned
  quantities; database types for the new tables and RPCs.
- **Navigation:** More → Today & reports (everyone), Expenses (`expense.view`), Close the day (`day.close`); hidden routes
  `reports`, `expenses`, `expense-new`, `day-close`.
- **Native package added:** `expo-image-picker` (config plugin; microphone off).
- **Strings:** en + hi, 430 keys each, parity checked.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261025030258_p06_reports_expenses` | `sales.business_date` + trigger + back-fill; `sale_returns`, `sale_return_items`, `sale_return` stock movements; `sale_json` with returns; `expenses` + bucket `expense-attachments` (private, 5 MB, JPEG/PNG/WebP) and 2 storage policies; `day_closures`; `cash_breakdown`, `profit_estimate`; RPCs `create_sale_return`, `record_expense`, `void_expense`, `get_day_close`, `close_day`, `get_dashboard_snapshot`, `get_sales_report`, `begin_report_export`; `report_exports` |

Verified on the hosted project: bucket private with the size and type limits, both storage policies present.

**RLS / security:** returns readable with the sale (same cashier scope); expenses with `expense.view`; day closures with
`report.view_sales` or by the person who closed; `report_exports` has no client access. All writes are SECURITY DEFINER RPCs
(`search_path = ''`, membership + permission per call). Storage paths are tied to the shop by `rls.shop_of_path`.

## Tests executed (2026-10-25)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **142 / 142** (11 suites; new: reports 7, expenses 4, billing returns 2) |
| admin (Vitest) | **11 / 11** |
| @ds/contracts | **30 / 30** |
| @ds/domain-core | **77 / 77** |
| DB pre-check (PGlite) | **239 / 239** assertions, 12 files (new `012_reports_expenses` 34); `013_expense_storage` skipped locally (needs Supabase storage) |
| DB pgTAP + storage + concurrency on real Supabase (CI) | see PROJECT_STATUS.md §3 |

**The seeded day** (same numbers in pgTAP and in the app's fake repository): bills ₹90 (2 sugar, cash), ₹50 (UPI), ₹20
(cash, voided), ₹10 (cashier, cash); 1 sugar returned (₹45 cash); expenses ₹3 tea (cash), ₹100 rent (UPI), ₹5 (voided).
Expected and asserted: sales ₹150, bills 3, voided 1, returns ₹45, net ₹105, payments cash ₹100 + UPI ₹50, expenses ₹103,
profit ₹10 (1 of 3 lines with cost); cashier sees ₹10 / 1 bill; day close of device A with ₹10 opening = ₹52 expected,
₹50 counted → ₹2 short; daily report row equals the dashboard; product report Sugar ₹90 (2 pcs, profit ₹10) + typed
amounts ₹60.
Other database tests: return beyond what is left, return of a voided bill, partial quick-amount return refused; cashier cannot
take returns, open reports or record expenses; close once per device per day + replay; breakdowns and > 7 days need
`reports.advanced`; 7 days allowed on every plan; export quota; expense replay by id; attachment path tied to shop and
expense; no future-dated expenses; shop B cannot read shop A expenses. Storage (CI): bucket private; owner uploads under
their shop; another shop cannot upload into or list shop A's receipts.

Static checks: format ✅, typecheck ✅, lint ✅ (0 warnings), SQL fixtures current ✅, admin build ✅, Android Metro export ✅.

Found while testing: on real Postgres one report assertion sorted rows by name, and real Postgres sorts "quick" before
"Sugar" (locale collation) while PGlite uses byte order; the test now sorts by amount. Dashboard payments were declared as a full record of all methods (Zod 4 requires every key), so a
real day with only cash and UPI would have failed to parse — now a partial record, with a contract test; two report screens
imported the domain layer directly (boundary lint) — now through their ViewModels.

## Acceptance criteria
- [x] Dashboard and reports match fixture totals exactly (seeded day, pgTAP + app tests).
- [x] Expenses with attachments in a private bucket (policies tested in CI; upload from a real phone not yet tried).
- [x] Day close records expected vs counted cash (once per phone per day).
- [x] Returns adjust sales, stock and refunds (returns reduce net sales on the return date; stock back; refund by method).
- [ ] Daily summary push notification on a test device — **not done**: needs FCM / Expo push credentials in EAS and a
  device (BL-607 moved to when those exist).

## Decisions (DECISIONS.md)
ADR-042 business date stored on sales · ADR-043 refund rule for returns · ADR-044 CSV built on the phone after a server
quota check · ADR-045 expense id as idempotency key, photo uploaded first · ADR-046 day close per phone.

## Known limitations (Phase 06)
- Push notifications (daily summary) not built — external credentials and a device needed.
- Profit is an estimate: lines without a cost price are left out (the coverage % is shown); returns are not subtracted
  from profit yet.
- Day close counts only this phone's cash; a shop-wide cash-up across phones is a later improvement.
- Udhaar (given/collected) shows 0 until customers arrive in Phase 08; supplier cash payments join expected cash in Phase 07.
- Camera, gallery, photo upload, CSV sharing and the rest of the app are still untested on a real device.

## External configuration still required
Unchanged: Supabase Auth email template with `{{ .Token }}` and an SMS provider (OD-02); EAS account; **new:** FCM / Expo push
credentials for notifications.

## Recommended next phase
Phase 07 — inventory, suppliers and purchases.
