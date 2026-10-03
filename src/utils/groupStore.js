import { callGroupService, groupLocalId, newGroupId, parseGroupInvitation, validateGroupResponse } from './groupProtocol.js';

const DAY = 24 * 60 * 60 * 1000;
const RETRY = 15 * 60 * 1000;

export function createGroupStore(database, notify = () => {}, request = callGroupService) {
  const pending = new Map();

  async function writeSnapshot(group, snapshot) {
    if (snapshot.unchanged) return;
    const existing = await database.groupPrayers.where('groupKey').equals(group.id).toArray();
    const securityIds = new Set(existing.filter(row => row.security).map(row => row.id));
    const rows = snapshot.prayers.map(row => ({ ...row, groupKey: group.id,
      security: row.visibility === 'shareable' && securityIds.has(row.id) }));
    await database.groupPrayers.where('groupKey').equals(group.id).delete();
    if (rows.length) await database.groupPrayers.bulkPut(rows);
  }

  async function join(rawInvitation) {
    const invitation = parseGroupInvitation(rawInvitation, 'member');
    const snapshot = validateGroupResponse(await request(invitation, 'sync'), invitation);
    const now = Date.now();
    const group = { ...invitation, id: groupLocalId(invitation), name: snapshot.group.name,
      revision: snapshot.revision, lastSyncAt: now, nextSyncAt: now + DAY,
      generation: newGroupId(), error: '', accessDenied: false };
    await database.transaction('rw', database.groups, database.groupPrayers, async () => {
      await writeSnapshot(group, snapshot);
      await database.groups.put(group);
    });
    notify();
    return group;
  }

  async function performSync(id) {
    const group = await database.groups.get(id);
    if (!group) return;
    try {
      const snapshot = validateGroupResponse(
        await request(group, 'sync', { revision: group.revision }), group, group.revision
      );
      await database.transaction('rw', database.groups, database.groupPrayers, async () => {
        const current = await database.groups.get(id);
        // An old response cannot undo Leave, rejoining, or a newer sync from another tab.
        if (!current || current.generation !== group.generation) return;
        await writeSnapshot(group, snapshot);
        const now = Date.now();
        await database.groups.update(id, { name: snapshot.group.name, revision: snapshot.revision,
          lastSyncAt: now, nextSyncAt: now + DAY, generation: newGroupId(),
          error: '', accessDenied: false });
      });
      notify();
    } catch (error) {
      await database.transaction('rw', database.groups, database.groupPrayers, async () => {
        const current = await database.groups.get(id);
        if (!current || current.generation !== group.generation) return;
        const accessDenied = error.code === 'access-denied';
        if (accessDenied) await database.groupPrayers.where('groupKey').equals(id).delete();
        await database.groups.update(id, { error: error.message, accessDenied,
          generation: newGroupId(), revision: accessDenied ? '' : current.revision,
          nextSyncAt: Date.now() + RETRY });
      });
      notify();
      throw error;
    }
  }

  function sync(id) {
    if (!pending.has(id)) pending.set(id, performSync(id).finally(() => pending.delete(id)));
    return pending.get(id);
  }

  async function syncDue() {
    for (const group of await database.groups.toArray()) {
      if (group.accessDenied || group.nextSyncAt > Date.now()) continue;
      try { await sync(group.id); } catch { /* The group stores its error for Settings. */ }
    }
  }

  async function leave(id) {
    await database.transaction('rw', database.groups, database.groupPrayers, async () => {
      await database.groups.delete(id);
      await database.groupPrayers.where('groupKey').equals(id).delete();
    });
    notify();
  }

  async function setSecurity(groupKey, prayerId, enabled) {
    await database.transaction('rw', database.groupPrayers, async () => {
      const row = await database.groupPrayers.get([groupKey, prayerId]);
      if (!row || (enabled && row.visibility !== 'shareable')) throw new Error('This request is restricted to its group.');
      await database.groupPrayers.update([groupKey, prayerId], { security: Boolean(enabled) });
    });
    notify();
  }

  async function shareablePrayer(groupKey, prayerId) {
    // Recheck restrictions and withdrawals before every intentional export.
    await sync(groupKey);
    const group = await database.groups.get(groupKey);
    const prayer = await database.groupPrayers.get([groupKey, prayerId]);
    if (!group || group.accessDenied || !prayer || prayer.visibility !== 'shareable') {
      throw new Error('This request is unavailable or restricted to its group.');
    }
    return { group, prayer };
  }

  return { join, sync, syncDue, leave, setSecurity, shareablePrayer };
}
