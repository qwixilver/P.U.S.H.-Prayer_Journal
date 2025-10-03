// src/components/PrayerForm.jsx
// Unified form for CREATE and EDIT of prayers.
// - If props.initialPrayer is provided, acts as EDIT; otherwise CREATE.
// - Includes category -> requestor cascading select, title/description, dates, status, security.
// - On submit (create): adds a new prayer.
// - On submit (edit): updates the existing prayer by id (does NOT touch events).
//
// Props:
//   initialPrayer?: {
//     id, requestorId, name, description, requestedAt, answeredAt, status, security
//   }
//   onSuccess?: () => void
//   onCancel?: () => void
//
// Notes:
// - Fully compatible with existing "add" usage on the Daily tab (no props needed except onSuccess/onCancel).
// - For EDIT, we pre-populate categoryId by looking up the prayer's requestor's category.

import React, { useEffect, useMemo, useState } from 'react';
import { db, emitDbChanged } from '../db';

export default function PrayerForm({ initialPrayer, onSuccess, onCancel }) {
  const isEdit = Boolean(initialPrayer?.id);

  // Data sources
  const [categories, setCategories] = useState([]);
  const [allRequestors, setAllRequestors] = useState([]);

  // Form state
  const [categoryId, setCategoryId] = useState(null);
  const [requestorId, setRequestorId] = useState(null);
  const [name, setName] = useState(isEdit ? (initialPrayer.name || '') : '');
  const [description, setDescription] = useState(isEdit ? (initialPrayer.description || '') : '');
  const [requestedAt, setRequestedAt] = useState(
    isEdit
      ? (initialPrayer.requestedAt ? initialPrayer.requestedAt.slice(0, 10) : new Date().toISOString().slice(0, 10))
      : new Date().toISOString().slice(0, 10)
  );
  const [status, setStatus] = useState(isEdit ? initialPrayer.status || 'requested' : 'requested');
  const [answeredAt, setAnsweredAt] = useState(
    isEdit && initialPrayer.answeredAt ? initialPrayer.answeredAt.slice(0, 10) : ''
  );
  const [security, setSecurity] = useState(isEdit ? Boolean(initialPrayer.security) : false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Load categories + requestors once
  useEffect(() => {
    (async () => {
      const [cats, reqs] = await Promise.all([db.categories.toArray(), db.requestors.toArray()]);
      setCategories(cats);
      setAllRequestors(reqs);

      // If editing, derive initial category from the prayer's requestor
      if (isEdit && initialPrayer.requestorId) {
        const req = reqs.find((r) => r.id === initialPrayer.requestorId);
        if (req?.categoryId) {
          setCategoryId(req.categoryId);
          setRequestorId(initialPrayer.requestorId);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, initialPrayer?.requestorId]);

  // Filtered requestors by selected category
  const requestors = useMemo(() => {
    if (!categoryId) return [];
    return allRequestors.filter((r) => r.categoryId === Number(categoryId));
  }, [allRequestors, categoryId]);

  // If category changes and current requestor doesn't belong, clear it
  useEffect(() => {
    if (requestorId == null) return;
    const ok = requestors.some((r) => r.id === Number(requestorId));
    if (!ok) setRequestorId(null);
  }, [requestors, requestorId]);

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setErr('');

    // Validation
    if (!categoryId) return setErr('Please choose a category.');
    if (!requestorId) return setErr('Please choose a requestor.');
    if (!name.trim()) return setErr('Please enter a title.');
    if (!requestedAt) return setErr('Please choose the requested date.');

    setBusy(true);
    try {
      if (isEdit) {
        // EDIT: Update existing prayer by id. Do NOT touch events.
        await db.prayers.update(initialPrayer.id, {
          requestorId: Number(requestorId),
          name: name.trim(),
          description: description.trim(),
          requestedAt: requestedAt,
          answeredAt: status === 'answered' ? (answeredAt || new Date().toISOString().slice(0, 10)) : null,
          status,
          security: security ? 1 : 0,
        });
      } else {
        // CREATE: Add a new prayer
        await db.prayers.add({
          requestorId: Number(requestorId),
          name: name.trim(),
          description: description.trim(),
          requestedAt,
          answeredAt: status === 'answered' ? answeredAt || new Date().toISOString().slice(0, 10) : null,
          status,
          security: security ? 1 : 0,
        });
      }
      emitDbChanged();
      onSuccess?.();
      if (!isEdit) {
        // reset only in "add" mode
        setRequestorId(null);
        setCategoryId(null);
        setName('');
        setDescription('');
        setRequestedAt(new Date().toISOString().slice(0, 10));
        setAnsweredAt('');
        setStatus('requested');
        setSecurity(false);
      }
    } catch (e2) {
      console.error('Prayer save failed', e2);
      setErr('Failed to save. See console for details.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-gray-700 rounded-lg">
      <h4 className="text-white font-semibold mb-3">{isEdit ? 'Edit Prayer' : 'Add Prayer'}</h4>

      {/* Category */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Category</label>
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="" disabled>Select a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Requestor */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Requestor</label>
        <select
          value={requestorId ?? ''}
          onChange={(e) => setRequestorId(e.target.value ? Number(e.target.value) : null)}
          disabled={!categoryId}
          className="w-full p-2 bg-gray-600 text-white rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="" disabled>{categoryId ? 'Select a requestor…' : 'Choose a category first'}</option>
          {requestors.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Title</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Description */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Details</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Requested date */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Requested date</label>
        <input
          type="date"
          value={requestedAt}
          onChange={(e) => setRequestedAt(e.target.value)}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Status + answered date */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="requested">Requested</option>
          <option value="answered">Answered</option>
        </select>

        {status === 'answered' && (
          <input
            type="date"
            value={answeredAt}
            onChange={(e) => setAnsweredAt(e.target.value)}
            className="mt-2 w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
      </div>

      {/* Security flag */}
      <div className="flex items-center mb-2">
        <input
          id="pf-security"
          type="checkbox"
          checked={security}
          onChange={(e) => setSecurity(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="pf-security" className="text-gray-200 text-sm">Security Only</label>
      </div>

      {err && <p className="text-red-400 text-sm mb-2">{err}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Prayer')}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
