// src/components/RequestorForm.jsx
// Adds a new active requestor under a specific category in IndexedDB.

import React, { useState } from 'react';
import { db } from '../db';

/**
 * RequestorForm allows creation of a new requestor for a given category.
 * @param {{ categoryId: number, onSuccess: Function }} props
 *   - categoryId: ID of the category under which to add the requestor
 *   - onSuccess: callback invoked after successful creation to refresh parent list
 */
function RequestorForm({ categoryId, onSuccess }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [security, setSecurity] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!name.trim()) {
      setError('Requestor name is required.');
      setSubmitting(false);
      return;
    }

    try {
      await db.requestors.add({
        categoryId,
        name: name.trim(),
        description: description.trim(),
        security: security ? 1 : 0,
        archived: 0,
      });

      setName('');
      setDescription('');
      setSecurity(false);
      onSuccess?.();
    } catch (saveError) {
      console.error('Failed to add requestor:', saveError);
      setError('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-gray-700 rounded-lg mb-4">
      <h4 className="font-semibold mb-2 text-white">Add Requestor</h4>

      <div className="mb-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Requestor Name"
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mb-2">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center mb-2">
        <input
          id={`req-security-${categoryId}`}
          type="checkbox"
          checked={security}
          onChange={(event) => setSecurity(event.target.checked)}
          className="mr-2"
        />
        <label
          htmlFor={`req-security-${categoryId}`}
          className="text-sm text-gray-200"
        >
          Security Only
        </label>
      </div>

      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white disabled:opacity-50"
      >
        {submitting ? 'Adding...' : 'Add Requestor'}
      </button>
    </form>
  );
}

export default RequestorForm;
