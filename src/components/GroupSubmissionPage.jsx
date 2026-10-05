import React, { useEffect, useRef, useState } from 'react';
import { callGroupService, newGroupId, parseGroupInvitation, validateGroupEnvelope } from '../utils/groupProtocol';
import { groups } from '../utils/groups';

export default function GroupSubmissionPage({ invitation, groupKey, onBack }) {
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const pendingRequest = useRef(null);
  const [fields, setFields] = useState({ name: '', description: '', requestor: '', contact: '', website: '' });
  const [shareable, setShareable] = useState(false);
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const invite = groupKey ? null : parseGroupInvitation(invitation, 'submit');
        const group = groupKey ? await groups.submissionInfo(groupKey)
          : validateGroupEnvelope(await callGroupService(invite, 'submit-info'), invite);
        if (active) setGroupName(group.name);
      } catch (err) { if (active) setError(err.message); }
    };
    load();
    return () => { active = false; };
  }, [invitation, groupKey]);

  async function submit(event) {
    event.preventDefault();
    if (!consent || !groupName || busy) return;
    setBusy(true); setError('');
    try {
      const submission = {
        ...fields, visibility: shareable ? 'shareable' : 'group-only', consent: true,
      };
      const fingerprint = JSON.stringify(submission);
      if (pendingRequest.current?.fingerprint !== fingerprint) {
        pendingRequest.current = { fingerprint, id: newGroupId() };
      }
      let result;
      if (groupKey) result = await groups.submit(groupKey, submission, pendingRequest.current.id);
      else {
        const invite = parseGroupInvitation(invitation, 'submit');
        result = await callGroupService(invite, 'submit', { requestId: pendingRequest.current.id, submission });
        validateGroupEnvelope(result, invite);
      }
      if (result.accepted !== true) throw new Error('Your request was not accepted. Please try again later.');
      setSent(true); setFields({ name: '', description: '', requestor: '', contact: '', website: '' });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl p-5 text-white">
      <h1 className="text-2xl font-bold">Submit a prayer request</h1>
      {onBack && <button type="button" onClick={onBack} className="mt-3 rounded bg-gray-700 px-3 py-2">Back to groups</button>}
      <p className="mt-2 text-yellow-300">{groupName || 'Connecting to the group...'}</p>
      {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
      {sent ? <p role="status" className="mt-5 rounded bg-gray-800 p-4">Your request has been sent to the group administrator for review.</p> : <form onSubmit={submit} className="mt-5 space-y-4">
        {[['name', 'Prayer title', 200, true], ['requestor', 'Name to display (optional)', 120, false], ['contact', 'Contact details for the administrator (optional)', 200, false]].map(([key, label, maxLength, required]) => (
          <label key={key} className="block text-sm">{label}
            <input value={fields[key]} required={required} maxLength={maxLength} onChange={e => setFields({ ...fields, [key]: e.target.value })} className="mt-1 w-full rounded bg-gray-700 p-2" />
          </label>
        ))}
        <label className="block text-sm">Prayer request
          <textarea required rows={5} maxLength={10000} value={fields.description} onChange={e => setFields({ ...fields, description: e.target.value })} className="mt-1 w-full rounded bg-gray-700 p-2" />
        </label>
        <label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={fields.website} onChange={e => setFields({ ...fields, website: e.target.value })} /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={shareable} onChange={e => setShareable(e.target.checked)} className="mt-1" /><span>Allow members to share this prayer outside the group. Leave unchecked for group only.</span></label>
        <p className="text-sm text-gray-300">The church stores submissions in its Google account. The administrator and Google can access them. Approved wording is sent to group members' devices for offline use. Contact details stay with the administrator. Group-only restrictions block the app's sharing tools, but cannot prevent screenshots or copying.</p>
        <label className="flex items-start gap-2 text-sm"><input required type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1" /><span>I agree to this request being reviewed and, if approved, shared with the group under the preference above.</span></label>
        <button disabled={!groupName || !consent || busy} className="rounded bg-blue-600 px-4 py-3 font-semibold disabled:opacity-50">{busy ? 'Sending...' : 'Send for review'}</button>
      </form>}
    </div>
  );
}
