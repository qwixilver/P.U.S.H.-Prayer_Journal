// src/components/RequestorEditForm.jsx

import React, { useState } from 'react';
import { db } from '../db';

/**
 * RequestorEditForm
 *
 * A form for editing an existing requestor under a specific category.
 * Includes Save, Cancel, and Delete buttons.
 *
 * Props:
 * - requestor: {
 *     id,
 *     categoryId,
 *     name,
 *     description,
 *     security
 *   }
 * - onCancel: () => void        // Called when the user clicks “Cancel”
 * - onSuccess: () => void       // Called after a successful save or delete
 */
export default function RequestorEditForm({ requestor, onCancel, onSuccess }) {
  // Initialize form state from the passed-in requestor object
  const [name, setName] = useState(requestor.name);
  const [description, setDescription] = useState(requestor.description || '');
  const [security, setSecurity] = useState(Boolean(requestor.security));
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * handleSave
   *
   * Updates the requestor record in IndexedDB, then invokes onSuccess()
   * so the parent can reload and exit edit mode.
   */
  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);

    // Basic validation: name must not be empty
    if (!name.trim()) {
      setError('Requestor name cannot be empty.');
      return;
    }

    setSubmitting(true);
    try {
      // Update requestor by primary key 'id'
      await db.requestors.put({
        id: requestor.id,
        categoryId: requestor.categoryId, // preserve category
        name: name.trim(),
        description: description.trim(),
        security: security ? 1 : 0,
      });

      // Notify parent to reload requestors and close edit
      onSuccess();
    } catch (err) {
      console.error('Error saving requestor:', err);
      setError('Failed to save changes. See console for details.');
    }
    setSubmitting(false);
  };

  /**
   * handleDelete
   *
   * Prompts the user, then deletes the requestor from IndexedDB,
   * finally calling onSuccess() to reload the list.
   */
  const handleDelete = async () => {
    if (!window.confirm('Delete this requestor and all its prayers?')) {
      return;
    }
    try {
      // Delete requestor record
      await db.requestors.delete(requestor.id);
      // Also optionally delete prayers tied to this requestor:
      await db.prayers.where('requestorId').equals(requestor.id).delete();

      // Notify parent to reload and exit edit mode
      onSuccess();
    } catch (err) {
      console.error('Error deleting requestor:', err);
      setError('Failed to delete requestor. See console for details.');
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 p-4 bg-gray-800 rounded-lg mb-2">
      <h4 className="text-white font-semibold">Edit Requestor</h4>

      {/* Name input */}
      <div>
        <label className="block text-gray-300">Name</label>
        <input
          type="text"
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Description input */}
      <div>
        <label className="block text-gray-300">Description</label>
        <textarea
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Security toggle */}
      <label className="inline-flex items-center text-gray-300">
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-yellow-400"
          checked={security}
          onChange={(e) => setSecurity(e.target.checked)}
        />
        <span className="ml-2">Security View Only</span>
      </label>

      {/* Error message */}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Action buttons */}
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
