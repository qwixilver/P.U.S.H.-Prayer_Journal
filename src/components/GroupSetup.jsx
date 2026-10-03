import React, { useState } from 'react';
import QrMatrix from './QrMatrix';
import { groupInvitationLink, newGroupId, randomGroupToken } from '../utils/groupProtocol';

export default function GroupSetup() {
  const [name, setName] = useState('');
  const [config, setConfig] = useState(null);
  const [endpoint, setEndpoint] = useState('');
  const [links, setLinks] = useState(null);
  const [error, setError] = useState('');
  const [qr, setQr] = useState('');

  function createSetup() {
    setError('');
    if (!name.trim()) { setError('Enter the church or group name.'); return; }
    setConfig({ version: 1, name: name.trim(), groupId: newGroupId(),
      memberToken: randomGroupToken(), submissionToken: randomGroupToken() });
    setLinks(null);
  }

  function createLinks() {
    try {
      const base = { version: 1, groupId: config.groupId, endpoint: endpoint.trim() };
      setLinks({
        member: groupInvitationLink({ ...base, scope: 'member', token: config.memberToken }),
        submit: groupInvitationLink({ ...base, scope: 'submit', token: config.submissionToken }),
      });
      setError('');
    } catch (err) { setError(err.message); }
  }

  return (
    <details className="rounded-lg bg-gray-800 p-4 shadow">
      <summary className="cursor-pointer font-semibold">Set up a church-owned group (pilot)</summary>
      <div className="mt-4 space-y-3 text-sm text-gray-300">
        <p>Use a private Google Sheet in your church's account. The administrator installs the supplied script and approves submissions there.</p>
        <a className="text-yellow-300 underline" href="https://github.com/qwixilver/P.U.S.H.-Prayer_Journal/blob/main/docs/groups.md" target="_blank" rel="noreferrer">Google Sheets setup instructions</a>
        <p>The setup code contains private access keys. Keep this screen open until setup is finished, and keep a private copy of the code for recovery. Only the member invitation is for members; only the submission link belongs on a public website.</p>
        {!config ? <>
          <label className="block">Church or group name
            <input maxLength={120} value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded bg-gray-700 p-2 text-white" />
          </label>
          <button type="button" onClick={createSetup} className="rounded bg-blue-600 px-3 py-2 text-white">Create setup code</button>
        </> : <>
          <label className="block">1. Run Configure group in your spreadsheet and paste this private setup code.
            <textarea readOnly rows={7} value={JSON.stringify(config, null, 2)} className="mt-2 w-full rounded bg-gray-900 p-2 font-mono text-xs" onFocus={e => e.target.select()} />
          </label>
          <label className="block">2. Deploy the script, then enter its web address here.
            <input value={endpoint} onChange={e => { setEndpoint(e.target.value); setLinks(null); setQr(''); }} placeholder="https://script.google.com/macros/s/.../exec" className="mt-2 w-full rounded bg-gray-700 p-2 text-white" />
          </label>
          <button type="button" onClick={createLinks} className="rounded bg-blue-600 px-3 py-2 text-white">Create invitations</button>
        </>}
        {error && <p role="alert" className="text-red-300">{error}</p>}
        {links && <>
          {[['member', 'Private member invitation'], ['submit', 'Public submission link']].map(([key, label]) => (
            <div key={key} className="space-y-2 rounded border border-gray-600 p-3">
              <label className="block font-semibold">{label}
                <textarea readOnly rows={3} value={links[key]} onFocus={e => e.target.select()} className="mt-2 w-full rounded bg-gray-900 p-2 text-xs font-normal" />
              </label>
              <button type="button" onClick={() => setQr(qr === key ? '' : key)} className="rounded bg-gray-600 px-3 py-2 text-white">{qr === key ? 'Hide QR' : 'Show QR'}</button>
              {qr === key && <QrMatrix value={links[key]} className="!w-full !max-w-[420px]" />}
            </div>
          ))}
          <label className="block">Church website embed (submissions only)
            <textarea readOnly rows={3} className="mt-2 w-full rounded bg-gray-900 p-2 font-mono text-xs" onFocus={e => e.target.select()}
              value={`<iframe src="${links.submit}" title="Submit a prayer request" width="100%" height="850" style="border:0" referrerpolicy="no-referrer"></iframe>`} />
          </label>
          <p>Join with the private invitation to verify the deployment before giving it to members. Anyone holding that invitation can read the group's approved prayers.</p>
        </>}
      </div>
    </details>
  );
}
