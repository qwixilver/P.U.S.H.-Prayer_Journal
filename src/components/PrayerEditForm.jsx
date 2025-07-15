// src/components/PrayerEditForm.jsx

import React, { useState } from 'react';
import { db } from '../db';

/**
 * PrayerEditForm allows editing and deleting of an existing prayer request.
 *
 * Props:
 * - prayer: {
 *     id,
 *     requestorId,
 *     name,
 *     description,
 *     requestedAt,
 *     answeredAt,
 *     status,
 *     security
 *   }
 * - onCancel: () => void         // Called when the user clicks “Cancel”
 * - onSuccess: () => void        // Called after a successful save or delete
 */
export default function PrayerEditForm({ prayer, onCancel, onSuccess }) {
  // Form state initialized from the passed-in prayer object
  const [name, setName] = useState(prayer.name);
  const [description, setDescription] = useState(prayer.description || '');
  // Format to "YYYY-MM-DD" for the date input
  const [requestedAt, setRequestedAt] = useState(prayer.requestedAt.slice(0, 10));
  const [status, setStatus] = useState(prayer.status);
  const [security, setSecurity] = useState(Boolean(prayer.security));
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * handleSave
   * Updates this prayer in IndexedDB, then calls onSuccess().
   */
  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);

    // Simple validation
    if (!name.trim()) {
      setError('Prayer title cannot be empty.');
      return;
    }

    setSubmitting(true);
    try {
      // Update the record (keeping the original id and requestorId)
      await db.prayers.put({
        id: prayer.id,
        requestorId: prayer.requestorId,
        name: name.trim(),
        description: description.trim(),
        requestedAt: new Date(requestedAt).toISOString(),
        answeredAt: prayer.answeredAt, // keep original answeredAt
        status,
        security: security ? 1 : 0,
      });

      // Refresh parent list and exit edit mode
      onSuccess();
    } catch (err) {
      console.error('Error saving prayer:', err);
      setError('Failed to save changes. See console for details.');
    }
    setSubmitting(false);
  };

  /**
   * handleDelete
   * Confirms with the user, deletes this prayer from IndexedDB,
   * then calls onSuccess().
   */
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this prayer?')) {
      return;
    }
    try {
      await db.prayers.delete(prayer.id);
      onSuccess();
    } catch (err) {
      console.error('Error deleting prayer:', err);
      setError('Failed to delete prayer. See console for details.');
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 p-4 bg-gray-800 rounded-lg mb-2">
      <h4 className="text-white font-semibold">Edit Prayer</h4>

      {/* Title */}
      <div>
        <label className="block text-gray-300">Prayer Title</label>
        <input
          type="text"
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-gray-300">Description</label>
        <textarea
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Requested Date & Status */}
      <div className="flex space-x-4">
        <div>
          <label className="block text-gray-300">Requested Date</label>
          <input
            type="date"
            className="mt-1 p-2 bg-gray-700 rounded text-white"
            value={requestedAt}
            onChange={(e) => setRequestedAt(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-gray-300">Status</label>
          <select
            className="mt-1 p-2 bg-gray-700 rounded text-white"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="requested">Requested</option>
            <option value="answered">Answered</option>
          </select>
        </div>
      </div>

      {/* Security Flag */}
      <label className="inline-flex items-center text-gray-300">
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-yellow-400"
          checked={security}
          onChange={(e) => setSecurity(e.target.checked)}
        />
        <span className="ml-2">Security View Only</span>
      </label>

      {/* Error Message */}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Action Buttons */}
      <div className="flex space-x-2">
        {/* Save */}
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600 disabled:opacity-50 font-semibold"
        >
          {submitting ? 'Saving...' : 'Save'}
        </button>

        {/* Cancel */}
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
        >
          Cancel
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={handleDelete}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
        >
          Delete
        </button>
      </div>
    </form>
  );
}
