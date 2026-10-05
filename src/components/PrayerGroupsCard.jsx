import React, { useEffect, useRef, useState } from 'react';
import { db } from '../db';
import { groups } from '../utils/groups';

export default function PrayerGroupsCard() {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const running = useRef(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const total = await db.groups.count(); if (active) setCount(total); }
      catch { if (active) setError('Unable to read your groups on this device.'); }
    };
    load();
    window.addEventListener('db:changed', load);
    return () => { active = false; window.removeEventListener('db:changed', load); };
  }, []);

  async function refreshAll() {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage(''); setError('');
    try {
      const result = await groups.syncAll();
      setMessage(result.total ? `Refreshed ${result.refreshed} of ${result.total} groups.` : 'No groups joined yet.');
      if (result.failed) setError(`${result.failed} ${result.failed === 1 ? 'group could' : 'groups could'} not be refreshed. Open Manage groups for details.`);
      else if (result.skipped) setMessage(`Refreshed ${result.refreshed} groups. Other memberships changed during the refresh.`);
    } catch { setError('Unable to refresh your groups. Please try again.'); }
    finally { running.current = false; setBusy(false); }
  }

  return <section className="bg-gray-800 rounded-lg p-4 shadow space-y-3 mb-6">
    <h3 className="text-lg font-semibold">Prayer groups</h3>
    <p className="text-sm text-gray-300">Join a church using its invitation link or QR code, and submit requests to your groups. Group prayers are downloaded for offline use; your personal journal stays on this device.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('ui:nav', { detail: 'groups' }))} className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700">Manage groups</button>
      <button type="button" disabled={busy || !count} onClick={refreshAll} className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-50">{busy ? 'Refreshing groups...' : 'Refresh all groups'}</button>
    </div>
    {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
  </section>;
}
