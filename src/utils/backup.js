// src/utils/backup.js
// Robust Import/Export helpers for the Prayer Journal (Dexie) DB.
//
// AppSheet CSV support (using Keys):
//  - Categories:  Key, Name, Description, Show_Single
//  - Requestors:  Key, Requestor Category (-> Category.Key), Name, Description, Security
//  - Prayers:     Key, Requestor (-> Requestor.Key), Name, Description, Requested Date Stamp, Answered Date Stamp, Status, Security
//
// Features:
// - Accept ANY subset of CSVs (1–3 files). Works best when all three are provided.
// - Uses AppSheet Keys if present; otherwise falls back to lenient name-based mapping.
// - Skips blank-ish rows; normalizes booleans, status; converts Excel serials & common date strings.
// - Returns import counts + skipped diagnostics; broadcasts 'db:changed' for auto-refresh UI.

import { db } from '../db';
import Papa from 'papaparse';

const schemaVersion = 1;
const nowIso = () => new Date().toISOString();

// ---------------- helpers ----------------

function normalizeBool(v) {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

function normalizeStatus(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'answered' ? 'answered' : 'requested';
}

function isFiniteNumber(n) {
  return typeof n === 'number' && isFinite(n);
}

// Excel serial -> ISO
function excelSerialToISO(serial) {
  if (!isFiniteNumber(serial)) return null;
  const epoch = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30
  const ms = serial * 86400000;
  const d = new Date(epoch.getTime() + ms);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Accepts ISO-like strings, US dates, Excel serials, etc.
function toIsoOrNull(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return excelSerialToISO(v);
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToISO(Number(s));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Case-insensitive key resolver for CSV rows
function headerMap(row) {
  const map = {};
  for (const k of Object.keys(row)) map[k.trim().toLowerCase()] = k;
  return (...aliases) => {
    for (const a of aliases) {
      const hit = map[a.trim().toLowerCase()];
      if (hit != null) return hit;
    }
    return undefined;
  };
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      dynamicTyping: true, // read numerics as numbers (Excel serials)
      complete: (res) => resolve(res.data),
      error: reject,
    });
  });
}

// Name-based helpers (fallbacks when Keys not present)
async function findCategoryByName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  return db.categories.filter((c) => (c.name || '').trim() === n).first();
}
async function findRequestorByNameAndCategory(reqName, categoryId) {
  const n = String(reqName || '').trim();
  if (!n || !categoryId) return null;
  return db.requestors
    .filter((r) => (r.name || '').trim() === n && r.categoryId === categoryId)
    .first();
}

// ---------------- EXPORT ----------------

export async function exportAllAsJson() {
  const [categories, requestors, prayers] = await Promise.all([
    db.categories.toArray(),
    db.requestors.toArray(),
    db.prayers.toArray(),
  ]);
  return {
    meta: {
      type: 'prayer-journal-backup',
      version: schemaVersion,
      exportedAt: nowIso(),
    },
    data: { categories, requestors, prayers },
  };
}

