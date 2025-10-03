// src/components/JournalEditForm.jsx
// Edit form for an existing journal entry with Delete support.
// Props: entry (required), onSuccess(), onCancel()

import React, { useState } from 'react';
import { db, emitDbChanged } from '../db';

export default function JournalEditForm({ entry, onSuccess, onCancel }) {
  const [title, setTitle] = useState(entry.title || '');
  const [text, setText] = useState(entry.text || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave(e) {
    e?.preventDefault?.();
    setErr('');
    if (!text.trim()) {
      setErr('Entry text is required.');
      return;
    }
    try {
      setBusy(true);
      await db.journalEntries.update(entry.id, {
        title: title.trim() || null,
        text: text.trim(),
        updatedAt: new Date().toISOString(),
      });
      emitDbChanged();
      onSuccess?.();
    } catch (e2) {
      console.error('Journal update failed', e2);
      setErr('Failed to save. See console.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this journal entry? This cannot be undone.')) return;
    try {
      setBusy(true);
      await db.journalEntries.delete(entry.id);
      emitDbChanged();
      onSuccess?.();
    } catch (e2) {
      console.error('Journal delete failed', e2);
      alert('Failed to delete. See console.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="bg-gray-700 rounded p-3">
      <h5 className="text-white font-semibold mb-2">Edit Journal Entry</h5>

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
          rows={8}
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
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 rounded bg-gray-600 hover:bg-gray-500 text-white"
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="ml-auto px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white"
          disabled={busy}
        >
          Delete
        </button>
      </div>
    </form>
  );
}
