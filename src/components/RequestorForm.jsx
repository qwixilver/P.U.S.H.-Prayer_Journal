// src/components/RequestorForm.jsx
// This component provides a form to add a new requestor under a specific category in IndexedDB.
// It collects the requestor name, description, and a security toggle.

import React, { useState } from 'react';
import { db } from '../db';

/**
 * RequestorForm allows creation of a new requestor for a given category.
 * @param {{ categoryId: number, onSuccess: Function }} props
 *   - categoryId: ID of the category under which to add the requestor
 *   - onSuccess: callback invoked after successful creation to refresh parent list
 */
function RequestorForm({ categoryId, onSuccess }) {
  // Controlled inputs for form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [security, setSecurity] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();        // Prevent page reload
    setError(null);
    setSubmitting(true);

    // Basic validation: name required
    if (!name.trim()) {
      setError('Requestor name is required.');
      setSubmitting(false);
      return;
    }

    try {
      // Add to IndexedDB
      await db.requestors.add({
        categoryId: categoryId,
        name: name.trim(),
        description: description.trim(),
        security: security ? 1 : 0,
      });

      // Reset form fields
      setName('');
      setDescription('');
      setSecurity(false);

      // Notify parent to refresh list
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Failed to add requestor:', err);
      setError('An unexpected error occurred.');
    }

    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-gray-700 rounded-lg mb-4">
      <h4 className="font-semibold mb-2 text-white">Add Requestor</h4>

      {/* Requestor Name */}
      <div className="mb-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Requestor Name"
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Requestor Description */}
      <div className="mb-2">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full p-2 bg-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Security Toggle */}
      <div className="flex items-center mb-2">
        <input
          id="req-security"
          type="checkbox"
          checked={security}
          onChange={(e) => setSecurity(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="req-security" className="text-sm text-gray-200">
          Security Only
        </label>
      </div>

      {/* Error message */}
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      {/* Submit Button */}
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
