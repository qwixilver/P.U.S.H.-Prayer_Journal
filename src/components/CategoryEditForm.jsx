// src/components/CategoryEditForm.jsx
// This component provides a form to edit an existing category in IndexedDB.
// It pre-fills fields with the current values and updates the record on submission.

import React, { useState } from 'react';
import { db } from '../db';

/**
 * CategoryEditForm allows editing of an existing category.
 * @param {{ category: Object, onCancel: Function, onSuccess: Function }} props
 *   - category: the existing category object { id, name, description, showSingle }
 *   - onCancel: callback invoked when user cancels editing
 *   - onSuccess: callback invoked after successful update to reload list
 */
function CategoryEditForm({ category, onCancel, onSuccess }) {
  // Initialize form state with existing category values
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description);
  const [showSingle, setShowSingle] = useState(Boolean(category.showSingle));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!name.trim()) {
      setError('Category name is required.');
      setSubmitting(false);
      return;
    }

    try {
      // Update category in IndexedDB
      await db.categories.update(category.id, {
        name: name.trim(),
        description: description.trim(),
        showSingle: showSingle ? 1 : 0,
      });
      // Notify parent to reload categories
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Failed to update category:', err);
      setError('An unexpected error occurred.');
    }

    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-gray-600 rounded-lg mb-2">
      <h4 className="text-white font-semibold mb-3">Edit Category</h4>

      {/* Category Name */}
      <div className="mb-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 bg-gray-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Description */}
      <div className="mb-2">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full p-2 bg-gray-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Show in Single View Toggle */}
      <div className="flex items-center mb-2">
        <input
          id={`edit-cat-single-${category.id}`}
          type="checkbox"
          checked={showSingle}
          onChange={(e) => setShowSingle(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor={`edit-cat-single-${category.id}`} className="text-gray-200 text-sm">
          Include in Single View
        </label>
      </div>

      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      {/* Save/Cancel buttons */}
      <div className="flex space-x-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default CategoryEditForm;
