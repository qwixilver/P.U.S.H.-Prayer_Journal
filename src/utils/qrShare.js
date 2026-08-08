// src/utils/qrShare.js
// QR prayer sharing built on the portable-graft merge format.
// Camera frames and QR payloads stay entirely on-device.

import { db } from '../db';
import { importFromJsonBackup } from './backup';

const PORTABLE_EXPORT_TYPE = 'cp/portable-graft';
const PORTABLE_EXPORT_VERSION = 1;
const DATABASE_TRANSFER_ID_KEY = 'cp:databaseTransferId:v1';
const QR_FRAME_TYPE = 'cpqr';
const QR_FRAME_VERSION = 1;
const QR_SHARE_VERSION = 1;
const QR_CHUNK_SIZE = 700;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function createRandomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

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
    return createRandomId();
  }
}

function makePortableId(sourceDatabaseId, tableName, sourceId) {
  return `${sourceDatabaseId}:${tableName}:${String(sourceId)}`;
}

async function ensurePortableRecord(table, tableName, record, sourceDatabaseId) {
  if (!record) return null;

  const portable = {
    ...record,
    portableId:
      record.portableId ||
      makePortableId(sourceDatabaseId, tableName, record.id),
  };

  if (!record.portableId) {
    await table.put(portable);
  }

  return portable;
}

function makeCategoryStub(category, sourceDatabaseId, fallbackId) {
  const id = category?.id ?? `shared-category-${fallbackId}`;
  return {
    id,
    name: category?.name || 'Shared Prayers',
    description: '',
    showSingle: 0,
    portableId:
      category?.portableId ||
      makePortableId(sourceDatabaseId, 'categories', id),
  };
}

function makeRequestorStub(requestor, categoryId, prayer, sourceDatabaseId, fallbackId) {
  const id = requestor?.id ?? `shared-requestor-${fallbackId}`;
  return {
    id,
    categoryId,
    name: requestor?.name || 'Shared Requestor',
    description: '',
    security: prayer?.security ? 1 : 0,
    archived: false,
    portableId:
      requestor?.portableId ||
      makePortableId(sourceDatabaseId, 'requestors', id),
  };
}

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 8192;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  let base64 = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  while (base64.length % 4) base64 += '=';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function compressBytes(bytes) {
  if (typeof CompressionStream === 'undefined') {
    return { compression: 'none', bytes };
  }

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());

  return { compression: 'gzip', bytes: compressed };
}

