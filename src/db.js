// src/db.js
// IndexedDB setup using Dexie.js for offline-first data storage.
// DB name intentionally remains "PrayerJournalDB" (so existing data persists).
// This file adds a new "journalEntries" table in a safe, additive schema bump.

import Dexie from 'dexie';

// Keep the original, known-good DB name so user data remains visible.
export const db = new Dexie('PrayerJournalDB');

/**
 * Schema
 * - Existing tables (categories, requestors, prayers) unchanged.
 * - "events" table retained (per-prayer timeline).
 * - NEW: "journalEntries" for personal journaling (freeform notes).
 *
 * Bump the version number by one compared to your current file.
 * If your repo currently has version(2), use version(3). If it already uses 3, use 4, etc.
 */
db.version(3).stores({
  categories: '++id, name, description, showSingle',
  requestors: '++id, categoryId, name, description, security',
  prayers: '++id, requestorId, name, description, requestedAt, answeredAt, status, security',
  events: '++id, prayerId, createdAt', // timeline entries for prayers

  // NEW: freeform personal journal
  // Index createdAt for sorting; include title for future quick lookups.
  journalEntries: '++id, title, createdAt, updatedAt',
});

/**
 * Broadcast so views can refresh without a full reload.
 * Many components listen for this: window.addEventListener('db:changed', ...)
 */
export function emitDbChanged() {
  window.dispatchEvent(new Event('db:changed'));
}

/**
 * Existing helper used by lists.
 */
export function getPrayersByStatus(status) {
  return db.prayers.where('status').equals(status).toArray();
}

/**
 * Keep this for src/index.jsx which may import it.
 * Ensures Dexie is open; returns the db instance.
 */
export async function dbReady() {
  try {
    await db.open();
  } catch (e) {
    console.warn('dbReady(): open() warning', e);
  }
  return db;
}
