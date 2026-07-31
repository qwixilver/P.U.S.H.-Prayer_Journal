// src/components/CategoryForm.jsx
// Form for adding a category and choosing whether its requests appear in Focus.

import React, { useState } from 'react';
import { db } from '../db';

function CategoryForm({ onSuccess }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showSingle, setShowSingle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    if (!name.trim()) {
      setError('Category name is required.');
      setSubmitting(false);
      return;
    }

    try {
      await db.categories.add({
        name: name.trim(),
        description: description.trim(),
        showSingle: showSingle ? 1 : 0,
      });

      setName('');
      setDescription('');
      setShowSingle(false);

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

      <div className="mb-3">
        <label className="block text-sm font-medium mb-1" htmlFor="cat-name">
          Name *
        </label>
        <input
          id="cat-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full p-2 bg-gray-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Family, Urgent"
        />
      </div>

      <div className="mb-3">
        <label className="block text-sm font-medium mb-1" htmlFor="cat-desc">
          Description
        </label>
        <textarea
          id="cat-desc"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="w-full p-2 bg-gray-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Optional details about this category"
          rows={3}
        />
      </div>

      <div className="flex items-center mb-4">
        <input
          id="cat-single"
          type="checkbox"
          checked={showSingle}
          onChange={(event) => setShowSingle(event.target.checked)}
          className="mr-2"
        />
        <label htmlFor="cat-single" className="text-sm">
          Display requests from this category in “Focus”
        </label>
      </div>

      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

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
