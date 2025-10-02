// src/db.js
// Dexie (IndexedDB) setup for the Prayer Journal.
// - Simple, synchronous export of the Dexie instance (no proxy, no async gating)
// - Stable DB name to prevent surprises across builds
// - Includes the 'events' table (timeline)
// - Restores helper: getPrayersByStatus(status)
// - Emits 'db:changed' for UI auto-refresh

import Dexie from 'dexie';

// Use ONE consistent name so we never point at an unexpected empty DB.
// If you previously experimented with another name, that DB remains on disk,
// but we standardize here so the app is predictable.
export const DB_NAME = 'prayer_journal';

export const db = new Dexie(DB_NAME);

// Bump version as needed if you've used lower numbers previously.
// This schema is additive/non-destructive.
db.version(5).stores({
  categories: '++id, name, showSingle',
  requestors: '++id, categoryId, name',
  prayers: '++id, requestorId, requestedAt, status, security',
  events: '++id, prayerId, createdAt', // timeline entries for a prayer
});

// Broadcast a lightweight "data changed" signal so views can refresh themselves
export function emitDbChanged() {
  window.dispatchEvent(new Event('db:changed'));
}

/**
 * Retrieves all prayers matching a specific status.
 * @param {'requested'|'answered'} status
 * @returns {Promise<Array>} Array of prayer objects
 *
 * NOTE: We index 'status' in the schema above so this is efficient.
 */
export function getPrayersByStatus(status) {
  return db.prayers.where('status').equals(status).toArray();
}
