import { db, emitDbChanged } from '../db';
import { createGroupStore } from './groupStore.js';

export const groups = createGroupStore(db, emitDbChanged);

export function startGroupSync() {
  let timer;
  let stopped = false;
  const schedule = () => {
    clearTimeout(timer);
    if (stopped || document.visibilityState === 'hidden' || !navigator.onLine) return;
    timer = setTimeout(async () => {
      try { await groups.syncDue(); } catch { /* Storage errors cannot interrupt personal use. */ }
      if (!stopped) timer = setTimeout(schedule, 15 * 60 * 1000);
    }, 1000 + Math.random() * 9000);
  };
  schedule();
  window.addEventListener('online', schedule);
  document.addEventListener('visibilitychange', schedule);
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener('online', schedule);
    document.removeEventListener('visibilitychange', schedule);
  };
}

export async function groupPrayerPayload(groupKey, prayerId) {
  const { group, prayer } = await groups.shareablePrayer(groupKey, prayerId);
  const sourceDatabaseId = `group:${group.id}`;
  const updatedAt = new Date(group.lastSyncAt).toISOString();
  const category = { id: 'group', portableId: `${sourceDatabaseId}:category`,
    name: group.name, description: 'Shared group prayers', showSingle: 1, updatedAt };
  const requestor = { id: prayer.id, portableId: `${sourceDatabaseId}:requestor:${prayer.id}`,
    categoryId: category.id, name: prayer.requestor || 'Group request', description: '', security: 0, updatedAt };
  const shared = { id: prayer.id, portableId: `${sourceDatabaseId}:prayer:${prayer.id}`,
    requestorId: requestor.id, name: prayer.name, description: prayer.description,
    requestedAt: prayer.requestedAt, status: prayer.status, security: 0, updatedAt };
  return {
    version: 1, exportedAt: Date.now(), exportType: 'cp/portable-graft', portableExportVersion: 1,
    sourceDatabaseId, selection: { kind: 'prayer', sourceId: prayer.id, label: prayer.name },
    qrShare: { version: 1, scope: 'prayer', prayerName: prayer.name,
      requestorName: requestor.name, categoryName: category.name },
    data: { categories: [category], requestors: [requestor], prayers: [shared], events: [], journalEntries: [] },
  };
}
