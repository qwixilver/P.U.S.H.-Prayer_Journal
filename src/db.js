// src/db.js
// Dexie (IndexedDB) database setup for the Prayer Journal.
// This file now includes a new `events` table used to record dated notes on a prayer.
//
// IMPORTANT: Versioning
// - We bump the Dexie version to add the `events` table without breaking existing data.
// - If you already had versions (e.g., version(1) ... version(2) ...), keep them and
//   append a new .version(N).stores({...}) with only the new table OR an expanded schema.
// - Below is a consolidated, safe version that defines all current tables and indices.

import Dexie from 'dexie';

export const db = new Dexie('prayer_journal_db');

// Bump version number compared to your previous value.
// If your current code already had version(1), version(2), etc.
// set this to `version(3)` or the next integer. If you’re unsure,
// using a higher integer is safe; Dexie will handle the upgrade.
db.version(3).stores({
  // Categories: include showSingle (1/0) flag
  categories: '++id, name',

  // Requestors: each tied to a category via categoryId
  requestors: '++id, categoryId, name',

  // Prayers: each tied to a requestor via requestorId
  // Index on requestorId and requestedAt for sorting/filtering
  prayers: '++id, requestorId, requestedAt, status, security',

  // NEW: Events (timeline entries) for a prayer
  // - `prayerId` lets us query all events for one prayer
  // - `createdAt` (ISO string) lets us sort chronologically
  events: '++id, prayerId, createdAt',
});

// Optional: lightweight helper to broadcast "db:changed" to refresh UI everywhere
export function emitDbChanged() {
  window.dispatchEvent(new Event('db:changed'));
}
