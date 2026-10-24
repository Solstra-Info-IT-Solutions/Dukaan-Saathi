# Feature: Customers, Udhaar, Repayments, Ledger

Status: Planned · Phase: 08 · Requirements: FR-14, FR-15

## Purpose
Replace the udhaar notebook with a ledger that is always correct, explainable entry by entry, and easy to collect on.

## Screens and ViewModels
| Screen | ViewModel | State |
|---|---|---|
| UdhaarListScreen | useUdhaarListViewModel | sort (highest, oldest), search, total outstanding |
| CustomerLedgerScreen | useCustomerLedgerViewModel | entries with running balance, actions |
| CustomerFormScreen / QuickAddCustomerSheet (from billing) | useCustomerFormViewModel | |
| RepaymentSheet | useRepaymentViewModel | `editing → submitting → recorded → error` |
| BalanceAdjustmentSheet (owner) | useBalanceAdjustmentViewModel | reason required, confirm |

## Use cases
`SearchCustomers`, `CreateCustomer` (with optional opening balance), `UpdateCustomer`, `ListUdhaar`, `GetCustomerLedger`,
`RecordRepayment`, `AdjustBalance`, `BuildReminderMessage` (pure: localized text with amount and shop UPI link),
`SendReminder` (opens WhatsApp deep link — user sends it).

## Repositories / data sources
- `CustomerRepository` → `rpc create_customer`, `from('customers')` select/update (non-balance columns), search RPC.
- `CustomerLedgerRepository` → `rpc get_customer_ledger`, `rpc list_udhaar`, `rpc record_customer_repayment`, `rpc adjust_customer_balance`.

## Rules
- Balance = Σ ledger amounts; `customers.balance_paise` updated in the same transaction as the entry.
- Entries are insert-only. Corrections are `adjustment` entries with reason (owner) or produced by voids/returns.
- Overpayment allowed → negative balance = advance; shown as "Advance ₹X".
- Credit limit policy from settings (`none`/`warn`/`block`) applied at billing.
- Customer cannot be archived with non-zero balance.
- Phone unique per shop (merge rule for offline duplicates in OFFLINE_SYNC_DESIGN.md §6).

## Authorization
View: `customer.view`. Repayment: `udhaar.collect`. Adjustment: `udhaar.adjust` (owner only). Customer phone numbers are visible to all members, including cashiers, because cashiers send WhatsApp receipts. This is a documented privacy trade-off; revisit if pilots object.

## Tests
Ledger fixture: opening → credit sale → partial repayment → void of credit sale → adjustment → balance at each step;
concurrency: two repayments at once; RLS; cashier denied adjustment; reminder message builder (en/hi).

## Acceptance criteria
- [ ] Credit sale increases balance; repayment decreases; void reverses — all visible as separate entries.
- [ ] Rebuilt balance equals cached balance for all fixture customers.
- [ ] Reminder opens WhatsApp with prefilled localized text; nothing sent automatically.

## Limitations
No interest/late fees. No automated SMS/WhatsApp reminders (no Business API in v1).
