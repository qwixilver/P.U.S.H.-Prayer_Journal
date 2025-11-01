// src/utils/backup.js
// - Plain JSON export/import (original behavior)
// - Encrypted export/import when Private Vault is enabled
// - Advanced CSV import (AppSheet-style), preserved
//
// Notes:
// * No telemetry.
// * CSV parser is minimal but handles quoted fields and commas.
// * Blank rows are skipped; unknown columns are passed through.

import { db } from '../db';
import {
  exportMetaForBackup,
  encryptBackupPayload,
  unwrapDEKFromHeader,
  decryptBackupPayload,
  isVaultEnabled,
  isUnlocked
} from './vault';

// ---------------------------------------------------------------------------
// Plain JSON export (original behavior kept)
// ---------------------------------------------------------------------------
export async function exportAllAsJson() {
  const [categories, requestors, prayers, events, journalEntries] = await Promise.all([
    db.categories.toArray(),
    db.requestors.toArray(),
    db.prayers.toArray(),
    db.events.toArray(),
    db.journal.toArray(),
  ]);

  const payload = {
    version: 1,
    exportedAt: Date.now(),
    data: { categories, requestors, prayers, events, journalEntries },
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadJson(jsonText, fileName = 'closet-prayer-backup.json') {
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

// ---------------------------------------------------------------------------
// Encrypted exports (Vault)
// ---------------------------------------------------------------------------
export async function exportEncryptedBackup() {
  if (!isVaultEnabled()) {
    const clear = await exportAllAsJson();
    return {
      fileName: 'closet-prayer-backup.json',
      mime: 'application/json',
      text: clear
    };
  }
  if (!isUnlocked()) throw new Error('Unlock the vault before exporting.');

  const clear = await exportAllAsJson();
  const header = exportMetaForBackup();
  const { ivB64, ctB64 } = await encryptBackupPayload(clear);

  const envelope = { header, payload: { ivB64, ctB64 } };
  const text = JSON.stringify(envelope);
  return {
    fileName: 'closet-prayer-backup.cpe.json',
    mime: 'application/json',
    text
  };
}

export function isEncryptedBackup(obj) {
  return !!(obj && obj.header && obj.payload && obj.header.type === 'cp/encrypted-backup');
}

// ---------------------------------------------------------------------------
// Import (plain or encrypted)
// ---------------------------------------------------------------------------
export async function importFromJsonBackup(jsonObj, mode = 'merge') {
  const data = jsonObj?.data || {};
  const { categories = [], requestors = [], prayers = [], events = [], journalEntries = [] } = data;

  if (mode === 'replace') {
    await db.transaction('rw', db.categories, db.requestors, db.prayers, db.events, db.journal, async () => {
      await Promise.all([
        db.categories.clear(),
        db.requestors.clear(),
        db.prayers.clear(),
        db.events.clear(),
        db.journal.clear(),
      ]);
      if (categories.length) await db.categories.bulkAdd(categories);
      if (requestors.length) await db.requestors.bulkAdd(requestors);
      if (prayers.length) await db.prayers.bulkAdd(prayers);
      if (events.length) await db.events.bulkAdd(events);
      if (journalEntries.length) await db.journal.bulkAdd(journalEntries);
    });
  } else {
    const upsert = async (table, arr) => {
      for (const item of arr) {
        if (item?.id == null) continue;
        const exists = await table.get(item.id);
        if (exists) await table.put({ ...exists, ...item });
        else await table.add(item);
      }
    };
    await db.transaction('rw', db.categories, db.requestors, db.prayers, db.events, db.journal, async () => {
      await upsert(db.categories, categories);
      await upsert(db.requestors, requestors);
      await upsert(db.prayers, prayers);
      await upsert(db.events, events);
      await upsert(db.journal, journalEntries);
    });
  }
  return true;
}

export async function importSmartFromFileText(fileText, options = {}) {
  let parsed;
  try { parsed = JSON.parse(fileText); } catch { throw new Error('Invalid backup file.'); }

  if (isEncryptedBackup(parsed)) {
    const header = parsed.header;
    const payload = parsed.payload;

    const { secretKind, secret } = options || {};
    if (!secretKind || !secret) {
      const err = new Error('Encrypted backup detected: passphrase or Recovery Code required.');
      err.code = 'NEEDS_SECRET';
      err.header = header;
      return Promise.reject(err);
    }

    const dekBytes = await unwrapDEKFromHeader(header, secretKind, secret);
    const clear = await decryptBackupPayload(payload.ivB64, payload.ctB64, dekBytes);
    let clearObj;
    try { clearObj = JSON.parse(clear); } catch { throw new Error('Decrypted payload is not valid JSON.'); }

    await importFromJsonBackup(clearObj, options.mode || 'merge');
    return { encrypted: true, imported: true };
  }

  await importFromJsonBackup(parsed, options.mode || 'merge');
  return { encrypted: false, imported: true };
}

export async function exportSmartJson() {
  if (isVaultEnabled()) return exportEncryptedBackup();
  const clear = await exportAllAsJson();
  return { fileName: 'closet-prayer-backup.json', mime: 'application/json', text: clear };
}

// ---------------------------------------------------------------------------
// Advanced CSV import (preserved)
// Accepts an array of File objects. Guesses table by filename or header.
// ---------------------------------------------------------------------------
function parseCsvText(text) {
  // Minimal CSV parser handling quotes and commas
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += ch; i++; continue;
    }
  }
  row.push(field);
  rows.push(row);

  // header + objects
  const header = rows.shift() || [];
  const cols = header.map(h => (h || '').trim());
  const out = [];
  for (const r of rows) {
    if (!r || r.length === 0) continue;
    const o = {};
    let empty = true;
    for (let c = 0; c < cols.length; c++) {
      const key = cols[c];
      const val = r[c] ?? '';
      if (val !== '' && val != null) empty = false;
      if (key) o[key] = val;
    }
    if (!empty) out.push(o);
  }
  return { header: cols, rows: out };
}

function guessTableKind(fileName, header) {
  const name = (fileName || '').toLowerCase();
  if (name.includes('category')) return 'categories';
  if (name.includes('requestor')) return 'requestors';
  if (name.includes('prayer')) return 'prayers';
  // Simple heuristic based on common id fields
  const h = header.map(h => h.toLowerCase());
  if (h.includes('categoryid') && h.includes('name') && !h.includes('requestorid')) return 'categories';
  if (h.includes('requestorid') && h.includes('name') && !h.includes('prayerid')) return 'requestors';
  if (h.includes('prayerid') || h.includes('status') || h.includes('requestedat')) return 'prayers';
  return 'unknown';
}

function normalizeIds(arr) {
  // Attempt to coerce id-like fields to numbers when possible, keep strings if not
  return arr.map(o => {
    const out = { ...o };
    ['id','categoryId','requestorId'].forEach(k => {
      if (out[k] === '' || out[k] == null) return;
      const n = Number(out[k]);
      if (Number.isFinite(n) && String(n) === String(out[k]).trim()) out[k] = n;
    });
    // booleans-ish
    ['showSingle','security'].forEach(k => {
      if (k in out) {
        const v = String(out[k]).trim().toLowerCase();
        if (['true','1','yes','y'].includes(v)) out[k] = true;
        else if (['false','0','no','n'].includes(v)) out[k] = false;
      }
    });
    // dates-ish: pass through strings; Dexie consumers decide
    return out;
  });
}

export async function importFromCsvBundle(files, mode = 'merge') {
  const bucket = { categories: [], requestors: [], prayers: [] };
  const skipped = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const { header, rows } = parseCsvText(text);
      const kind = guessTableKind(file.name, header);
      if (kind === 'unknown') {
        skipped.push({ file: file.name, reason: 'unknown kind (headers)', header });
        continue;
      }
      const normalized = normalizeIds(rows);
      bucket[kind].push(...normalized);
    } catch (e) {
      skipped.push({ file: file.name, reason: e?.message || 'parse failed' });
    }
  }

  const counts = {
    categories: bucket.categories.length,
    requestors: bucket.requestors.length,
    prayers: bucket.prayers.length,
  };

  const json = {
    version: 1,
    data: {
      categories: bucket.categories,
      requestors: bucket.requestors,
      prayers: bucket.prayers,
      events: [],           // CSV path doesn't handle events/journal
      journalEntries: [],
    }
  };
  await importFromJsonBackup(json, mode);
  return { counts, skipped, skippedTotal: skipped.length };
}
