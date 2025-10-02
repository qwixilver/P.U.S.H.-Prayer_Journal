// src/components/CategoryEditForm.jsx
// Defensive, self-loading edit form for a Category.
// Fixes crash when the component renders before the category is fetched.
// Props:
//   - categoryId   (required): number ID of the category to edit
//   - onCancel     (optional): function -> void
//   - onSuccess    (optional): function -> void (called after successful save/delete)
//
// Behavior:
//   - Loads the category by ID on mount.
//   - If not found: shows a friendly message + Cancel button.
//   - Save validates name, updates category, and emits a 'db:changed' event.
//   - Delete refuses to run if category still has requestors; warns clearly.
//   - "Include in Single View" maps to boolean persisted as 1/0 in IndexedDB.

import React, { useEffect, useState } from 'react';
import { db } from '../db';

export default function CategoryEditForm({ categoryId, onCancel, onSuccess }) {
  // Loading / error state for the record fetch
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Form fields — initialized AFTER we fetch the category
  const [name, setName] = useState('');                 // category.name
  const [description, setDescription] = useState('');   // category.description
  const [showSingle, setShowSingle] = useState(false);  // category.showSingle (store as 1/0)

  // Submission state / feedback
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // --- Load the category on mount / when categoryId changes ---
  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setLoadError('');
      setMessage('');
      try {
        const cat = await db.categories.get(categoryId);
        if (!alive) return;

        if (!cat) {
          setLoadError('Category not found.');
          setLoading(false);
          return;
        }

        // Initialize form fields defensively
        setName(cat.name || '');
        setDescription(cat.description || '');
        setShowSingle(Boolean(cat.showSingle));
      } catch (err) {
        console.error('CategoryEditForm: load error', err);
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
    return () => { alive = false; };
  }, [categoryId]);

  // --- Save handler ---
  async function handleSave(e) {
    e?.preventDefault?.();
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

      // Notify rest of app
      window.dispatchEvent(new Event('db:changed'));

      setMessage('Saved.');
      if (typeof onSuccess === 'function') onSuccess();
    } catch (err) {
      console.error('CategoryEditForm: save error', err);
      setMessage('Save failed (see console).');
    } finally {
      setBusy(false);
    }
  }

  // --- Delete handler ---
  async function handleDelete() {
    setMessage('');
    try {
      // Count requestors in this category
      const count = await db.requestors.where('categoryId').equals(categoryId).count();
      if (count > 0) {
        alert(
          `This category still has ${count} requestor(s).\n\n` +
          `For safety, delete or move those requestors first before deleting the category.`
        );
        return;
      }

      const yes = confirm('Delete this category? This cannot be undone.');
      if (!yes) return;

      setBusy(true);
      await db.categories.delete(categoryId);

      // Notify rest of app
      window.dispatchEvent(new Event('db:changed'));

      setMessage('Category deleted.');
      if (typeof onSuccess === 'function') onSuccess();
    } catch (err) {
      console.error('CategoryEditForm: delete error', err);
      setMessage('Delete failed (see console).');
    } finally {
      setBusy(false);
    }
  }

  // --- Render states ---
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

  // --- Main form ---
  return (
    <form
      onSubmit={handleSave}
      className="p-4 bg-gray-700 rounded"
    >
      <h4 className="text-white font-semibold mb-3">Edit Category</h4>

      {/* Name */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Family, Urgent"
        />
      </div>

      {/* Description */}
      <div className="mb-2">
        <label className="block text-gray-300 text-sm mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Short description for this category"
        />
      </div>

      {/* Include in Single View */}
      <div className="flex items-center mb-3">
        <input
          id="showSingle"
          type="checkbox"
          checked={showSingle}
          onChange={(e) => setShowSingle(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="showSingle" className="text-gray-200 text-sm">
          Include in “Single View”
        </label>
      </div>

      {/* Status line */}
      {message && <p className="text-gray-200 text-sm mb-2">{message}</p>}

      {/* Actions */}
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
