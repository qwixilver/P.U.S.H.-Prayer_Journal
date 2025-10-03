// src/components/JournalForm.jsx
// Small form for creating a new personal journal entry.
// Props: onSuccess(), onCancel() (both optional)

import React, { useState } from 'react';
import { db, emitDbChanged } from '../db';

export default function JournalForm({ onSuccess, onCancel }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setErr('');
    if (!text.trim()) {
      setErr('Please write something for your journal entry.');
      return;
    }
    try {
      setBusy(true);
      const now = new Date().toISOString();
      await db.journalEntries.add({
        title: title.trim() || null,
        text: text.trim(),
        createdAt: now,
        updatedAt: now,
      });
      emitDbChanged();
      onSuccess?.();
      setTitle('');
      setText('');
    } catch (e2) {
      console.error('Journal add failed', e2);
      setErr('Failed to save. See console.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-700 rounded p-3">
      <h5 className="text-white font-semibold mb-2">New Journal Entry</h5>

      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Title (optional)</label>
        <input
          type="text"
          value={title}
          placeholder="e.g., Morning reflections"
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Entry</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Write your thoughts, prayers, insights…"
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-pre-wrap"
        />
      </div>

      {err && <p className="text-red-300 text-sm mb-2">{err}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 rounded bg-gray-600 hover:bg-gray-500 text-white"
            disabled={busy}
          >
          Cancel
          </button>
        )}
      </div>
    </form>
  );
}
