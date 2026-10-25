# Feature: Dashboard, Reports, Expenses, Day Close

Status: Implemented (Phase 06, see [../phases/PHASE_06_REPORTS_EXPENSES.md](../phases/PHASE_06_REPORTS_EXPENSES.md); push summary pending credentials) · Phase: 06 · Requirements: FR-09, FR-10, FR-11

## Purpose
Answer "how much did I sell and earn today / this month, and where did the cash go?" with numbers that reconcile.

## Screens and ViewModels
| Screen | ViewModel | State |
|---|---|---|
| DashboardScreen | useDashboardViewModel | business date picker; cards; `loading/loaded/error/offline(stale)` |
| ReportsScreen | useReportsViewModel | range presets (today, 7 d, month, custom), group-by, entitlement-gated sections |
| ExpensesScreen / ExpenseFormScreen | useExpensesViewModel / useExpenseFormViewModel | list by date; form with category, amount, method, photo |
| DayCloseScreen | useDayCloseViewModel | expected cash breakdown → counted cash → difference → `closing/closed` |

## Use cases
`GetDashboardSnapshot`, `GetSalesReport`, `ExportReport`, `RecordExpense`, `ListExpenses`, `VoidExpense` (owner, reason),
`ComputeExpectedCash` (pure, from snapshot), `CloseDay`.

## Repositories / data sources
- `ReportsRepository` → `rpc get_dashboard_snapshot`, `rpc get_sales_report`, `functions.invoke('export-report')`.
- `ExpenseRepository` → `rpc record_expense`, `from('expenses')` select, `storage expense-attachments`.
- `DayCloseRepository` (inside reports feature) → `rpc close_day`.

## Definitions (so numbers reconcile)
| Metric | Definition |
|---|---|
| Sales | Σ `total_paise` of sales with status ≠ voided, by `business_date` |
| Bills | count of those sales |
| Cash sales | Σ `sale_payments.amount` method=cash of non-voided sales |
| Udhaar given | Σ `udhaar_paise` of non-voided sales |
| Udhaar collected | Σ −`amount` of `customer_ledger_entries` type=repayment |
| Expenses | Σ non-voided `expenses.amount` |
| Gross profit (estimate) | Σ (line_amount − cost_price × qty) for lines with known cost; coverage % shown |
| Expected cash | opening cash + cash sales + cash repayments − cash expenses − cash supplier payments − cash refunds |

Reports aggregate in SQL (no N+1); indexed by `(shop_id, business_date)`. Daily rollup table is a Phase 13 optimisation if needed.

## Authorization / entitlements
`report.view_sales` (owner, manager); cashier sees own today total only. Profit needs `report.view_profit`.
> 7-day ranges and product/category/staff breakdowns need `reports.advanced`. Export needs `reports.export` + quota.

## Tests
Report fixtures: a seeded day with sales, voids, returns, udhaar, repayments, expenses → exact expected numbers in pgTAP;
same fixture drives ViewModel tests via fake repository. Export file content snapshot.

## Acceptance criteria
- [ ] Dashboard numbers equal manual sum of the seeded fixture day.
- [ ] Voided bills excluded everywhere; returns reduce sales on return date.
- [ ] Day close stores expected vs counted cash and difference; one per device per date.
- [ ] Advanced reports blocked server-side on plans without `reports.advanced`.

## Limitations
Profit is an estimate (cost prices often missing). No GST return reports (GSTR) in v1.
