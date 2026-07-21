// src/utils/backup.js
// - Plain JSON export/import
// - Encrypted export/import when Private Vault is enabled
// - Advanced CSV import (AppSheet-style)
//
// Notes:
// * No telemetry.
// * CSV parser handles quoted fields and commas.
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
// Plain JSON export
// ---------------------------------------------------------------------------
export async function exportAllAsJson() {
  const [categories, requestors, prayers, events, journalEntries] = await Promise.all([
    db.categories.toArray(),
    db.requestors.toArray(),
    db.prayers.toArray(),
    db.events.toArray(),
    db.journalEntries.toArray(),
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

  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// ---------------------------------------------------------------------------
// Encrypted exports
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

  if (!isUnlocked()) {
    throw new Error('Unlock the vault before exporting.');
  }

  const clear = await exportAllAsJson();
  const header = exportMetaForBackup();
  const { ivB64, ctB64 } = await encryptBackupPayload(clear);

  const envelope = {
    header,
    payload: { ivB64, ctB64 }
  };

  return {
    fileName: 'closet-prayer-backup.cpe.json',
    mime: 'application/json',
    text: JSON.stringify(envelope)
  };
}

export function isEncryptedBackup(obj) {
  return !!(
    obj &&
    obj.header &&
    obj.payload &&
    obj.header.type === 'cp/encrypted-backup'
  );
}

// ---------------------------------------------------------------------------
// JSON import
// ---------------------------------------------------------------------------
export async function importFromJsonBackup(jsonObj, mode = 'merge') {
  const data = jsonObj?.data || {};
  const {
    categories = [],
    requestors = [],
    prayers = [],
    events = [],
    journalEntries = []
  } = data;

  const tables = [
    db.categories,
    db.requestors,
    db.prayers,
    db.events,
    db.journalEntries
  ];

  if (mode === 'replace') {
    await db.transaction('rw', ...tables, async () => {
      await Promise.all([
        db.categories.clear(),
        db.requestors.clear(),
        db.prayers.clear(),
        db.events.clear(),
        db.journalEntries.clear(),
      ]);

      if (categories.length) {
        await db.categories.bulkAdd(categories);
      }
      if (requestors.length) {
        await db.requestors.bulkAdd(requestors);
      }
      if (prayers.length) {
        await db.prayers.bulkAdd(prayers);
      }
      if (events.length) {
        await db.events.bulkAdd(events);
      }
      if (journalEntries.length) {
        await db.journalEntries.bulkAdd(journalEntries);
      }
    });

    return true;
  }

  const upsert = async (table, items) => {
    for (const item of items) {
      if (item?.id == null) {
        continue;
      }

      const exists = await table.get(item.id);

      if (exists) {
        await table.put({ ...exists, ...item });
      } else {
        await table.add(item);
      }
    }
  };

  await db.transaction('rw', ...tables, async () => {
    await upsert(db.categories, categories);
    await upsert(db.requestors, requestors);
    await upsert(db.prayers, prayers);
    await upsert(db.events, events);
    await upsert(db.journalEntries, journalEntries);
  });

  return true;
}

export async function importSmartFromFileText(fileText, options = {}) {
  let parsed;

  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new Error('Invalid backup file.');
  }

  if (isEncryptedBackup(parsed)) {
    const { header, payload } = parsed;
    const { secretKind, secret } = options;

    if (!secretKind || !secret) {
      const error = new Error(
        'Encrypted backup detected: passphrase or Recovery Code required.'
      );
      error.code = 'NEEDS_SECRET';
      error.header = header;
      throw error;
    }

    const dekBytes = await unwrapDEKFromHeader(
      header,
      secretKind,
      secret
    );

    const clear = await decryptBackupPayload(
      payload.ivB64,
      payload.ctB64,
      dekBytes
    );

    let clearObj;

    try {
      clearObj = JSON.parse(clear);
    } catch {
      throw new Error('Decrypted payload is not valid JSON.');
    }

    await importFromJsonBackup(clearObj, options.mode || 'merge');

    return {
      encrypted: true,
      imported: true
    };
  }

  await importFromJsonBackup(parsed, options.mode || 'merge');

  return {
    encrypted: false,
    imported: true
  };
}

export async function exportSmartJson() {
  if (isVaultEnabled()) {
    return exportEncryptedBackup();
  }

  const clear = await exportAllAsJson();

  return {
    fileName: 'closet-prayer-backup.json',
    mime: 'application/json',
    text: clear
  };
}

// ---------------------------------------------------------------------------
// Advanced CSV import
// ---------------------------------------------------------------------------
function parseCsvText(text) {
  const rows = [];
  let index = 0;
  let field = '';
  let row = [];
  let inQuotes = false;

  while (index < text.length) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        inQuotes = false;
        index += 1;
        continue;
      }

      field += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (character === ',') {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }

    if (character === '\r') {
      index += 1;
      continue;
    }

    if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      index += 1;
      continue;
    }

    field += character;
    index += 1;
  }

  row.push(field);
  rows.push(row);

  const header = rows.shift() || [];
  const columns = header.map((heading) => (heading || '').trim());
  const output = [];

  for (const values of rows) {
    if (!values || values.length === 0) {
      continue;
    }

    const item = {};
    let empty = true;

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const key = columns[columnIndex];
      const value = values[columnIndex] ?? '';

      if (value !== '' && value != null) {
        empty = false;
      }

      if (key) {
        item[key] = value;
      }
    }

    if (!empty) {
      output.push(item);
    }
  }

  return {
    header: columns,
    rows: output
  };
}