export function downloadJson(data, filename = 'prayer-journal-backup.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------- IMPORT (JSON) ----------------

export async function importFromJsonBackup(json, mode = 'merge') {
  if (!json || !json.meta || json.meta.type !== 'prayer-journal-backup') {
    throw new Error('Invalid backup file.');
  }
  const { categories = [], requestors = [], prayers = [] } = json.data || {};

  // Drop rows without a meaningful name
  const cleanCats = categories.filter((c) => String(c?.name || '').trim() !== '');
  const cleanReqs = requestors.filter((r) => String(r?.name || '').trim() !== '');
  const cleanPrs = prayers.filter((p) => String(p?.name || '').trim() !== '');

  let addedCats = 0, updatedCats = 0, addedReqs = 0, updatedReqs = 0, addedPrs = 0, updatedPrs = 0;
  const skipped = { categories: [], requestors: [], prayers: [] };

  await db.transaction('rw', db.categories, db.requestors, db.prayers, async () => {
    if (mode === 'replace') {
      await Promise.all([db.prayers.clear(), db.requestors.clear(), db.categories.clear()]);
    }

    const catIdMap = new Map(); // name -> id
    // Categories (name-based JSON)
    for (const c of cleanCats) {
      const name = String(c.name || '').trim();
      if (!name) { skipped.categories.push({ reason: 'no-name', row: c }); continue; }

      const existing = await findCategoryByName(name);
      if (existing && mode === 'merge') {
        await db.categories.update(existing.id, {
          description: c.description || '',
          showSingle: normalizeBool(c.showSingle) ? 1 : 0,
        });
        catIdMap.set(name, existing.id);
        updatedCats++;
      } else {
        const id = await db.categories.add({
          name,
          description: c.description || '',
          showSingle: normalizeBool(c.showSingle) ? 1 : 0,
        });
        catIdMap.set(name, id);
        addedCats++;
      }
    }

    // Requestors (name+category-based JSON)
    const reqIdMap = new Map(); // `${categoryName}::${reqName}` -> id
    for (const r of cleanReqs) {
      const reqName = String(r.name || '').trim();
      const categoryName = String(r.categoryName || r.category || r.requestorCategory || '').trim();
      if (!reqName) { skipped.requestors.push({ reason: 'no-name', row: r }); continue; }
      if (!categoryName) { skipped.requestors.push({ reason: 'no-category-name', row: r }); continue; }

      let categoryId = r.categoryId || catIdMap.get(categoryName) || (await findCategoryByName(categoryName))?.id;
      if (!categoryId) { skipped.requestors.push({ reason: 'category-not-found', row: r, categoryName }); continue; }

      const key = `${categoryName}::${reqName}`;
      const existing = await findRequestorByNameAndCategory(reqName, categoryId);

      if (existing && mode === 'merge') {
        await db.requestors.update(existing.id, {
          description: String(r.description || '').trim(),
          security: normalizeBool(r.security) ? 1 : 0,
        });
        reqIdMap.set(key, existing.id);
        updatedReqs++;
      } else {
        const id = await db.requestors.add({
          categoryId,
          name: reqName,
          description: String(r.description || '').trim(),
          security: normalizeBool(r.security) ? 1 : 0,
        });
        reqIdMap.set(key, id);
        addedReqs++;
      }
    }

    // Prayers (name+requestor-based JSON)
    for (const p of cleanPrs) {
      const prayerName = String(p.name || '').trim();
      if (!prayerName) { skipped.prayers.push({ reason: 'no-name', row: p }); continue; }

      let requestorId = p.requestorId;
      if (!requestorId) {
        const categoryName = String(p.categoryName || p.category || p.requestorCategory || '').trim();
        const requestorName = String(p.requestorName || p.requestor || '').trim();

        if (categoryName && requestorName) {
          const key = `${categoryName}::${requestorName}`;
          requestorId =
            reqIdMap.get(key) ||
            (await (async () => {
              const cat = await findCategoryByName(categoryName);
              if (!cat) return null;
              const r = await findRequestorByNameAndCategory(requestorName, cat.id);
              return r?.id || null;
            })());
        }
      }
      if (!requestorId) { skipped.prayers.push({ reason: 'requestor-not-found', row: p }); continue; }

      const record = {
        requestorId,
        name: prayerName,
        description: String(p.description || '').trim(),
        requestedAt: toIsoOrNull(p.requestedAt) || nowIso(),
        answeredAt: toIsoOrNull(p.answeredAt),
        status: normalizeStatus(p.status),
        security: normalizeBool(p.security) ? 1 : 0,
      };

      if (mode === 'merge') {
        const existing = await db.prayers
          .filter(
            (x) =>
              x.requestorId === requestorId &&
              (x.name || '').trim() === record.name &&
              (x.requestedAt || '').slice(0, 10) === record.requestedAt.slice(0, 10)
          )
          .first();

        if (existing) {
          await db.prayers.update(existing.id, record);
          updatedPrs++;
          continue;
        }
      }

      await db.prayers.add(record);
      addedPrs++;
    }
  });

  window.dispatchEvent(new CustomEvent('db:changed', {
    detail: { source: 'import-json', counts: { addedCats, updatedCats, addedReqs, updatedReqs, addedPrs, updatedPrs }, skipped },
  }));

  if (skipped.categories.length || skipped.requestors.length || skipped.prayers.length) {
    console.warn('Import skipped rows (diagnostic):', skipped);
  }

  return { ok: true, counts: { addedCats, updatedCats, addedReqs, updatedReqs, addedPrs, updatedPrs }, skipped };
}

// ---------------- IMPORT (CSV bundle) ----------------

/**
 * Import any subset of CSVs (AppSheet exports).
 * - If Keys are present, uses Key-based mapping for relationships.
 * - Else falls back to names.
 */
export async function importFromCsvBundle(files, mode = 'merge') {
  const { categoriesFile, requestorsFile, prayersFile } = files || {};

  // Parse provided files; allow any subset
  const [catRows, reqRows, prayRows] = await Promise.all([
    categoriesFile ? parseCsvFile(categoriesFile) : Promise.resolve([]),
    requestorsFile ? parseCsvFile(requestorsFile) : Promise.resolve([]),
    prayersFile ? parseCsvFile(prayersFile) : Promise.resolve([]),
  ]);

  // Build typed arrays with AppSheet Keys when present
  const categories = catRows.map((row) => {
    const H = headerMap(row);
    return {
      key: row[H('key')],
      name: row[H('name', 'category', 'title')],
      description: row[H('description', 'desc')],
      showSingle: row[H('show_single', 'showsingle', 'show single', 'include in single view')],
    };
  }).filter((c) => String(c?.name || '').trim() !== '');

  const requestors = reqRows.map((row) => {
    const H = headerMap(row);
    return {
      key: row[H('key')],
      categoryKey: row[H('requestor category', 'category', 'category key')],
      name: row[H('name', 'requestor', 'requestor name', 'title')],
      description: row[H('description', 'desc')],
      security: row[H('security', 'secure', 'private')],
    };
  }).filter((r) => String(r?.name || '').trim() !== '');

  const prayers = prayRows.map((row) => {
    const H = headerMap(row);
    return {
      key: row[H('key')],
      requestorKey: row[H('requestor', 'requestor key')],
      name: row[H('name', 'prayer', 'title')],
      description: row[H('description', 'desc', 'notes')],
      requestedAt: row[H('requested date stamp', 'requestedat', 'requested date', 'date')],
      answeredAt: row[H('answered date stamp', 'answeredat', 'answered date')],
      status: row[H('status', 'state')],
      security: row[H('security', 'secure', 'private')],
    };
  }).filter((p) => String(p?.name || '').trim() !== '');

  // We’ll import in this order to build key maps: categories -> requestors -> prayers
  let addedCats = 0, updatedCats = 0, addedReqs = 0, updatedReqs = 0, addedPrs = 0, updatedPrs = 0;
  const skipped = { categories: [], requestors: [], prayers: [] };

  // Key → new id maps
  const catKeyToId = new Map();
  const reqKeyToId = new Map();

  await db.transaction('rw', db.categories, db.requestors, db.prayers, async () => {
    if (mode === 'replace') {
      await Promise.all([db.prayers.clear(), db.requestors.clear(), db.categories.clear()]);
    }

    // 1) Categories
    for (const c of categories) {
      const name = String(c.name || '').trim();
      if (!name) { skipped.categories.push({ reason: 'no-name', row: c }); continue; }

      // Try to find existing by name (no Key in our DB)
      const existing = await findCategoryByName(name);
      if (existing && mode === 'merge') {
        await db.categories.update(existing.id, {
          description: c.description || '',
          showSingle: normalizeBool(c.showSingle) ? 1 : 0,
        });
        catKeyToId.set(c.key, existing.id);
        updatedCats++;
      } else {
        const id = await db.categories.add({
          name,
          description: c.description || '',
          showSingle: normalizeBool(c.showSingle) ? 1 : 0,
        });
        catKeyToId.set(c.key, id);
        addedCats++;
      }
    }

    // 2) Requestors
    for (const r of requestors) {
      const reqName = String(r.name || '').trim();
      if (!reqName) { skipped.requestors.push({ reason: 'no-name', row: r }); continue; }

      // Resolve categoryId: prefer Key mapping, fall back to name (if CSV provided names instead)
      let categoryId = null;

      if (r.categoryKey && catKeyToId.has(r.categoryKey)) {
        categoryId = catKeyToId.get(r.categoryKey);
      } else if (r.categoryKey && !catKeyToId.has(r.categoryKey)) {
        // If only requestors CSV provided and categories weren't imported this run,
        // there is no key->id mapping. Skip for now (or fallback to name if present).
        skipped.requestors.push({ reason: 'category-key-unresolved', row: r, categoryKey: r.categoryKey });
        continue;
      } else {
        // No categoryKey present: try a name-based fallback if we can parse a category name field
        // (Your export uses "Requestor Category" as a key, so this path likely won't fire.)
        // You can extend this if you ever export category names instead of keys.
        skipped.requestors.push({ reason: 'no-category-key', row: r });
        continue;
      }

      const existing = await findRequestorByNameAndCategory(reqName, categoryId);
      if (existing && mode === 'merge') {
        await db.requestors.update(existing.id, {
          description: String(r.description || '').trim(),
          security: normalizeBool(r.security) ? 1 : 0,
        });
        reqKeyToId.set(r.key, existing.id);
        updatedReqs++;
      } else {
        const id = await db.requestors.add({
          categoryId,
          name: reqName,
          description: String(r.description || '').trim(),
          security: normalizeBool(r.security) ? 1 : 0,
        });
        reqKeyToId.set(r.key, id);
        addedReqs++;
      }
    }

    // 3) Prayers
    for (const p of prayers) {
      const prayerName = String(p.name || '').trim();
      if (!prayerName) { skipped.prayers.push({ reason: 'no-name', row: p }); continue; }

      // Resolve requestorId via Key map if present
      let requestorId = null;
      if (p.requestorKey && reqKeyToId.has(p.requestorKey)) {
        requestorId = reqKeyToId.get(p.requestorKey);
      } else if (p.requestorKey && !reqKeyToId.has(p.requestorKey)) {
        // If only prayers CSV is imported (without requestors), we can't resolve
        skipped.prayers.push({ reason: 'requestor-key-unresolved', row: p, requestorKey: p.requestorKey });
        continue;
      } else {
        // Fallback: no requestorKey in CSV, try a name-based resolution (requires requestor/category names)
        skipped.prayers.push({ reason: 'no-requestor-key', row: p });
        continue;
      }

      const record = {
        requestorId,
        name: prayerName,
        description: String(p.description || '').trim(),
        requestedAt: toIsoOrNull(p.requestedAt) || nowIso(),
        answeredAt: toIsoOrNull(p.answeredAt),
        status: normalizeStatus(p.status),
        security: normalizeBool(p.security) ? 1 : 0,
      };

      if (mode === 'merge') {
        const existing = await db.prayers
          .filter(
            (x) =>
              x.requestorId === requestorId &&
              (x.name || '').trim() === record.name &&
              (x.requestedAt || '').slice(0, 10) === record.requestedAt.slice(0, 10)
          )
          .first();
        if (existing) {
          await db.prayers.update(existing.id, record);
          updatedPrs++;
          continue;
        }
      }

      await db.prayers.add(record);
      addedPrs++;
    }
  });

  // Broadcast change so UI updates immediately
  window.dispatchEvent(new CustomEvent('db:changed', {
    detail: {
      source: 'import-csv',
      counts: { addedCats, updatedCats, addedReqs, updatedReqs, addedPrs, updatedPrs },
      skipped,
    },
  }));

  if (skipped.categories.length || skipped.requestors.length || skipped.prayers.length) {
    console.warn('CSV import skipped rows (diagnostic):', skipped);
  }

  return { ok: true, counts: { addedCats, updatedCats, addedReqs, updatedReqs, addedPrs, updatedPrs }, skipped };
}