async function decompressBytes(bytes, compression) {
  if (compression === 'none') return bytes;

  if (compression !== 'gzip') {
    throw new Error('This QR share uses an unsupported compression format.');
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress this QR share. Please update the browser and try again.');
  }

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function digestBytes(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

function splitText(value, chunkSize) {
  const chunks = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks.length ? chunks : [''];
}


function normalizeName(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

async function findByPortableId(table, portableId) {
  if (!portableId) return null;
  const rows = await table.toArray();
  return rows.find((row) => row?.portableId === portableId) || null;
}

async function findUniqueNameMatch(table, name, predicate = () => true) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  const rows = await table.toArray();
  const matches = rows.filter(
    (row) => normalizeName(row?.name) === normalized && predicate(row)
  );

  return matches.length === 1 ? matches[0] : null;
}

async function prepareQrPayloadForLocalMerge(payload) {
  const prepared = JSON.parse(JSON.stringify(payload));
  const scope = prepared?.qrShare?.scope || 'prayer';
  const incomingCategory = prepared?.data?.categories?.[0] || null;
  const incomingRequestor = prepared?.data?.requestors?.[0] || null;

  let localCategory = null;

  if (incomingCategory) {
    localCategory = await findByPortableId(
      db.categories,
      incomingCategory.portableId
    );

    if (!localCategory) {
      const candidate = await findUniqueNameMatch(
        db.categories,
        incomingCategory.name,
        (row) => !row?.portableId || row.portableId === incomingCategory.portableId
      );

      if (candidate) {
        localCategory = {
          ...candidate,
          portableId: incomingCategory.portableId,
        };
        await db.categories.put(localCategory);
      }
    }

    // A low-detail share should never blank or reconfigure a category that the
    // receiving user already maintains locally. Keep the local fields while
    // retaining the source id/portable id required for relationship remapping.
    if (localCategory && scope !== 'category') {
      prepared.data.categories[0] = {
        ...localCategory,
        id: incomingCategory.id,
        portableId: incomingCategory.portableId,
      };
    }
  }

  if (incomingRequestor) {
    let localRequestor = await findByPortableId(
      db.requestors,
      incomingRequestor.portableId
    );

    if (!localRequestor && localCategory) {
      const candidate = await findUniqueNameMatch(
        db.requestors,
        incomingRequestor.name,
        (row) =>
          row.categoryId === localCategory.id &&
          (!row?.portableId || row.portableId === incomingRequestor.portableId)
      );

      if (candidate) {
        localRequestor = {
          ...candidate,
          portableId: incomingRequestor.portableId,
        };
        await db.requestors.put(localRequestor);
      }
    }

    // Likewise, Prayer-only sharing sends only a requestor routing stub. If a
    // matching requestor already exists locally, preserve their local details.
    if (localRequestor && scope === 'prayer') {
      prepared.data.requestors[0] = {
        ...localRequestor,
        id: incomingRequestor.id,
        categoryId: incomingRequestor.categoryId,
        portableId: incomingRequestor.portableId,
      };
    }
  }

  return prepared;
}

export const QR_SHARE_SCOPES = {
  prayer: {
    label: 'Prayer only',
    description: 'Shares the prayer and its event timeline. Requestor and category names are included only so the receiving app can place the prayer correctly.',
  },
  requestor: {
    label: 'Prayer + requestor',
    description: 'Also shares the requestor details. Only the category name is included for placement.',
  },
  category: {
    label: 'Through category',
    description: 'Shares the prayer, requestor details, and the category details that contain it.',
  },
};

export async function buildPrayerSharePayload(prayerId, scope = 'prayer') {
  if (!QR_SHARE_SCOPES[scope]) throw new Error('Unknown QR sharing level.');

  const prayer = await db.prayers.get(prayerId);
  if (!prayer) throw new Error('Prayer request not found.');

  const sourceDatabaseId = getOrCreateDatabaseTransferId();
  const requestor = prayer.requestorId != null
    ? await db.requestors.get(prayer.requestorId)
    : null;
  const category = requestor?.categoryId != null
    ? await db.categories.get(requestor.categoryId)
    : null;
  const events = await db.events
    .where('prayerId')
    .equals(prayer.id)
    .toArray();

  const portablePrayer = await ensurePortableRecord(
    db.prayers,
    'prayers',
    prayer,
    sourceDatabaseId
  );
  const portableRequestor = requestor
    ? await ensurePortableRecord(
        db.requestors,
        'requestors',
        requestor,
        sourceDatabaseId
      )
    : null;
  const portableCategory = category
    ? await ensurePortableRecord(
        db.categories,
        'categories',
        category,
        sourceDatabaseId
      )
    : null;

  const portableEvents = [];
  for (const event of events) {
    portableEvents.push(
      await ensurePortableRecord(
        db.events,
        'events',
        event,
        sourceDatabaseId
      )
    );
  }

  const categoryRecord = scope === 'category' && portableCategory
    ? portableCategory
    : makeCategoryStub(portableCategory, sourceDatabaseId, prayer.id);

  const requestorRecord = scope !== 'prayer' && portableRequestor
    ? {
        ...portableRequestor,
        categoryId: categoryRecord.id,
      }
    : makeRequestorStub(
        portableRequestor,
        categoryRecord.id,
        prayer,
        sourceDatabaseId,
        prayer.id
      );

  const prayerRecord = {
    ...portablePrayer,
    requestorId: requestorRecord.id,
  };

  const eventRecords = portableEvents.map((event) => ({
    ...event,
    prayerId: prayerRecord.id,
  }));

  return {
    version: 1,
    exportedAt: Date.now(),
    exportType: PORTABLE_EXPORT_TYPE,
    portableExportVersion: PORTABLE_EXPORT_VERSION,
    sourceDatabaseId,
    selection: {
      kind: 'prayer',
      sourceId: prayer.id,
      label: prayer.name || `Prayer ${prayer.id}`,
    },
    qrShare: {
      version: QR_SHARE_VERSION,
      scope,
      prayerName: prayer.name || 'Prayer request',
      requestorName: requestorRecord.name || 'Shared Requestor',
      categoryName: categoryRecord.name || 'Shared Prayers',
    },
    data: {
      categories: [categoryRecord],
      requestors: [requestorRecord],
      prayers: [prayerRecord],
      events: eventRecords,
      journalEntries: [],
    },
  };
}

export async function createPrayerShareFrames(prayerId, scope = 'prayer') {
  const payload = await buildPrayerSharePayload(prayerId, scope);
  const clearBytes = textEncoder.encode(JSON.stringify(payload));
  const compressed = await compressBytes(clearBytes);
  const encoded = bytesToBase64Url(compressed.bytes);
  const chunks = splitText(encoded, QR_CHUNK_SIZE);
  const shareId = createRandomId();
  const hash = await digestBytes(compressed.bytes);

  const frames = chunks.map((chunk, index) =>
    JSON.stringify({
      t: QR_FRAME_TYPE,
      v: QR_FRAME_VERSION,
      s: shareId,
      i: index,
      n: chunks.length,
      c: compressed.compression,
      h: hash,
      d: chunk,
    })
  );

  return {
    payload,
    frames,
    shareId,
    compression: compressed.compression,
    originalBytes: clearBytes.length,
    transferBytes: compressed.bytes.length,
  };
}

export function parseQrShareFrame(rawText) {
  let frame;
  try {
    frame = JSON.parse(rawText);
  } catch {
    throw new Error('This is not a Closet Prayer sharing QR code.');
  }

  if (
    frame?.t !== QR_FRAME_TYPE ||
    frame?.v !== QR_FRAME_VERSION ||
    typeof frame?.s !== 'string' ||
    !Number.isInteger(frame?.i) ||
    !Number.isInteger(frame?.n) ||
    frame.i < 0 ||
    frame.n < 1 ||
    frame.i >= frame.n ||
    typeof frame?.d !== 'string' ||
    typeof frame?.h !== 'string'
  ) {
    throw new Error('This QR code is not a supported Closet Prayer share.');
  }

  return frame;
}

export function collectQrShareFrame(currentAssembly, rawText) {
  const frame = parseQrShareFrame(rawText);
  let assembly = currentAssembly;

  if (!assembly || assembly.shareId !== frame.s) {
    assembly = {
      shareId: frame.s,
      total: frame.n,
      compression: frame.c || 'none',
      hash: frame.h,
      chunks: new Array(frame.n).fill(null),
    };
  }

  if (
    assembly.total !== frame.n ||
    assembly.hash !== frame.h ||
    assembly.compression !== (frame.c || 'none')
  ) {
    throw new Error('QR frames from different shares were mixed together. Restart the scan and try again.');
  }

  assembly.chunks[frame.i] = frame.d;
  const received = assembly.chunks.reduce(
    (count, chunk) => count + (chunk != null ? 1 : 0),
    0
  );

  return {
    assembly,
    received,
    total: assembly.total,
    complete: received === assembly.total,
  };
}

export async function decodeQrShareAssembly(assembly) {
  if (!assembly?.chunks?.length || assembly.chunks.some((chunk) => chunk == null)) {
    throw new Error('The QR share is incomplete.');
  }

  const compressedBytes = base64UrlToBytes(assembly.chunks.join(''));
  const actualHash = await digestBytes(compressedBytes);

  if (actualHash !== assembly.hash) {
    throw new Error('The QR share failed its integrity check. Please scan it again.');
  }

  const clearBytes = await decompressBytes(
    compressedBytes,
    assembly.compression
  );

  let payload;
  try {
    payload = JSON.parse(textDecoder.decode(clearBytes));
  } catch {
    throw new Error('The QR share could not be decoded as JSON.');
  }

  if (
    payload?.exportType !== PORTABLE_EXPORT_TYPE ||
    payload?.qrShare?.version !== QR_SHARE_VERSION ||
    !Array.isArray(payload?.data?.prayers) ||
    payload.data.prayers.length !== 1
  ) {
    throw new Error('The QR data is not a valid Closet Prayer prayer share.');
  }

  return payload;
}

export async function importPrayerSharePayload(payload) {
  const prepared = await prepareQrPayloadForLocalMerge(payload);
  const result = await importFromJsonBackup(prepared, 'merge');
  window.dispatchEvent(new Event('db:changed'));
  return result;
}