function guessTableKind(fileName, header) {
  const name = (fileName || '').toLowerCase();

  if (name.includes('category')) {
    return 'categories';
  }
  if (name.includes('requestor')) {
    return 'requestors';
  }
  if (name.includes('prayer')) {
    return 'prayers';
  }

  const normalizedHeader = header.map((heading) => heading.toLowerCase());

  if (
    normalizedHeader.includes('categoryid') &&
    normalizedHeader.includes('name') &&
    !normalizedHeader.includes('requestorid')
  ) {
    return 'categories';
  }

  if (
    normalizedHeader.includes('requestorid') &&
    normalizedHeader.includes('name') &&
    !normalizedHeader.includes('prayerid')
  ) {
    return 'requestors';
  }

  if (
    normalizedHeader.includes('prayerid') ||
    normalizedHeader.includes('status') ||
    normalizedHeader.includes('requestedat')
  ) {
    return 'prayers';
  }

  return 'unknown';
}

function normalizeIds(items) {
  return items.map((item) => {
    const output = { ...item };

    ['id', 'categoryId', 'requestorId'].forEach((key) => {
      if (output[key] === '' || output[key] == null) {
        return;
      }

      const numericValue = Number(output[key]);

      if (
        Number.isFinite(numericValue) &&
        String(numericValue) === String(output[key]).trim()
      ) {
        output[key] = numericValue;
      }
    });

    ['showSingle', 'security'].forEach((key) => {
      if (!(key in output)) {
        return;
      }

      const value = String(output[key]).trim().toLowerCase();

      if (['true', '1', 'yes', 'y'].includes(value)) {
        output[key] = true;
      } else if (['false', '0', 'no', 'n'].includes(value)) {
        output[key] = false;
      }
    });

    return output;
  });
}

export async function importFromCsvBundle(files, mode = 'merge') {
  const bucket = {
    categories: [],
    requestors: [],
    prayers: []
  };

  const skipped = [];

  for (const file of files) {
    try {
      const text = await file.text();
      const { header, rows } = parseCsvText(text);
      const kind = guessTableKind(file.name, header);

      if (kind === 'unknown') {
        skipped.push({
          file: file.name,
          reason: 'unknown kind (headers)',
          header
        });
        continue;
      }

      bucket[kind].push(...normalizeIds(rows));
    } catch (error) {
      skipped.push({
        file: file.name,
        reason: error?.message || 'parse failed'
      });
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
      events: [],
      journalEntries: [],
    }
  };

  await importFromJsonBackup(json, mode);

  return {
    counts,
    skipped,
    skippedTotal: skipped.length
  };
}
