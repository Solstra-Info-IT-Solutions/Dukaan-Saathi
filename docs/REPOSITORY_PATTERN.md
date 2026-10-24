# Repository Pattern

## 1. Responsibilities

| Piece | Responsibility | Example |
|---|---|---|
| Repository interface (domain) | Business-meaningful operations in domain types | `BillingRepository.createSale(cmd): Promise<SaleReceipt>` |
| Repository implementation (data) | Chooses data source(s), maps DTO ↔ domain, translates errors, applies cache/offline policy | `BillingRepositoryImpl` |
| Remote data source | Exactly one backend call per method; returns DTOs | `SupabaseBillingDataSource.createSale(dto)` → `supabase.rpc('create_sale', …)` |
| Local data source | SQLite reads/writes; returns local row types | `LocalBillingDataSource.insertPendingSale(row)` |
| Mapper | Pure functions DTO ↔ entity | `toSale(dto)`, `toCreateSaleRequest(cmd)` |

## 2. Rules

1. **Business names, not table names.** `searchProducts(query, page)`, not `select('products', …)`.
2. **No generic repository.** No `Repository<T>` with a table-name string. Each feature owns its interface.
3. **One repository per aggregate/feature**, not one per table and not one for the app.
   Planned interfaces: `AuthRepository`, `ShopRepository`, `MembershipRepository`, `DeviceRepository`,
   `CatalogueRepository` (products, categories, units, barcodes), `ImportRepository`, `BillingRepository`
   (sales, voids, receipts), `ReportsRepository`, `ExpenseRepository`, `InventoryRepository`,
   `PurchaseRepository` (suppliers + purchases), `CustomerRepository`, `CustomerLedgerRepository`,
   `SyncRepository`, `SubscriptionRepository` (plan, entitlements), `ConfigRepository` (client config,
   announcements, content), `NotificationRepository`, `SupportRepository`, `OnboardingRepository`.
4. **Returns domain types**, never DTOs or Supabase responses.
5. **Throws/returns `AppError`** (via `core/errors/translate`) — never raw `PostgrestError`.
6. **Pagination is explicit**: methods take `{ cursor?, limit }` and return `{ items, nextCursor }`.
   Cursor = keyset on `(sort_column, id)`; no offset pagination on large tables.
7. **Sorting is explicit and stable**: always tie-break on `id`.
8. **Shop scope from session, verified by server**: repositories take `shopId` from the session, but the
   server re-checks membership (RLS / RPC). Repositories never accept a `userId` to act as.
9. **No UI logic** (no toasts, no navigation, no i18n strings).
10. **Select only needed columns** (`select('id,name,price_paise,…')`), never `select('*')` in production code.

## 3. Interface example

```ts
// features/billing/domain/repositories/BillingRepository.ts
export interface BillingRepository {
  createSale(command: CreateSaleCommand): Promise<SaleReceipt>;          // idempotent via command.clientOperationId
  voidSale(command: VoidSaleCommand): Promise<SaleReceipt>;
  getSale(shopId: ShopId, saleId: SaleId): Promise<SaleDetail>;
  listSales(shopId: ShopId, filter: SalesFilter, page: PageRequest): Promise<Page<SaleSummary>>;
}
```

## 4. Implementation example

```ts
// features/billing/data/repositories/BillingRepositoryImpl.ts
export class BillingRepositoryImpl implements BillingRepository {
  constructor(private readonly remote: SupabaseBillingDataSource) {}

  async createSale(command: CreateSaleCommand): Promise<SaleReceipt> {
    const request = toCreateSaleRequest(command);              // mapper → contracts.CreateSaleInput
    try {
      const dto = await this.remote.createSale(request);
      return toSaleReceipt(dto);
    } catch (e) {
      throw translateError(e);                                 // core/errors → AppError
    }
  }
}
```

```ts
// features/billing/data/datasources/remote/SupabaseBillingDataSource.ts
export class SupabaseBillingDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}
  async createSale(input: CreateSaleInput): Promise<CreateSaleOutput> {
    const { data, error } = await this.client.rpc('create_sale', { p_input: input });
    if (error) throw error;
    return CreateSaleOutputSchema.parse(data);                 // validate server response shape
  }
}
```

## 5. Online/offline policy (Phase 09)

The repository decides, not the ViewModel:

| Operation | Online | Offline |
|---|---|---|
| `createSale` | Phases 04–08: call RPC directly. From Phase 09: write to SQLite + outbox first, push immediately, show `completed` if the push returns in time (OFFLINE_SYNC_DESIGN.md §3) | write to SQLite + outbox, return `queued` receipt |
| `searchProducts` | local SQLite cache (fast), background refresh from server | local cache |
| `listSales` | server (paginated); local pending sales merged on top | local only, flagged "partial" |
| `voidSale` | RPC | not allowed (explain); queue in a later phase if pilots need it |

A sync service (`features/offline-sync`) owns the outbox processing; repositories only enqueue.

## 6. Error translation

`core/errors/translate.ts` maps, in order:
1. `DS_*` code in `error.message` (raised by our SQL/Edge functions) → `AppError(code)`.
2. Postgres SQLSTATE: `42501` (RLS/permission) → `DS_PERMISSION_DENIED`; `23505` (unique) → `DS_CONFLICT`
   unless a more specific code applies; `23514` (check) → `DS_VALIDATION_FAILED`; `PGRST116` (no rows) → `DS_NOT_FOUND`.
3. Network/timeouts (`TypeError: Network request failed`, `AbortError`) → `NETWORK_OFFLINE` / `NETWORK_TIMEOUT` (retryable).
4. JWT expired → refresh once then `DS_AUTH_REQUIRED`.
5. Anything else → `UNKNOWN` (logged to Sentry with scrubbed payload).

## 7. Testing

- Mapper tests with recorded DTO fixtures from `supabase/tests/fixtures` (shared with DB tests).
- Repository tests with a fake data source: success, each mapped error, pagination cursor, offline enqueue.
- Data source integration tests against local Supabase (seeded) in CI.
