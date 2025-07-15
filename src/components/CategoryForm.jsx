// src/components/CategoryForm.jsx
// This component provides a form to add a new category to the IndexedDB.
// It collects the category name, description, and a toggle for whether this category
// should appear in the "Single View" screen (showSingle boolean flag).

import React, { useState } from 'react';
import { db } from '../db';

/**
 * CategoryForm allows the user to create a new category.
 * @param {{ onSuccess: Function }} props
 *   onSuccess: callback invoked after successful creation (e.g., to refresh category list)
 */
function CategoryForm({ onSuccess }) {
  // Local form state for controlled inputs
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showSingle, setShowSingle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Handler for form submission
  const handleSubmit = async (e) => {
    e.preventDefault(); // prevent page reload
    setSubmitting(true);
    setError(null);

    // Basic validation: ensure name is provided
    if (!name.trim()) {
      setError('Category name is required.');
      setSubmitting(false);
      return;
    }

    try {
      // Add new category record to IndexedDB
      await db.categories.add({
        name: name.trim(),
        description: description.trim(),
        showSingle: showSingle ? 1 : 0,
      });

      // Reset form fields
      setName('');
      setDescription('');
      setShowSingle(false);

      // Notify parent to refresh category list
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Failed to add category:', err);
      setError('An unexpected error occurred.');
    }

    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-gray-800 rounded-lg shadow-md">
      <h3 className="text-xl font-semibold mb-4">Add New Category</h3>

      {/* Category Name Input */}
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1" htmlFor="cat-name">Name *</label>
        <input
          id="cat-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 bg-gray-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Family, Urgent"
        />
      </div>

      {/* Category Description Input */}
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1" htmlFor="cat-desc">Description</label>
        <textarea
          id="cat-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-2 bg-gray-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Optional details about this category"
          rows={3}
        />
      </div>

      {/* Show in Single View Toggle */}
      <div className="flex items-center mb-4">
        <input
          id="cat-single"
          type="checkbox"
          checked={showSingle}
          onChange={(e) => setShowSingle(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="cat-single" className="text-sm">
          Include in Single View
        </label>
      </div>

      {/* Error message */}
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      {/* Submit button */}
      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white disabled:opacity-50"
      >
        {submitting ? 'Saving...' : 'Save Category'}
      </button>
    </form>
  );
}

export default CategoryForm;
