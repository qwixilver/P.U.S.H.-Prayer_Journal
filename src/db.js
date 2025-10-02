// src/db.js
// IndexedDB setup using Dexie.js for offline-first data storage.
// Restores the original DB name ("PrayerJournalDB") so existing data reappears,
// keeps your original indexes, and adds the new "events" table safely.
//
// Helpers preserved: emitDbChanged(), getPrayersByStatus(status), dbReady()

import Dexie from 'dexie';

// IMPORTANT: use the original name so we re-attach to existing data
export const db = new Dexie('PrayerJournalDB');

/**
 * Schema
 * - This is additive to the last good version:
 *   * categories/requestors/prayers keep the same indexed fields you had
 *   * NEW: events table for per-prayer timeline entries
 *
 * NOTE: If the previous deployed version was "version(1)", this bump to 2 is safe.
 * Dexie will perform a non-destructive upgrade (add table; keep data).
 */
db.version(2).stores({
  categories: '++id, name, description, showSingle',
  requestors: '++id, categoryId, name, description, security',
  prayers: '++id, requestorId, name, description, requestedAt, answeredAt, status, security',
  events: '++id, prayerId, createdAt', // NEW: timeline entries
});

/**
 * Lightweight broadcast so views auto-refresh without a reload.
 * Many components already listen for this (`window.addEventListener('db:changed', ...)`).
 */
export function emitDbChanged() {
  window.dispatchEvent(new Event('db:changed'));
}

/**
 * Retrieves all prayers matching a specific status.
 * @param {('requested'|'answered')} status
 * @returns {Promise<Array>} Array of prayer objects
 */
export function getPrayersByStatus(status) {
  return db.prayers.where('status').equals(status).toArray();
}

/**
 * Small helper to satisfy `import { dbReady } from './db'` in src/index.jsx.
 * Ensures the Dexie connection is open, then returns the db.
 */
export async function dbReady() {
  try {
    await db.open();
  } catch (e) {
    // If open throws (rare), we log and still return db so callers can handle actual ops.
    console.warn('dbReady(): open() warning', e);
  }
  return db;
}
