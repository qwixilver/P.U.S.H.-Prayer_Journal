// src/db.js
// IndexedDB setup using Dexie.js for offline-first data storage.
// Dexie provides a Promise-based, developer-friendly API over IndexedDB.

import Dexie from 'dexie';

// Create a new database named 'PrayerJournalDB'
export const db = new Dexie('PrayerJournalDB');

// Define version 1 schema: tables and indexes
// `++id` tells Dexie to auto-increment the primary key
// Other fields become indexes for efficient queries
db.version(1).stores({
  categories: '++id, name, description, showSingle',
  requestors: '++id, categoryId, name, description, security',
  prayers: '++id, requestorId, name, description, requestedAt, answeredAt, status, security',
});

/**
 * Adds a new category record to the database.
 * @param {{ name: string, description: string, showSingle: boolean }} cat
 * @returns {Promise<number>} Resolves to the generated category ID
 */
export function addCategory(cat) {
  return db.categories.add({
    name: cat.name,
    description: cat.description,
    showSingle: cat.showSingle,
  });
}

/**
 * Retrieves all prayers matching a specific status.
 * @param {string} status - e.g., 'requested' or 'answered'
 * @returns {Promise<Array>} Array of prayer objects
 */
export function getPrayersByStatus(status) {
  return db.prayers.where('status').equals(status).toArray();
}

// You can add more helper functions below for CRUD operations:
// export function addRequestor(requestor) { ... }
// export function getPrayersForRequestor(requestorId) { ... }
