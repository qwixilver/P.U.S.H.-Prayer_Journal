// src/db.js
// Dexie (IndexedDB) setup for the Prayer Journal.
// This file is defensive:
//  - Supports BOTH historical DB names and picks the one that actually has data.
//  - Adds the 'events' table (timeline) without breaking existing data.
//  - Restores getPrayersByStatus(...) and emitDbChanged().
//  - Exposes window.DEBUG_DB() for quick counts in the console.

import Dexie from 'dexie';

// ---- Schema definition (shared for both DB names) ----
const stores = {
  categories: '++id, name, showSingle',
  requestors: '++id, categoryId, name',
  prayers: '++id, requestorId, requestedAt, status, security',
  events: '++id, prayerId, createdAt', // new table; safe additive
};

// Create a Dexie instance with version & stores
function makeDb(name) {
  const d = new Dexie(name);

  // If you previously used version(1/2/3), it’s safe to jump to a higher version here.
  // Dexie will upgrade in place (additive schema). If your project already uses a higher
  // version than 5, you can bump this number further without harm.
  d.version(5).stores(stores);

  return d;
}

// Historically used names (first is the original, second is the newer one that caused the empty view)
const CANDIDATE_DB_NAMES = ['prayer_journal', 'prayer_journal_db'];

// We will open BOTH, sample table counts, and pick the one that actually has data.
// If both are empty (fresh user), we default to the FIRST name to keep continuity.
async function pickActiveDb() {
  // Build instances
  const [dbA, dbB] = CANDIDATE_DB_NAMES.map(makeDb);

  // Try opening both. If one fails, we treat it as empty.
  async function openAndCount(db) {
    try {
      await db.open();
      const [cats, reqs, prs, evs] = await Promise.all([
        db.categories.count(),
        db.requestors.count(),
        db.prayers.count(),
        db.events.count().catch(() => 0),
      ]);
      return { db, ok: true, cats, reqs, prs, evs, total: cats + reqs + prs + evs };
    } catch (e) {
      // Treat as empty if we can’t open
      console.warn('DB open failed for', db.name, e);
      return { db, ok: false, cats: 0, reqs: 0, prs: 0, evs: 0, total: 0 };
    }
  }

  const a = await openAndCount(dbA);
  const b = await openAndCount(dbB);

  // Pick the one with more content; tie-breaker = first (historical) name
  let winner = a;
  if (b.total > a.total) winner = b;

  // Close the loser to avoid extra connections
  const loser = winner.db === a.db ? b.db : a.db;
  try { loser.close(); } catch {}

  // Expose a quick console helper for you
  window.DEBUG_DB = async () => {
    const [cats, reqs, prs, evs] = await Promise.all([
      winner.db.categories.count(),
      winner.db.requestors.count(),
      winner.db.prayers.count(),
      winner.db.events.count().catch(() => 0),
    ]);
    // eslint-disable-next-line no-console
    console.log(`[${winner.db.name}] categories=${cats}, requestors=${reqs}, prayers=${prs}, events=${evs}`);
    return { name: winner.db.name, cats, reqs, prs, evs };
  };

  // eslint-disable-next-line no-console
  console.log(`Using IndexedDB: "${winner.db.name}" with total records: ${winner.total}`);

  return winner.db;
}

// We export a promise-backed db accessor so callers can import { db } and use it normally.
// Dexie ops will queue until open() resolves.
export const dbPromise = pickActiveDb();

// Small proxy so existing imports `import { db } from '../db'` keep working.
// Dexie instances are thenable; we resolve it here once and reuse.
let _dbInstance = null;
export const db = new Proxy(
  {},
  {
    get(_t, prop) {
      if (_dbInstance) return _dbInstance[prop];
      throw new Error(
        'db not ready yet. Await dbReady() before first use, or call methods inside an effect.'
      );
    },
  }
);

// Call this once at app start to bind the resolved Dexie instance to `db`
export async function dbReady() {
  if (_dbInstance) return _dbInstance;
  _dbInstance = await dbPromise;
  return _dbInstance;
}

// Emit a lightweight "data changed" signal so views can refresh themselves
export function emitDbChanged() {
  window.dispatchEvent(new Event('db:changed'));
}

// Helper preserved from your previous file
/**
 * Retrieves all prayers matching a specific status.
 * @param {'requested'|'answered'} status
 * @returns {Promise<Array>} Array of prayer objects
 */
export async function getPrayersByStatus(status) {
  const d = await dbReady();
  return d.prayers.where('status').equals(status).toArray();
}
