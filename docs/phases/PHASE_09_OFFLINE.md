# Phase 09 — Local Persistence and Offline Synchronization

Status: **Complete — awaiting approval** · Date: 2026-10-26 · Spec: [../features/offline-sync.md](../features/offline-sync.md), [../OFFLINE_SYNC_DESIGN.md](../OFFLINE_SYNC_DESIGN.md)

## Features implemented (end-to-end)

### 1. Bills without a connection
Bill → Pay → Confirm → `CreateSale` decides (ADR-055):
- **online, nothing waiting** → `create_sale` as before (errors such as a changed price are shown at the counter);
- **offline**, **no answer from the server** (timeout / network error), or **earlier bills still waiting** → the bill
  is saved on the phone: the next number of this phone's invoice series, a client-chosen sale id, and an outbox entry
  with the same operation id, in **one SQLite transaction** (`SqliteSyncStore.queueSale`). The receipt is built on the
  phone (`offlineReceipt`: same lines, totals and invoice number the server will store) and shows "Saved on this
  phone. It will be sent when the internet is back." Bills queue behind waiting ones so invoice numbers reach the
  server in order.
- Product search, barcode scan, shop settings and the catalogue reference fall back to the phone's copy; udhaar works
  with customers from the phone's copy, and a **new customer** can be added offline (queued `create_customer`).
- **Udhaar payments** are queued the same way ("Saved on this phone; the balance updates after sync").

### 2. Sync
`SyncService` (started by the shop layout) runs on start, when the phone comes back online, when the app returns to
the foreground, after every queued write, and every minute while something is waiting. One run at a time:
1. `PushOutbox` → `sync_push` with up to 50 operations in queue order. Per operation: **applied** / **replayed**
   (already on the server) → done, local receipt removed, review flags kept; **needs_review** → done and listed for
   the owner; **quarantined** → kept on the phone, listed for the owner with the reason; **retry** or no connection →
   rescheduled with backoff 5 s, 15 s, 1 min, 5 min, then every 15 min (jittered). Nothing is ever dropped. A bill or
   payment for a customer whose creation was quarantined is held as **blocked**.
2. `PullChanges` → `sync_pull` until every list is complete: products (with barcodes and aliases), categories,
   customers, customer aliases, settings, keyset cursors stored per shop.

Only the signed-in user's entries are sent; another user's unsent work on the same phone waits for them (ADR-057).

