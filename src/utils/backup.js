// src/utils/backup.js
// Full backups plus portable branch/leaf exports that can be safely grafted
// into another database with Merge Import.

import { db } from '../db';
import {
  exportMetaForBackup,
  encryptBackupPayload,
  unwrapDEKFromHeader,
  decryptBackupPayload,
  isVaultEnabled,
  isUnlocked,
} from './vault';

const PORTABLE_EXPORT_TYPE = 'cp/portable-graft';
const PORTABLE_EXPORT_VERSION = 1;
const DATABASE_TRANSFER_ID_KEY = 'cp:databaseTransferId:v1';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function createRandomId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function getOrCreateDatabaseTransferId() {
  try {
    const existing = localStorage.getItem(DATABASE_TRANSFER_ID_KEY);
    if (existing) return existing;

    const created = createRandomId();
    localStorage.setItem(DATABASE_TRANSFER_ID_KEY, created);
    return created;
  } catch {
    // Storage should normally be available in the PWA. This fallback keeps an
    // export usable even in a restricted browser session, though repeat-export
    // identity cannot be guaranteed across reloads in that unusual case.
    return createRandomId();
  }
}

function toMapKey(value) {
  return `${typeof value}:${String(value)}`;
}

function makePortableId(sourceDatabaseId, tableName, sourceId) {
  return `${sourceDatabaseId}:${tableName}:${String(sourceId)}`;
}

function preparePortableRecord(record, tableName, sourceDatabaseId) {
  if (!record) return null;

  return {
    ...record,
    portableId:
      record.portableId ||
      makePortableId(sourceDatabaseId, tableName, record.id),
  };
}

async function ensurePortableRecords(
  table,
  tableName,
  records,
  sourceDatabaseId
) {
  const prepared = [];

  for (const record of records) {
    const portable = preparePortableRecord(
      record,
      tableName,
      sourceDatabaseId
    );

    if (!record.portableId) {
      await table.put(portable);
    }

    prepared.push(portable);
  }

  return prepared;
}

function sanitizeFilePart(value, fallback) {
  const cleaned = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return cleaned || fallback;
}

async function getPrayersForRequestorIds(requestorIds) {
  if (!requestorIds.length) return [];
  return db.prayers.where('requestorId').anyOf(requestorIds).toArray();
}

async function getEventsForPrayerIds(prayerIds) {
  if (!prayerIds.length) return [];
  return db.events.where('prayerId').anyOf(prayerIds).toArray();
}

function selectionName(kind, record) {
  if (kind === 'journal') return record?.title || 'untitled-journal-entry';
  if (kind === 'event') return record?.title || 'prayer-event';
  return record?.name || `${kind}-${record?.id ?? 'export'}`;
}

function buildPortablePayload({
  sourceDatabaseId,
  selection,
  categories = [],
  requestors = [],
  prayers = [],
  events = [],
  journalEntries = [],
}) {
  return {
    version: 1,
    exportedAt: Date.now(),
    exportType: PORTABLE_EXPORT_TYPE,
    portableExportVersion: PORTABLE_EXPORT_VERSION,
    sourceDatabaseId,
    selection,
    data: {
      categories: categories.map((item) =>
        preparePortableRecord(item, 'categories', sourceDatabaseId)
      ),
      requestors: requestors.map((item) =>
        preparePortableRecord(item, 'requestors', sourceDatabaseId)
      ),
      prayers: prayers.map((item) =>
        preparePortableRecord(item, 'prayers', sourceDatabaseId)
      ),
      events: events.map((item) =>
        preparePortableRecord(item, 'events', sourceDatabaseId)
      ),
      journalEntries: journalEntries.map((item) =>
        preparePortableRecord(item, 'journalEntries', sourceDatabaseId)
      ),
    },
  };
}

function isPortableGraft(value) {
  return Boolean(
    value &&
      value.exportType === PORTABLE_EXPORT_TYPE &&
      value.data
  );
}

async function encryptExportText(clearText, fileName) {
  if (!isVaultEnabled()) {
    return {
      fileName,
      mime: 'application/json',
      text: clearText,
    };
  }

  if (!isUnlocked()) {
    throw new Error(
      'Unlock the Private Vault in Settings before exporting this data.'
    );
  }

  const header = {
    ...exportMetaForBackup(),
    contents: 'portable-graft',
  };
  const { ivB64, ctB64 } = await encryptBackupPayload(clearText);
  const encryptedName = fileName.replace(/\.json$/i, '.cpe.json');

  return {
    fileName: encryptedName,
    mime: 'application/json',
    text: JSON.stringify({
      header,
      payload: { ivB64, ctB64 },
    }),
  };
}

// ---------------------------------------------------------------------------
// Full backup export
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

