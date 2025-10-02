// src/db.js
// Central Dexie (IndexedDB) setup for the Prayer Journal.
// - Preserves existing tables (categories, requestors, prayers)
// - Adds `events` table for per-prayer timelines
// - Restores helper: getPrayersByStatus(status)
// - Emits `db:changed` events for UI auto-refresh

import Dexie from 'dexie';

export const db = new Dexie('prayer_journal_db');

/**
 * IMPORTANT: Versioning
 * - Bump this version number above whatever you used previously so Dexie upgrades in place.
 * - This definition is additive/non-destructive (no table removals or key changes).
 * - If your project already has a higher version than 4, increase the number here accordingly.
 */
db.version(4).stores({
  // Category of requestors; showSingle determines eligibility for "Single" view
  // Indexed by 'name' for quick lookups; 'showSingle' is stored as 0/1 or boolean
  categories: '++id, name, showSingle',

  // People who made requests, each tied to a category
  requestors: '++id, categoryId, name',

  // Prayers tied to a requestor
  // Indexes: requestorId (join), requestedAt (sort), status (filter), security (filter)
  prayers: '++id, requestorId, requestedAt, status, security',

  // NEW: timeline events for a prayer
  // Indexes: prayerId (filter), createdAt (sort)
  events: '++id, prayerId, createdAt',
});

/**
 * Broadcast a lightweight "db changed" signal so views can reload themselves
 * without manual wiring. We already listen for this in multiple components.
 */
export function emitDbChanged() {
  window.dispatchEvent(new Event('db:changed'));
}

/**
 * Retrieves all prayers matching a specific status.
 * @param {'requested'|'answered'} status
 * @returns {Promise<Array>} Array of prayer objects with that status
 *
 * NOTE: We index 'status' in the schema above so this is efficient.
 */
export function getPrayersByStatus(status) {
  return db.prayers.where('status').equals(status).toArray();
}