### 3. Server rules for offline bills (`create_sale` with `origin: 'offline_sync'`)
The bill already happened at the counter, so policy breaches are **saved and flagged** (`status = needs_review`,
`review_reasons`) instead of refused: invoice number gap, price different from every price the item ever had
(an older price from the phone's copy is fine), archived item, stock below zero with policy "block", over the credit
limit with policy "block", discount above the limit, price changed without permission, payment method switched off,
phone clock more than 30 days off (the bill then counts for today). Wrong totals, unknown items or customers, and
permission problems are **quarantined** (not saved). The phone's sale id is kept, and the request identity ignores
the origin, so a bill tried online whose answer was lost and then sent from the queue is the same bill.

### 4. Customers added on two phones
The same phone number added as a new customer on two phones while offline: the second `create_customer` returns the
existing customer, and the second id becomes an **alias** (`private.customer_id_aliases`). Queued udhaar bills and
payments that use the alias reach the right customer without rewriting the queue; the next pull tells the phone,
which drops its local copy (ADR-056).

### 5. Status for the owner
- Header chip on every shop screen: `Synced` · `Offline` · `Offline · 7 waiting` · `Syncing…` · `Attention: 1`.
- More → **Sync status**: what is waiting (with why, e.g. "will try again shortly"), what needs attention (not saved
  on the server + reason, with **Try again**; saved but flagged + reasons), **Sync now**, last sync time. Tapping a
  bill opens its receipt.
- Sales history → **Needs review** filter; receipts of flagged bills show the reasons; receipts of bills still on the
  phone show a banner and cannot be voided or returned until the server has them.

### 6. App start and sign-out without a connection
- `RestoreSession` saves the last good session; with no connection the app opens the last shop from it (marked
  offline), so offline billing survives closing and reopening the app.
- Signing out with unsent bills or payments asks first ("2 bills or payments on this phone are not sent yet…"); they
  stay on the phone, tagged with the user, and are sent when that user signs in again.

## Mobile
- **core/database:** `SqlDatabase` (sync interface), `MIGRATIONS` + `migrate` (`PRAGMA user_version`),
  `openAppDatabase` (expo-sqlite, WAL, foreign keys). Tables: `meta`, `outbox`, `local_sales`, `products_cache`,
  `customers_cache`, `customer_aliases`.
- **New feature `sync`:** domain `OutboxStore`, `SyncRemote`, `PushOutbox`, `PullChanges`, `GetSyncQueue`,
  `RetryOperation`, `backoffMs`; data `SqliteSyncStore`, `SupabaseSyncDataSource`, `SyncService`; presentation
  `useSyncStore`, `SyncChip`, `SyncStatusScreen` / `useSyncStatusViewModel`.
- **Billing:** `OfflineSales` port, `offlineReceipt`, `draftBill`, `CreateSale` queue path, local-first `GetSale`,
  sale id per attempt, review banner, "Needs review" filter. **Customers:** `OfflineRepayments` port.
  **Shops:** `SessionSnapshotStore`. **Account:** unsent-work check before sign-out.
- **Composition root:** one SQLite store; offline adapters for products, customers, settings, catalogue reference,
  bills, repayments; `SyncService` publishes to `useSyncStore`.
- **Navigation:** hidden route `sync`; More → Sync status (everyone). **Strings:** en + hi, 618 keys each.
- **Dependency:** `expo-sqlite` ~58.0.14 (via `npx expo install`; config plugin added). The calls used were checked
  against the installed SDK 58 type definitions.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261026074853_p09_offline_sync` | `private.customer_id_aliases`, `resolve_customer_id`; `create_sale` with offline rules, client sale id, origin-free idempotency key; `save_customer` replay-safe for cashiers; `record_customer_repayment` via aliases; RPCs `sync_push`, `sync_pull` |

**Security:** both RPCs are SECURITY DEFINER with `search_path = ''`, executable by signed-in users only (checked on
the hosted project). `sync_push` checks nothing itself beyond sign-in; each operation runs the normal RPC, so
membership, permissions, device and shop checks apply per operation (a deactivated member's bills come back
quarantined). `sync_pull` needs membership, an active device of that shop, and `customer.view` for customers;
item cost is never included.

## Tests executed (2026-10-26)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **177 / 177** (15 suites; new sync 12) |
| admin (Vitest) | **11 / 11** |
| @ds/contracts | **30 / 30** |
| @ds/domain-core | **77 / 77** |
| DB pre-check (PGlite) | **337 / 337** assertions (new `016_offline_sync` 32) |
| DB pgTAP + storage + concurrency on real Supabase (CI) | ✅ passed on `9fc3cc3` ([run 40291729698](https://github.com/Solstra-Info-IT-Solutions/Dukaan-Saathi/actions/runs/40291729698)), including the Android Metro export with expo-sqlite |

**Database (`016`):** a queued bill is applied, keeps the phone's sale id and is marked offline; the same batch again
replays; bill 3 before bill 2 is saved and flagged, bill 2 arriving later is accepted, a used number is quarantined;
an older catalogue price is accepted, an invented one flagged; negative stock, an archived item and a clock 40 days
off are saved and flagged (business date = today); a bill with wrong totals is quarantined while the bills around it
are saved; another shop's operation is refused; a cashier's quick add is applied and is harmless to repeat; the same
phone on a second phone merges into the existing customer and queued udhaar + repayment reach it (balance =
ledger, no duplicate); over the credit limit offline is flagged; the queued copy of an online bill replays it; a
deactivated cashier's bills are quarantined without failing the batch; the owner sees the six flagged bills;
first pull includes archived items, all items and the alias; the next pull returns only changes; a full page says
there is more; another shop's owner cannot pull.

**App (`sync.test.tsx`, real SQL on Node's SQLite):** 55 bills queued, the store reopened ("app killed"), sent in
two batches (50 + 5) in creation order, exactly once, local receipts removed; no connection → rescheduled after 5 s,
then sent; backoff schedule; applied / flagged / quarantined / retry recorded, an udhaar bill for a quarantined new
customer held as blocked and never sent, "Try again" requeues; another user's entries never sent; pull caches items
(archived dropped, alias search, barcode) and customers, phone-number search, alias resolution, cursors; offline
bill gets number 8, receipt from the phone, payload with sale id and origin; bill 9 queues behind it although online;
no server answer → queued with the same operation id and the same payload; offline repayment queued; app start
offline opens the last shop; chip states; status screen lists waiting and refused items and retries; sign-out with
2 unsent items asks first.

Static checks: format ✅, typecheck ✅, lint ✅ (0 warnings), SQL fixtures current ✅.

## Acceptance criteria
- [~] Offline billing survives app kill; syncs exactly once — proven with the store reopened on the same database and
  an idempotent server (tests); not yet tried on a device (Maestro J-05 needs one).
- [x] Two offline devices sync without invoice collisions — each phone has its own series; offline numbers are
  accepted out of order, gaps flagged, a reused number quarantined (tests).
- [x] Quarantine and needs_review visible to owner — Sync status, sales "Needs review" filter, receipt banners.
- [x] Sign-out protects unsynced data — confirmation; work stays on the phone for that user.

## Decisions (DECISIONS.md)
ADR-055 online first, queue on no answer, same operation and sale id; origin not part of the request identity ·
ADR-056 customer merge by phone with aliases · ADR-057 outbox per user; sign-out confirmation · ADR-058 SQLite behind a
sync interface, real SQL in tests · ADR-059 offline policy breaches saved and flagged; wrong totals quarantined;
bills queue behind waiting ones.

## Known limitations (Phase 09)
- **Not offline yet:** expenses (photo upload), voids and returns, purchases, stock changes, item and customer edits
  (as designed for v1, plus expenses deferred). Bills on the phone cannot be voided or returned until synced.
- The sales history lists only bills on the server; bills still on the phone are listed in Sync status.
- The phone's copies are refreshed by sync; stock numbers and customer balances in them are as of the last pull.
- `sync_pull` pages by `updated_at` (transaction time): a change committed by a transaction that started before an
  earlier pull could be missed until that row changes again. A "refresh everything" action is backlog (BL-909).
- First sign-in still needs a connection; permissions offline are those of the last online session.
- The SQLite file is not encrypted (decision in Phase 13, BL-1304).
- Not yet run on a device or emulator; Maestro J-05 (airplane-mode billing) pending a device.

## External configuration still required
Unchanged: Supabase Auth email template with `{{ .Token }}` and an SMS provider (OD-02); EAS account / development
build (expo-sqlite is native; Expo Go includes it); push credentials; pilot printer models (OD-08).

## Recommended next phase
Phase 10 — voice billing.
