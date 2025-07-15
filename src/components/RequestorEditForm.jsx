// src/components/RequestorEditForm.jsx
// This component provides a form to edit an existing requestor in IndexedDB.
// It pre-fills fields with the current values and updates the record on submission.

import React, { useState } from 'react';
import { db } from '../db';

/**
 * RequestorEditForm allows editing of an existing requestor.
 * @param {{ requestor: Object, onCancel: Function, onSuccess: Function }} props
 *   - requestor: the existing requestor object { id, name, description, security }
 *   - onCancel: callback to call when user cancels editing
 *   - onSuccess: callback to call after successful update (e.g., to reload parent list)
 */
function RequestorEditForm({ requestor, onCancel, onSuccess }) {
  // Pre-fill state with existing values
  const [name, setName] = useState(requestor.name);
  const [description, setDescription] = useState(requestor.description);
  const [security, setSecurity] = useState(Boolean(requestor.security));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!name.trim()) {
      setError('Requestor name is required.');
      setSubmitting(false);
      return;
    }

    try {
      // Update the record in IndexedDB
      await db.requestors.update(requestor.id, {
        name: name.trim(),
        description: description.trim(),
        security: security ? 1 : 0,
      });

      // Notify parent to reload
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Failed to update requestor:', err);
      setError('An unexpected error occurred.');
    }

    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-gray-600 rounded-lg mb-4">
      <h4 className="font-semibold mb-2 text-white">Edit Requestor</h4>

      <div className="mb-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 bg-gray-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mb-2">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full p-2 bg-gray-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center mb-2">
        <input
          id={`edit-req-sec-${requestor.id}`}
          type="checkbox"
          checked={security}
          onChange={(e) => setSecurity(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor={`edit-req-sec-${requestor.id}`} className="text-sm text-gray-200">
          Security Only
        </label>
      </div>

      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

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

export default RequestorEditForm;
