# Feature: Offline Sync (feature view)

Status: Implemented (Phase 09, see [../phases/PHASE_09_OFFLINE.md](../phases/PHASE_09_OFFLINE.md)) · Phase: 09 · Requirements: FR-18. Design: [../OFFLINE_SYNC_DESIGN.md](../OFFLINE_SYNC_DESIGN.md)

## Components
| Piece | Location |
|---|---|
| SQLite setup + migrations | `core/database` |
| Local data sources | `features/{billing,customers,udhaar,expenses,products}/data/datasources/local` |
| `SyncRepository` (push/pull) | `features/offline-sync/data` → `rpc sync_push`, `rpc sync_pull` |
| `SyncService` (outbox processor, scheduler, backoff) | `features/offline-sync/domain` (pure logic) + `features/offline-sync/data` (runner) |
| SyncStatusScreen / useSyncStatusViewModel | `features/offline-sync/presentation` |
| Header sync chip | `shared/components/SyncChip` reading `syncStore` |

ViewModels never contain sync algorithms; they read `syncStore` and call `SyncService.retryNow()`.

## Acceptance criteria
- [~] 50 bills created in airplane mode survive an app kill and sync exactly once when online (tests; device run pending).
- [x] Two devices offline create bills; both sync with distinct invoice series and no collisions.
- [x] A deactivated cashier's offline bills are quarantined and visible to the owner, not lost.
- [x] Sync status always shows an accurate pending count.
