// src/utils/backup.js
// Import/Export helpers for the Prayer Journal IndexedDB (Dexie) database.
// - Export to a single JSON file
// - Import from our JSON backup
// - Import from 3 CSV files (as exported by AppSheet: categories, requestors, prayers)
//
// Notes:
// * "mode" can be 'replace' (wipe all data before import) or 'merge' (upsert by names).
// * CSV import expects columns close to your AppSheet export, but matching is lenient:
//   - Categories CSV:  name, description, showSingle
//   - Requestors CSV:  category, name, description, security
//   - Prayers CSV:     requestor, name, description, requestedAt, answeredAt, status, security
//   Column names are matched case-insensitively and with whitespace trimmed.

import { db } from '../db';
import Papa from 'papaparse';

// ---------- small helpers ----------

const schemaVersion = 1; // bump if you change the export format
const nowIso = () => new Date().toISOString();

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

function toIsoOrNull(v) {
  if (!v) return null;
  try {
    const d = new Date(v);
    // Invalid dates become "Invalid Date"
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

function headerMap(row) {
  // Build a case-insensitive key map for a CSV row
  const map = {};
  for (const k of Object.keys(row)) {
    map[k.trim().toLowerCase()] = k;
  }
  return (wanted) => map[wanted.trim().toLowerCase()];
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => resolve(res.data),
      error: reject,
    });
  });
}

async function getAll() {
  const [categories, requestors, prayers] = await Promise.all([
    db.categories.toArray(),
    db.requestors.toArray(),
    db.prayers.toArray(),
  ]);
  return { categories, requestors, prayers };
}

// Finders that DO NOT require indexed fields (we use .filter for robustness)
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

// ---------- EXPORT ----------

export async function exportAllAsJson() {
  const { categories, requestors, prayers } = await getAll();
  const payload = {
    meta: {
      type: 'prayer-journal-backup',
      version: schemaVersion,
      exportedAt: nowIso(),
    },
    data: { categories, requestors, prayers },
  };
  return payload;
}

