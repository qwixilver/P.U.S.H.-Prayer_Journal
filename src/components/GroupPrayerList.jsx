import React, { useEffect, useState } from 'react';
import { db } from '../db';
import { groups, groupPrayerPayload } from '../utils/groups';
import { createPayloadShareFrames } from '../utils/qrShare';
import { downloadJson } from '../utils/backup';
import QrMatrix from './QrMatrix';

export default function GroupPrayerList({ isSecurity, filters }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [prayers, setPrayers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [transfer, setTransfer] = useState(null);
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [g, p] = await Promise.all([db.groups.toArray(), db.groupPrayers.toArray()]);
        if (!active) return;
        setSubscriptions(g); setPrayers(p);
        setTransfer(current => current && p.some(row => row.groupKey === current.groupKey &&
          row.id === current.prayerId && row.visibility === 'shareable') ? current : null);
      } catch { if (active) setError('Unable to load group requests.'); }
    };
    load();
    window.addEventListener('db:changed', load);
    return () => { active = false; window.removeEventListener('db:changed', load); };
  }, []);

  useEffect(() => {
    if (!transfer || paused || transfer.frames.length < 2) return undefined;
    const timer = setInterval(() => setFrame(value => (value + 1) % transfer.frames.length), 650);
    return () => clearInterval(timer);
  }, [transfer, paused]);

  async function share(prayer, qr) {
    setBusy(true); setError('');
    try {
      const payload = await groupPrayerPayload(prayer.groupKey, prayer.id);
      if (qr) {
        const result = await createPayloadShareFrames(payload);
        setFrame(0); setPaused(false);
        setTransfer({ ...result, groupKey: prayer.groupKey, prayerId: prayer.id });
      } else downloadJson(JSON.stringify(payload, null, 2), 'group-prayer.graft.json');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function toggle(prayer) {
    try { await groups.setSecurity(prayer.groupKey, prayer.id, !prayer.security); }
    catch (err) { setError(err.message); }
  }

  return <>
    {subscriptions.map(group => {
      const rows = prayers.filter(row => row.groupKey === group.id && (isSecurity
        ? row.security && row.visibility === 'shareable'
        : row.status === 'answered' ? filters.showAnswered : filters.showRequested));
      if (!rows.length) return null;
      return <section key={group.id} className="mb-6 space-y-3">
        <div>
          <h3 className="break-words text-lg font-semibold">{group.name} <span className="text-xs text-yellow-300">Group</span></h3>
          <p className="text-xs text-gray-400">Last synchronized: {new Date(group.lastSyncAt).toLocaleString()}</p>
          {group.error && <p className="text-xs text-amber-200">Updates unavailable. Showing the last downloaded requests.</p>}
        </div>
        <ul className="space-y-3">{rows.map(prayer => <li key={prayer.id} className="space-y-3 rounded-lg bg-gray-800 p-3 shadow">
          <div className="min-w-0 break-words">
            <h4 className="font-semibold">{prayer.name}</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-300">{prayer.description}</p>
            <p className="mt-2 text-xs text-gray-400">{prayer.requestor || 'Group request'} &bull; {new Date(prayer.requestedAt).toLocaleDateString()} &bull; {prayer.status === 'answered' ? 'Answered' : 'Requested'}</p>
          </div>
          {prayer.visibility === 'group-only' ? <p className="text-xs text-amber-200">Group only. Sharing and export are disabled.</p> : <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => toggle(prayer)} className="rounded bg-gray-600 px-2 py-1 text-sm">{prayer.security ? 'Remove from Security' : 'Add to Security'}</button>
            {isSecurity && <>
              <button type="button" disabled={busy} onClick={() => share(prayer, true)} className="rounded bg-purple-600 px-2 py-1 text-sm disabled:opacity-50">Share QR</button>
              <button type="button" disabled={busy} onClick={() => share(prayer, false)} className="rounded bg-emerald-700 px-2 py-1 text-sm disabled:opacity-50">Export</button>
            </>}
          </div>}
        </li>)}</ul>
      </section>;
    })}
    {error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
    {busy && <p role="status" className="mb-4 text-sm text-gray-300">Checking the group's latest sharing permission...</p>}
    {transfer && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-label="Share group prayer">
      <div className="max-h-[94vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl bg-gray-900 p-4">
        <h2 className="text-lg font-semibold">Share group prayer</h2>
        <p className="text-sm text-amber-200">This prayer is approved for sharing. Anyone who scans this code can read it.</p>
        <QrMatrix value={transfer.frames[frame]} className="!w-full !max-w-[480px]" />
        <p className="text-center text-sm">Frame {frame + 1} of {transfer.frames.length}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPaused(!paused)} className="rounded bg-gray-700 px-3 py-2">{paused ? 'Play' : 'Pause'}</button>
          <button type="button" onClick={() => { setPaused(true); setFrame((frame + 1) % transfer.frames.length); }} className="rounded bg-gray-700 px-3 py-2">Next frame</button>
          <button type="button" onClick={() => setTransfer(null)} className="rounded bg-blue-600 px-3 py-2">Close</button>
        </div>
      </div>
    </div>}
  </>;
}
