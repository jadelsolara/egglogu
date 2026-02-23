# EGGlogU Offline Sync Strategy

## Current State

EGGlogU is an offline-first PWA. All data is stored in `localStorage` under the key `egglogu_data` as a single JSON blob. The app functions fully without a network connection.

### Current Sync Mechanism `[IMPLEMENTADO]`

When the user is authenticated via JWT (server account), a **dual-write** strategy is active:

1. Every call to `saveData()` writes to `localStorage` **and** schedules a `syncToServer()` call (debounced 3 seconds).
2. `syncToServer()` pushes the full dataset to `POST /api/v1/sync` as a bulk payload.
3. On initial load, `loadFromServer()` fetches farms, flocks, clients, and billing status from the API and merges them into the local state.
4. If the user is offline, writes queue locally and flush when `navigator.onLine` fires.

#### Current Endpoint Details

```
POST /api/v1/sync
Authorization: Bearer <JWT>
Content-Type: application/json

Request body: Full egglogu_data JSON blob (all collections)
Response: { "status": "ok", "synced_at": "<ISO-8601>" }
```

The frontend calls this via `apiService._request('/sync', { method: 'POST', body: data })` (line 1822 of `egglogu.html`). The server-side handler is in `backend/src/api/sync.py`.

### Limitations

- **No conflict resolution**: the server sync is a full push -- the last device to sync wins completely.
- **No per-record timestamps**: there is no way to know which individual record was modified more recently.
- **Single localStorage key**: the entire dataset is serialized/deserialized on every save, which becomes expensive as data grows.
- **No partial sync**: every sync pushes the complete dataset, even if only one record changed.
- **No multi-device awareness**: two devices editing simultaneously will overwrite each other.

---

## Proposed: Last-Write-Wins (LWW) with Timestamps `[NO IMPLEMENTADO AUN]`

### Overview

Add a `_updatedAt` ISO-8601 timestamp to every record. On sync, compare per-record timestamps between client and server. The newest version of each record wins.

### Data Model Changes

Every record in every collection gets two new fields:

```
_updatedAt: string  // ISO-8601 timestamp, e.g. "2024-06-15T14:32:00.000Z"
_deletedAt: string | null  // soft-delete timestamp (null = active)
```

Affected collections (all top-level arrays in `egglogu_data`):

| Collection          | Record ID Field | Notes                           |
|---------------------|-----------------|----------------------------------|
| flocks              | id              | Core entity                      |
| dailyProduction     | id              | Most frequently written           |
| vaccines            | id              |                                  |
| medications         | id              |                                  |
| outbreaks           | id              |                                  |
| feed.purchases      | id              | Nested under `feed`              |
| feed.consumption    | id              | Nested under `feed`              |
| clients             | id              |                                  |
| finances.income     | id              | Nested under `finances`          |
| finances.expenses   | id              | Nested under `finances`          |
| finances.receivables| id              | Nested under `finances`          |
| inventory           | id              |                                  |
| environment         | id              |                                  |
| checklist           | id              |                                  |
| logbook             | id              |                                  |
| personnel           | id              |                                  |
| biosecurity.visitors| id              | Nested under `biosecurity`       |
| biosecurity.zones   | id              | Nested under `biosecurity`       |
| biosecurity.pestSightings | id        | Nested under `biosecurity`       |
| biosecurity.protocols| id             | Nested under `biosecurity`       |
| traceability.batches| id              | Nested under `traceability`      |
| productionPlans     | id              |                                  |
| users               | id              | Local user accounts              |
| auditLog            | (append-only)   | No conflicts -- union merge      |
| farm                | (singleton)     | Single object, LWW on fields     |
| settings            | (singleton)     | Single object, LWW on fields     |

### Sync Protocol

#### Push (Client -> Server)

1. On `saveData()`, stamp `_updatedAt = new Date().toISOString()` on every modified record.
2. Collect only records where `_updatedAt > lastSyncTime`.
3. Send delta payload: `{ collection: string, records: Record[] }[]`.
4. Server responds with its own deltas (records modified by other devices since `lastSyncTime`).

#### Pull (Server -> Client)

1. Client sends `lastSyncTime` to `GET /api/v1/sync/delta?since=<ISO>`.
2. Server returns all records with `_updatedAt > since`.
3. Client merges: for each record, if server `_updatedAt > local _updatedAt`, overwrite local.

#### Merge Algorithm (per record)

```
function mergeRecord(local, remote) {
  if (!local) return remote;          // new from server
  if (!remote) return local;          // new from client (push)
  if (remote._deletedAt && !local._deletedAt) {
    // Remote deleted, local still active -- flag for conflict UI
    return { ...remote, _conflict: true, _localVersion: local };
  }
  if (remote._updatedAt > local._updatedAt) return remote;
  return local;  // local wins (same or newer)
}
```

### Conflict Resolution UI

For the majority of cases, LWW resolves silently. However, certain scenarios need user attention:

1. **Delete vs. Edit conflict**: Device A deletes a flock, Device B edits the same flock offline. When B syncs, it finds the flock deleted. Show a dialog:
   - "Flock 'Layer Group 3' was deleted on another device but you made changes. Keep your version or accept deletion?"
   - Options: [Keep Mine] [Accept Deletion] [View Diff]

2. **Concurrent edits to the same record**: Both devices edit the same production record. The newer timestamp wins silently, but the overwritten version is saved to `_conflictArchive[]` so it can be reviewed.

3. **Conflict badge**: Show a notification badge on the Config/Admin tab when unresolved conflicts exist. The user can review and resolve them at their convenience.

### Implementation Phases

#### Phase 1: Timestamp Infrastructure (non-breaking) `[PLANNED — not started]`
- Modify `saveData()` to stamp `_updatedAt` on every record that changed.
- Modify `genId()` or post-creation hooks to stamp `_updatedAt` on new records.
- Add migration in `loadData()` to backfill `_updatedAt` for existing records (use current timestamp).
- No server changes needed. Fully backward compatible.

#### Phase 2: Delta Sync `[PLANNED — not started]`
- New API endpoint: `POST /api/v1/sync/delta` (accepts/returns only changed records).
- Modify `syncToServer()` to send only records with `_updatedAt > lastSyncTime`.
- Modify `loadFromServer()` to request only `since=lastSyncTime`.
- Reduces payload size dramatically for active farms.

#### Phase 3: Conflict UI `[PLANNED — not started]`
- Add `_conflictArchive` array to data model.
- Build conflict resolution modal in the Config section.
- Add badge indicator for pending conflicts.

#### Phase 4: Real-time Sync (Optional) `[PLANNED — not started]`
- Use existing MQTT infrastructure (`mqttBroker` config already exists) to push change notifications.
- When Device A saves, it publishes to `egglogu/{farmId}/sync` topic.
- Device B receives notification and pulls delta.
- Falls back to poll-based sync if MQTT is unavailable.

### Storage Considerations

- Current average `egglogu_data` size: 50-500 KB for small farms, up to 5 MB for large operations.
- localStorage limit: ~5-10 MB depending on browser.
- Long-term: migrate from `localStorage` to `IndexedDB` for larger capacity (already referenced in the codebase architecture docs).
- Auto-backup via Cache API (already implemented in `egglogu.html`) provides an additional safety net.

### Security Notes

- `_updatedAt` timestamps must be validated server-side (reject future timestamps, reject timestamps older than the record's current `_updatedAt` unless the payload includes the full record).
- Sync payloads must be authenticated via JWT.
- Audit log entries are append-only and merged via union (no overwrites).
- Soft deletes (`_deletedAt`) preserve data integrity and allow undo.