// ---------------------------------------------------------------------------
// Portable branch/leaf export
// ---------------------------------------------------------------------------
export async function exportSelectionSmart({ kind, id }) {
  const sourceDatabaseId = getOrCreateDatabaseTransferId();
  let payload;
  let selectedRecord;

  if (kind === 'category') {
    const category = await db.categories.get(id);
    if (!category) throw new Error('Category not found.');

    const requestors = await db.requestors
      .where('categoryId')
      .equals(category.id)
      .toArray();
    const prayers = await getPrayersForRequestorIds(
      requestors.map((requestor) => requestor.id)
    );
    const events = await getEventsForPrayerIds(
      prayers.map((prayer) => prayer.id)
    );

    const [portableCategories, portableRequestors, portablePrayers, portableEvents] =
      await Promise.all([
        ensurePortableRecords(
          db.categories,
          'categories',
          [category],
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.requestors,
          'requestors',
          requestors,
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.prayers,
          'prayers',
          prayers,
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.events,
          'events',
          events,
          sourceDatabaseId
        ),
      ]);

    selectedRecord = portableCategories[0];
    payload = buildPortablePayload({
      sourceDatabaseId,
      selection: {
        kind,
        sourceId: category.id,
        label: selectionName(kind, category),
      },
      categories: portableCategories,
      requestors: portableRequestors,
      prayers: portablePrayers,
      events: portableEvents,
    });
  } else if (kind === 'requestor') {
    const requestor = await db.requestors.get(id);
    if (!requestor) throw new Error('Requestor not found.');

    const category = await db.categories.get(requestor.categoryId);
    const prayers = await db.prayers
      .where('requestorId')
      .equals(requestor.id)
      .toArray();
    const events = await getEventsForPrayerIds(
      prayers.map((prayer) => prayer.id)
    );

    const [portableCategories, portableRequestors, portablePrayers, portableEvents] =
      await Promise.all([
        ensurePortableRecords(
          db.categories,
          'categories',
          category ? [category] : [],
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.requestors,
          'requestors',
          [requestor],
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.prayers,
          'prayers',
          prayers,
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.events,
          'events',
          events,
          sourceDatabaseId
        ),
      ]);

    selectedRecord = portableRequestors[0];
    payload = buildPortablePayload({
      sourceDatabaseId,
      selection: {
        kind,
        sourceId: requestor.id,
        label: selectionName(kind, requestor),
      },
      categories: portableCategories,
      requestors: portableRequestors,
      prayers: portablePrayers,
      events: portableEvents,
    });
  } else if (kind === 'prayer') {
    const prayer = await db.prayers.get(id);
    if (!prayer) throw new Error('Prayer request not found.');

    const requestor = await db.requestors.get(prayer.requestorId);
    const category = requestor
      ? await db.categories.get(requestor.categoryId)
      : null;
    const events = await db.events
      .where('prayerId')
      .equals(prayer.id)
      .toArray();

    const [portableCategories, portableRequestors, portablePrayers, portableEvents] =
      await Promise.all([
        ensurePortableRecords(
          db.categories,
          'categories',
          category ? [category] : [],
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.requestors,
          'requestors',
          requestor ? [requestor] : [],
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.prayers,
          'prayers',
          [prayer],
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.events,
          'events',
          events,
          sourceDatabaseId
        ),
      ]);

    selectedRecord = portablePrayers[0];
    payload = buildPortablePayload({
      sourceDatabaseId,
      selection: {
        kind,
        sourceId: prayer.id,
        label: selectionName(kind, prayer),
      },
      categories: portableCategories,
      requestors: portableRequestors,
      prayers: portablePrayers,
      events: portableEvents,
    });
  } else if (kind === 'event') {
    const event = await db.events.get(id);
    if (!event) throw new Error('Prayer event not found.');

    const prayer = await db.prayers.get(event.prayerId);
    const requestor = prayer
      ? await db.requestors.get(prayer.requestorId)
      : null;
    const category = requestor
      ? await db.categories.get(requestor.categoryId)
      : null;

    const [portableCategories, portableRequestors, portablePrayers, portableEvents] =
      await Promise.all([
        ensurePortableRecords(
          db.categories,
          'categories',
          category ? [category] : [],
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.requestors,
          'requestors',
          requestor ? [requestor] : [],
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.prayers,
          'prayers',
          prayer ? [prayer] : [],
          sourceDatabaseId
        ),
        ensurePortableRecords(
          db.events,
          'events',
          [event],
          sourceDatabaseId
        ),
      ]);

    selectedRecord = portableEvents[0];
    payload = buildPortablePayload({
      sourceDatabaseId,
      selection: {
        kind,
        sourceId: event.id,
        label: selectionName(kind, event),
      },
      categories: portableCategories,
      requestors: portableRequestors,
      prayers: portablePrayers,
      events: portableEvents,
    });
  } else if (kind === 'journal') {
    const entry = await db.journalEntries.get(id);
    if (!entry) throw new Error('Journal entry not found.');

    const portableEntries = await ensurePortableRecords(
      db.journalEntries,
      'journalEntries',
      [entry],
      sourceDatabaseId
    );

    selectedRecord = portableEntries[0];
    payload = buildPortablePayload({
      sourceDatabaseId,
      selection: {
        kind,
        sourceId: entry.id,
        label: selectionName(kind, entry),
      },
      journalEntries: portableEntries,
    });
  } else {
    throw new Error(`Unsupported export type: ${kind}`);
  }

  const label = sanitizeFilePart(
    selectionName(kind, selectedRecord),
    `${kind}-export`
  );
  const clearName = `closet-prayer-${kind}-${label}.graft.json`;
  const clearText = JSON.stringify(payload, null, 2);

  return encryptExportText(clearText, clearName);
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------
async function createPortableIndex(table) {
  const rows = await table.toArray();
  const index = new Map();

  for (const row of rows) {
    if (row?.portableId) {
      index.set(row.portableId, row);
    }
  }

  return index;
}

async function upsertPortableRecords({
  table,
  tableName,
  items,
  sourceDatabaseId,
  localDatabaseId,
  parentField = null,
  parentMap = null,
}) {
  const sourceToTarget = new Map();
  const portableIndex = await createPortableIndex(table);

  for (const sourceItem of items) {
    if (sourceItem?.id == null) continue;

    const portableId =
      sourceItem.portableId ||
      makePortableId(sourceDatabaseId, tableName, sourceItem.id);
    let existing = portableIndex.get(portableId) || null;

    // Importing a graft back into its original database should update the
    // original record instead of cloning it. This also seeds portableId there.
    if (!existing && sourceDatabaseId === localDatabaseId) {
      existing = (await table.get(sourceItem.id)) || null;
    }

    const record = {
      ...sourceItem,
      portableId,
    };
    delete record.id;

    if (parentField) {
      const mappedParentId = parentMap?.get(
        toMapKey(sourceItem[parentField])
      );

      if (mappedParentId == null) {
        throw new Error(
          `Portable import is missing the parent required by ${tableName}.`
        );
      }

      record[parentField] = mappedParentId;
    }

    let targetId;

    if (existing) {
      targetId = existing.id;
      await table.put({
        ...existing,
        ...record,
        id: targetId,
      });
    } else {
      targetId = await table.add(record);
      const created = {
        ...record,
        id: targetId,
      };
      portableIndex.set(portableId, created);
    }

    sourceToTarget.set(toMapKey(sourceItem.id), targetId);
  }

  return sourceToTarget;
}

async function importPortableGraft(jsonObject) {
  const data = jsonObject?.data || {};
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const requestors = Array.isArray(data.requestors) ? data.requestors : [];
  const prayers = Array.isArray(data.prayers) ? data.prayers : [];
  const events = Array.isArray(data.events) ? data.events : [];
  const journalEntries = Array.isArray(data.journalEntries)
    ? data.journalEntries
    : [];
  const sourceDatabaseId =
    jsonObject.sourceDatabaseId || `legacy-graft-${jsonObject.exportedAt || 'unknown'}`;
  const localDatabaseId = getOrCreateDatabaseTransferId();
  const tables = [
    db.categories,
    db.requestors,
    db.prayers,
    db.events,
    db.journalEntries,
  ];

  let categoryMap;
  let requestorMap;
  let prayerMap;

  await db.transaction('rw', ...tables, async () => {
    categoryMap = await upsertPortableRecords({
      table: db.categories,
      tableName: 'categories',
      items: categories,
      sourceDatabaseId,
      localDatabaseId,
    });

    requestorMap = await upsertPortableRecords({
      table: db.requestors,
      tableName: 'requestors',
      items: requestors,
      sourceDatabaseId,
      localDatabaseId,
      parentField: 'categoryId',
      parentMap: categoryMap,
    });

    prayerMap = await upsertPortableRecords({
      table: db.prayers,
      tableName: 'prayers',
      items: prayers,
      sourceDatabaseId,
      localDatabaseId,
      parentField: 'requestorId',
      parentMap: requestorMap,
    });

    await upsertPortableRecords({
      table: db.events,
      tableName: 'events',
      items: events,
      sourceDatabaseId,
      localDatabaseId,
      parentField: 'prayerId',
      parentMap: prayerMap,
    });

    await upsertPortableRecords({
      table: db.journalEntries,
      tableName: 'journalEntries',
      items: journalEntries,
      sourceDatabaseId,
      localDatabaseId,
    });
  });

  return {
    portable: true,
    selection: jsonObject.selection || null,
    counts: {
      categories: categories.length,
      requestors: requestors.length,
      prayers: prayers.length,
      events: events.length,
      journalEntries: journalEntries.length,
    },
  };
}

// ---------------------------------------------------------------------------
// JSON import
// ---------------------------------------------------------------------------
export async function importFromJsonBackup(jsonObject, mode = 'merge') {
  if (isPortableGraft(jsonObject)) {
    if (mode === 'replace') {
      throw new Error(
        'Portable branch exports must be imported with Merge, not Replace.'
      );
    }

    return importPortableGraft(jsonObject);
  }

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

    const result = await importFromJsonBackup(
      clearObject,
      options.mode || 'merge'
    );

    return {
      encrypted: true,
      imported: true,
      result,
    };
  }

  const result = await importFromJsonBackup(
    parsed,
    options.mode || 'merge'
  );

  return {
    encrypted: false,
    imported: true,
    result,
  };
}