export function downloadJson(data, filename = 'prayer-journal-backup.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- IMPORT (JSON) ----------

export async function importFromJsonBackup(json, mode = 'merge') {
  // Basic validation
  if (!json || !json.meta || json.meta.type !== 'prayer-journal-backup') {
    throw new Error('Invalid backup file.');
  }
  const { categories = [], requestors = [], prayers = [] } = json.data || {};

  await db.transaction('rw', db.categories, db.requestors, db.prayers, async () => {
    if (mode === 'replace') {
      await Promise.all([db.prayers.clear(), db.requestors.clear(), db.categories.clear()]);
    }

    // Simple upsert by name (and category) to keep "merge" deterministic
    // 1) Categories
    const catIdMap = new Map(); // name -> id
    for (const c of categories) {
      const existing = await findCategoryByName(c.name);
      if (existing && mode === 'merge') {
        await db.categories.update(existing.id, {
          description: c.description || '',
          showSingle: normalizeBool(c.showSingle) ? 1 : 0,
        });
        catIdMap.set(c.name, existing.id);
      } else {
        const id = await db.categories.add({
          name: c.name,
          description: c.description || '',
          showSingle: normalizeBool(c.showSingle) ? 1 : 0,
        });
        catIdMap.set(c.name, id);
      }
    }

    // 2) Requestors
    const reqIdMap = new Map(); // (categoryName + '::' + reqName) -> id
    for (const r of requestors) {
      // Figure category id either from r.categoryId or by name lookup
      let categoryId = r.categoryId;
      if (!categoryId && r.categoryName) {
        categoryId = catIdMap.get(r.categoryName) || (await findCategoryByName(r.categoryName))?.id;
      }
      // If still not found, skip (or create a default category?)
      if (!categoryId) continue;

      const key = `${String(r.categoryName || '').trim()}::${String(r.name || '').trim()}`;
      const existing = await findRequestorByNameAndCategory(r.name, categoryId);

      if (existing && mode === 'merge') {
        await db.requestors.update(existing.id, {
          description: r.description || '',
          security: normalizeBool(r.security) ? 1 : 0,
        });
        reqIdMap.set(key, existing.id);
      } else {
        const id = await db.requestors.add({
          categoryId,
          name: r.name,
          description: r.description || '',
          security: normalizeBool(r.security) ? 1 : 0,
        });
        reqIdMap.set(key, id);
      }
    }

    // 3) Prayers
    for (const p of prayers) {
      // Resolve requestorId by name if missing (requires requestorName + categoryName in data)
      let requestorId = p.requestorId;

      if (!requestorId && (p.requestorName || p.categoryName)) {
        const key = `${String(p.categoryName || '').trim()}::${String(p.requestorName || '').trim()}`;
        requestorId =
          reqIdMap.get(key) ||
          (await (async () => {
            const cat = await findCategoryByName(p.categoryName);
            if (!cat) return null;
            const r = await findRequestorByNameAndCategory(p.requestorName, cat.id);
            return r?.id || null;
          })());
      }

      if (!requestorId) continue; // cannot import if we can’t resolve requestor

      const record = {
        requestorId,
        name: p.name,
        description: p.description || '',
        requestedAt: toIsoOrNull(p.requestedAt) || nowIso(),
        answeredAt: toIsoOrNull(p.answeredAt),
        status: normalizeStatus(p.status),
        security: normalizeBool(p.security) ? 1 : 0,
      };

      if (mode === 'merge') {
        // Best-effort dedupe: if an identical name+requestor+requestedAt exists, update it
        const existing = await db.prayers
          .filter(
            (x) =>
              x.requestorId === requestorId &&
              (x.name || '').trim() === (record.name || '').trim() &&
              (x.requestedAt || '').slice(0, 10) === (record.requestedAt || '').slice(0, 10)
          )
          .first();

        if (existing) {
          await db.prayers.update(existing.id, record);
          continue;
        }
      }

      await db.prayers.add(record);
    }
  });

  return { ok: true };
}

// ---------- IMPORT (CSV bundle) ----------

export async function importFromCsvBundle(files, mode = 'merge') {
  const { categoriesFile, requestorsFile, prayersFile } = files || {};
  if (!categoriesFile || !requestorsFile || !prayersFile) {
    throw new Error('Please provide all three CSV files (categories, requestors, prayers).');
  }

  // Parse CSVs
  const [catsRows, reqsRows, prayRows] = await Promise.all([
    parseCsvFile(categoriesFile),
    parseCsvFile(requestorsFile),
    parseCsvFile(prayersFile),
  ]);

  // Normalize row access with case-insensitive headers
  const catRows = catsRows.map((row) => {
    const H = headerMap(row);
    return {
      name: row[H('name')],
      description: row[H('description')],
      showSingle: row[H('showsingle')], // accepts true/false/1/0/yes/no
    };
  });

  const reqRows = reqsRows.map((row) => {
    const H = headerMap(row);
    return {
      categoryName: row[H('category')] ?? row[H('requestorcategory')],
      name: row[H('name')],
      description: row[H('description')],
      security: row[H('security')],
    };
  });

  const prRows = prayRows.map((row) => {
    const H = headerMap(row);
    return {
      categoryName: row[H('category')] ?? row[H('requestorcategory')],
      requestorName: row[H('requestor')] ?? row[H('requestorname')],
      name: row[H('name')],
      description: row[H('description')],
      requestedAt: row[H('requestedat')] ?? row[H('requesteddatestamp')] ?? row[H('requesteddate')],
      answeredAt: row[H('answeredat')] ?? row[H('answereddatestamp')] ?? row[H('answereddate')],
      status: row[H('status')],
      security: row[H('security')],
    };
  });

  // Reuse the JSON import pipeline by massaging into the same shape
  const payload = {
    meta: { type: 'prayer-journal-backup', version: schemaVersion, exportedAt: nowIso() },
    data: {
      categories: catRows,
      requestors: reqRows,
      prayers: prRows,
    },
  };

  return importFromJsonBackup(payload, mode);
}
