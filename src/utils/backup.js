// src/utils/backup.js
// Import/Export helpers for the Prayer Journal IndexedDB (Dexie) database.

import { db } from '../db';
import Papa from 'papaparse';

const schemaVersion = 1;
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
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function headerMap(row) {
  const map = {};
  for (const k of Object.keys(row)) map[k.trim().toLowerCase()] = k;
  return (wanted) => map[wanted.trim().toLowerCase()];
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true, // removes truly empty lines
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

// ---------- IMPORT (JSON) ----------

export async function importFromJsonBackup(json, mode = 'merge') {
  if (!json || !json.meta || json.meta.type !== 'prayer-journal-backup') {
    throw new Error('Invalid backup file.');
  }
  const { categories = [], requestors = [], prayers = [] } = json.data || {};

  // NEW: skip blank-ish rows up front
  const cleanCats = categories.filter((c) => String(c?.name || '').trim() !== '');
  const cleanReqs = requestors.filter((r) => String(r?.name || '').trim() !== '');
  const cleanPrs = prayers.filter((p) => String(p?.name || '').trim() !== '');

  let addedCats = 0, updatedCats = 0, addedReqs = 0, updatedReqs = 0, addedPrs = 0, updatedPrs = 0;

  await db.transaction('rw', db.categories, db.requestors, db.prayers, async () => {
    if (mode === 'replace') {
      await Promise.all([db.prayers.clear(), db.requestors.clear(), db.categories.clear()]);
    }

    const catIdMap = new Map(); // name -> id

    // Categories
    for (const c of cleanCats) {
      const existing = await findCategoryByName(c.name);
      if (existing && mode === 'merge') {
        await db.categories.update(existing.id, {
          description: c.description || '',
          showSingle: normalizeBool(c.showSingle) ? 1 : 0,
        });
        catIdMap.set(c.name, existing.id);
        updatedCats++;
      } else {
        const id = await db.categories.add({
          name: c.name,
          description: c.description || '',
          showSingle: normalizeBool(c.showSingle) ? 1 : 0,
        });
        catIdMap.set(c.name, id);
        addedCats++;
      }
    }

    // Requestors
    const reqIdMap = new Map(); // `${categoryName}::${reqName}` -> id
    for (const r of cleanReqs) {
      const categoryName = String(r.categoryName || r.category || '').trim();
      const reqName = String(r.name || '').trim();
      if (!categoryName || !reqName) continue; // skip incomplete rows

      let categoryId = r.categoryId || catIdMap.get(categoryName) || (await findCategoryByName(categoryName))?.id;
      if (!categoryId) continue;

      const key = `${categoryName}::${reqName}`;
      const existing = await findRequestorByNameAndCategory(reqName, categoryId);

      if (existing && mode === 'merge') {
        await db.requestors.update(existing.id, {
          description: r.description || '',
          security: normalizeBool(r.security) ? 1 : 0,
        });
        reqIdMap.set(key, existing.id);
        updatedReqs++;
      } else {
        const id = await db.requestors.add({
          categoryId,
          name: reqName,
          description: r.description || '',
          security: normalizeBool(r.security) ? 1 : 0,
        });
        reqIdMap.set(key, id);
        addedReqs++;
      }
    }

    // Prayers
    for (const p of cleanPrs) {
      const prayerName = String(p.name || '').trim();
      if (!prayerName) continue;

      let requestorId = p.requestorId;
      if (!requestorId) {
        const categoryName = String(p.categoryName || p.category || '').trim();
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
      if (!requestorId) continue; // can't import without a requestor

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

  // NEW: broadcast a "db changed" event so UI can refresh without a full reload
  window.dispatchEvent(new CustomEvent('db:changed', {
    detail: {
      source: 'import-json',
      counts: { addedCats, updatedCats, addedReqs, updatedReqs, addedPrs, updatedPrs },
    },
  }));

  return { ok: true, counts: { addedCats, updatedCats, addedReqs, updatedReqs, addedPrs, updatedPrs } };
}

// ---------- IMPORT (CSV bundle) ----------

export async function importFromCsvBundle(files, mode = 'merge') {
  const { categoriesFile, requestorsFile, prayersFile } = files || {};
  if (!categoriesFile || !requestorsFile || !prayersFile) {
    throw new Error('Please provide all three CSV files (categories, requestors, prayers).');
  }

  const [catsRows, reqsRows, prayRows] = await Promise.all([
    parseCsvFile(categoriesFile),
    parseCsvFile(requestorsFile),
    parseCsvFile(prayersFile),
  ]);

  // Map headers (lenient)
  const catMapped = catsRows.map((row) => {
    const H = headerMap(row);
    return {
      name: row[H('name')],
      description: row[H('description')],
      showSingle: row[H('showsingle')],
    };
  });

  const reqMapped = reqsRows.map((row) => {
    const H = headerMap(row);
    return {
      categoryName: row[H('category')] ?? row[H('requestorcategory')],
      name: row[H('name')],
      description: row[H('description')],
      security: row[H('security')],
    };
  });

  const prayMapped = prayRows.map((row) => {
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

  // NEW: drop blank lines / nameless rows
  const cleaned = {
    categories: catMapped.filter((c) => String(c?.name || '').trim() !== ''),
    requestors: reqMapped.filter((r) => String(r?.name || '').trim() !== ''),
    prayers: prayMapped.filter((p) => String(p?.name || '').trim() !== ''),
  };

  const payload = {
    meta: { type: 'prayer-journal-backup', version: schemaVersion, exportedAt: nowIso() },
    data: cleaned,
  };

  // Reuse JSON import (which now also broadcasts db:changed)
  return importFromJsonBackup(payload, mode);
}
