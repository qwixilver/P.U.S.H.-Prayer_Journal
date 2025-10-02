// src/components/PrayerEventForm.jsx
// Small, reusable form to add a new timeline event to a prayer.
// Props:
//   - prayerId   (required): number ID of the prayer this event belongs to
//   - onSuccess  (optional): callback after successful add
//   - onCancel   (optional): callback when user cancels
//
// UX notes:
// - Defaults the timestamp to "now" but lets user adjust.
// - Title is optional; note is the main content.
// - Emits `db:changed` so other components refresh.

import React, { useState } from 'react';
import { db, emitDbChanged } from '../db';

export default function PrayerEventForm({ prayerId, onSuccess, onCancel }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  // Use local datetime input; convert to ISO on save
  const [when, setWhen] = useState(() => {
    const d = new Date();
    // yyyy-MM-ddTHH:mm for <input type="datetime-local">
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError('');

    if (!prayerId) {
      setError('Missing prayer.');
      return;
    }
    if (!note.trim()) {
      setError('Please enter a note for this event.');
      return;
    }

    try {
      setBusy(true);
      const createdAt = new Date(when).toISOString();

      await db.events.add({
        prayerId,
        createdAt,
        title: title.trim() || null,
        note: note.trim(),
      });

      emitDbChanged();
      if (typeof onSuccess === 'function') onSuccess();
      // Reset form if kept open
      setTitle('');
      setNote('');
    } catch (err) {
      console.error('add event failed', err);
      setError('Failed to add event (see console).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-700 rounded p-3">
      <h5 className="text-white font-semibold mb-2">Add Event</h5>

      {/* When */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">When</label>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Title (optional) */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Title (optional)</label>
        <input
          type="text"
          value={title}
          placeholder="e.g., Update from doctor"
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Note (required) */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Describe what happened…"
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && <p className="text-red-300 text-sm mb-2">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save Event'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white"
            disabled={busy}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
