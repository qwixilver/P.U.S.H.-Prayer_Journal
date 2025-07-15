// src/components/PrayerEditForm.jsx
// This component provides a form to edit an existing prayer request in IndexedDB.
// It pre-fills fields with the current values and updates the record on submission.

import React, { useState } from 'react';
import { db } from '../db';

/**
 * PrayerEditForm allows editing of an existing prayer.
 * @param {{ prayer: Object, onCancel: Function, onSuccess: Function }} props
 *  - prayer: the existing prayer object { id, name, description, requestedAt, answeredAt, status, security }
 *  - onCancel: callback when user cancels editing
 *  - onSuccess: callback after successful update (e.g., to reload list)
 */
function PrayerEditForm({ prayer, onCancel, onSuccess }) {
  // Pre-fill form state with existing prayer values
  const [name, setName] = useState(prayer.name);
  const [description, setDescription] = useState(prayer.description);
  const [requestedAt, setRequestedAt] = useState(prayer.requestedAt.substr(0,10));
  const [answeredAt, setAnsweredAt] = useState(prayer.answeredAt ? prayer.answeredAt.substr(0,10) : '');
  const [status, setStatus] = useState(prayer.status);
  const [security, setSecurity] = useState(Boolean(prayer.security));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!name.trim()) {
      setError('Prayer title is required.');
      setSubmitting(false);
      return;
    }

    try {
      // Update prayer record in IndexedDB
      await db.prayers.update(prayer.id, {
        name: name.trim(),
        description: description.trim(),
        requestedAt: requestedAt,
        answeredAt: status === 'answered' ? answeredAt : null,
        status: status,
        security: security ? 1 : 0,
      });
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Failed to update prayer:', err);
      setError('An unexpected error occurred.');
    }

    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-gray-600 rounded-lg mb-2">
      <h4 className="text-white font-semibold mb-3">Edit Prayer</h4>

      {/* Title */}
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

      {/* Requested Date */}
      <div className="mb-2">
        <label className="text-gray-300 text-sm">Requested:</label>
        <input
          type="date"
          value={requestedAt}
          onChange={(e) => setRequestedAt(e.target.value)}
          className="w-full p-2 bg-gray-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Status & Answered Date */}
      <div className="mb-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full p-2 bg-gray-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="requested">Requested</option>
          <option value="answered">Answered</option>
        </select>
        {status === 'answered' && (
          <input
            type="date"
            value={answeredAt}
            onChange={(e) => setAnsweredAt(e.target.value)}
            className="mt-2 w-full p-2 bg-gray-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
      </div>

      {/* Security Toggle */}
      <div className="flex items-center mb-2">
        <input
          type="checkbox"
          checked={security}
          onChange={(e) => setSecurity(e.target.checked)}
          className="mr-2"
        />
        <label className="text-gray-200 text-sm">Security Only</label>
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

export default PrayerEditForm;
