// src/utils/backup.js
// Plain and Private Vault-encrypted JSON backup and restore.
// Legacy AppSheet CSV import has been removed.

import { db } from '../db';
import {
  exportMetaForBackup,
  encryptBackupPayload,
  unwrapDEKFromHeader,
  decryptBackupPayload,
  isVaultEnabled,
  isUnlocked,
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
    data: {
      categories,
      requestors,
      prayers,
      events,
      journalEntries,
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function downloadJson(jsonText, fileName = 'closet-prayer-backup.json') {
  const blob = new Blob([jsonText], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 0);
}

// ---------------------------------------------------------------------------
// Encrypted export
// ---------------------------------------------------------------------------
export async function exportEncryptedBackup() {
  if (!isVaultEnabled()) {
    const clear = await exportAllAsJson();

    return {
      fileName: 'closet-prayer-backup.json',
      mime: 'application/json',
      text: clear,
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
    payload: {
      ivB64,
      ctB64,
    },
  };

  return {
    fileName: 'closet-prayer-backup.cpe.json',
    mime: 'application/json',
    text: JSON.stringify(envelope),
  };
}

export function isEncryptedBackup(value) {
  return Boolean(
    value &&
      value.header &&
      value.payload &&
      value.header.type === 'cp/encrypted-backup'
  );
}

// ---------------------------------------------------------------------------
// JSON import
// ---------------------------------------------------------------------------
export async function importFromJsonBackup(jsonObject, mode = 'merge') {
  const data = jsonObject?.data || {};
  const {
    categories = [],
    requestors = [],
    prayers = [],
    events = [],
    journalEntries = [],
  } = data;

  const tables = [
    db.categories,
    db.requestors,
    db.prayers,
    db.events,
    db.journalEntries,
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

      if (categories.length) await db.categories.bulkAdd(categories);
      if (requestors.length) await db.requestors.bulkAdd(requestors);
      if (prayers.length) await db.prayers.bulkAdd(prayers);
      if (events.length) await db.events.bulkAdd(events);
      if (journalEntries.length) await db.journalEntries.bulkAdd(journalEntries);
    });

    return true;
  }

  const upsert = async (table, items) => {
    for (const item of items) {
      if (item?.id == null) continue;

      const existing = await table.get(item.id);

      if (existing) {
        await table.put({ ...existing, ...item });
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

    let clearObject;

    try {
      clearObject = JSON.parse(clear);
    } catch {
      throw new Error('Decrypted payload is not valid JSON.');
    }

    await importFromJsonBackup(clearObject, options.mode || 'merge');

    return {
      encrypted: true,
      imported: true,
    };
  }

  await importFromJsonBackup(parsed, options.mode || 'merge');

  return {
    encrypted: false,
    imported: true,
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
    text: clear,
  };
}
