// src/components/CategoryEditForm.jsx
// Defensive, self-loading category editor with safe deletion checks.
// The showSingle field remains unchanged internally but is labeled as Focus.

import React, { useEffect, useState } from 'react';
import { db } from '../db';

export default function CategoryEditForm({ categoryId, onCancel, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showSingle, setShowSingle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setLoadError('');
      setMessage('');

      try {
        const category = await db.categories.get(categoryId);
        if (!alive) return;

        if (!category) {
          setLoadError('Category not found.');
          setLoading(false);
          return;
        }

        setName(category.name || '');
        setDescription(category.description || '');
        setShowSingle(Boolean(category.showSingle));
      } catch (error) {
        console.error('CategoryEditForm: load error', error);
        if (alive) setLoadError('Failed to load category.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    if (categoryId == null) {
      setLoadError('No category specified.');
      setLoading(false);
    } else {
      load();
    }

    return () => {
      alive = false;
    };
  }, [categoryId]);

  async function handleSave(event) {
    event?.preventDefault?.();
    setMessage('');

    if (!name.trim()) {
      setMessage('Name is required.');
      return;
    }

    try {
      setBusy(true);
      await db.categories.update(categoryId, {
        name: name.trim(),
        description: description.trim(),
        showSingle: showSingle ? 1 : 0,
      });

      window.dispatchEvent(new Event('db:changed'));
      setMessage('Saved.');

      if (typeof onSuccess === 'function') onSuccess();
    } catch (error) {
      console.error('CategoryEditForm: save error', error);
      setMessage('Save failed (see console).');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setMessage('');

    try {
      const count = await db.requestors
        .where('categoryId')
        .equals(categoryId)
        .count();

      if (count > 0) {
        alert(
          `This category still has ${count} requestor(s).\n\n` +
          'For safety, delete or move those requestors first before deleting the category.'
        );
        return;
      }

      const confirmed = confirm('Delete this category? This cannot be undone.');
      if (!confirmed) return;

      setBusy(true);
      await db.categories.delete(categoryId);

      window.dispatchEvent(new Event('db:changed'));
      setMessage('Category deleted.');

      if (typeof onSuccess === 'function') onSuccess();
    } catch (error) {
      console.error('CategoryEditForm: delete error', error);
      setMessage('Delete failed (see console).');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 bg-gray-700 rounded">
        <p className="text-gray-200">Loading category…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 bg-gray-700 rounded">
        <p className="text-red-300">{loadError}</p>
        <div className="mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="p-4 bg-gray-700 rounded"
    >
      <h4 className="text-white font-semibold mb-3">Edit Category</h4>

      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Family, Urgent"
        />
      </div>

      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Description</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Short description for this category"
        />
      </div>

      <div className="flex items-center mb-3">
        <input
          id="showSingle"
          type="checkbox"
          checked={showSingle}
          onChange={(event) => setShowSingle(event.target.checked)}
          className="mr-2"
        />
        <label htmlFor="showSingle" className="text-gray-200 text-sm">
          Display requests from this category in “Focus”
        </label>
      </div>

      {message && <p className="text-gray-200 text-sm mb-2">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white"
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="ml-auto px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white"
          disabled={busy}
          title="Delete this category (only if it has no requestors)"
        >
          Delete
        </button>
      </div>
    </form>
  );
}
