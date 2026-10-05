import React, { useEffect, useState } from 'react';
import { db } from '../db';
import { groups } from '../utils/groups';
import { parseGroupInvitation } from '../utils/groupProtocol';
import PrayerQrScannerModal from './PrayerQrScannerModal';
import GroupSubmissionPage from './GroupSubmissionPage';

export default function GroupsPage({ invitation = '', onBack, onInvitationConsumed }) {
  const [input, setInput] = useState(invitation);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scan, setScan] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submissionGroup, setSubmissionGroup] = useState('');

  useEffect(() => {
    if (invitation) { setInput(invitation); setConsent(false); onInvitationConsumed?.(); }
  }, [invitation, onInvitationConsumed]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const result = await db.groups.toArray(); if (active) setRows(result); }
      catch { if (active) setError('Unable to read local group subscriptions.'); }
    };
    load();
    window.addEventListener('db:changed', load);
    return () => { active = false; window.removeEventListener('db:changed', load); };
  }, []);

  async function run(key, action) {
    setBusy(key); setError(''); setMessage('');
    try { await action(); } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }

  function acceptScan(raw) {
    parseGroupInvitation(raw, 'member');
    setInput(raw); setConsent(false); setScan(false);
  }

  if (submissionGroup) return <GroupSubmissionPage key={submissionGroup} groupKey={submissionGroup} onBack={() => setSubmissionGroup('')} />;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Prayer groups</h2>
        <button type="button" onClick={onBack} className="rounded bg-gray-700 px-3 py-2">Back to Settings</button>
      </div>
      <p className="text-sm text-gray-300">Connect directly to your church. Approved prayers stay available offline. Personal prayers and journals are never uploaded when you join.</p>
      <form className="space-y-3 rounded-lg bg-gray-800 p-4" onSubmit={e => {
        e.preventDefault();
        if (!consent) return;
        run('join', async () => {
          const group = await groups.join(input);
          setInput(''); setConsent(false); setMessage(`Joined ${group.name}.`);
        });
      }}>
        <label className="block text-sm font-semibold">Member invitation link or connection code
          <textarea required rows={3} value={input} onChange={e => { setInput(e.target.value); setConsent(false); }} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="mt-2 w-full rounded bg-gray-700 p-2 font-normal text-white" />
        </label>
        <p className="text-sm text-amber-200">This connects to a Google service controlled by the group administrator. Group requests and the access key are stored on this device outside Private Vault. The administrator and Google can access the hosted data. Keep private invitations confidential.</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1" />
          <span>I trust this invitation and understand how group data is stored.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button disabled={Boolean(busy) || !consent} className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50">{busy === 'join' ? 'Connecting...' : 'Join group'}</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => setScan(true)} className="rounded bg-gray-600 px-4 py-2 disabled:opacity-50">Scan invitation QR</button>
        </div>
      </form>
      {message && <p role="status" className="text-emerald-300">{message}</p>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Your groups</h3>
        {!rows.length && <p className="text-sm text-gray-400">No groups joined yet.</p>}
        {rows.map(group => <article key={group.id} className="space-y-2 rounded-lg bg-gray-800 p-4">
          <h4 className="break-words font-semibold">{group.name}</h4>
          <p className="text-xs text-gray-400">Last synchronized: {group.lastSyncAt ? new Date(group.lastSyncAt).toLocaleString() : 'Never'}</p>
          {group.error && <p className="text-sm text-amber-200">{group.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => run(group.id, () => groups.sync(group.id))} className="rounded bg-blue-600 px-3 py-2 text-sm disabled:opacity-50">{busy === group.id ? 'Synchronizing...' : 'Sync now'}</button>
            <button type="button" disabled={Boolean(busy) || group.accessDenied} onClick={() => setSubmissionGroup(group.id)} className="rounded bg-emerald-700 px-3 py-2 text-sm disabled:opacity-50">Submit a prayer</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => {
              if (window.confirm(`Leave ${group.name} and remove its downloaded prayers from this device?`)) run('leave', () => groups.leave(group.id));
            }} className="rounded bg-gray-600 px-3 py-2 text-sm disabled:opacity-50">Leave group</button>
          </div>
        </article>)}
        <p className="text-xs text-gray-400">Groups check for updates when the app is open and an update is due (once every 24 hours). Offline devices retry later. Personal backups exclude group data and access keys; rejoin after restoring.</p>
      </section>
      <p className="text-sm text-gray-400">Setting up or administering a church group? Use the <a href="https://console.closetprayer.com/" target="_blank" rel="noopener noreferrer" className="text-yellow-300 underline">administrator console</a>. This app is for joining groups and submitting prayers.</p>
      {scan && <PrayerQrScannerModal groupOnly onGroupInvitation={acceptScan} onClose={() => setScan(false)} />}
    </div>
  );
}
