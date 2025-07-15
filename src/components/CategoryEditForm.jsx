// src/components/CategoryEditForm.jsx

import React, { useState } from 'react';
import { db } from '../db';

/**
 * CategoryEditForm
 *
 * A form for editing an existing category.
 * Includes Save, Cancel, and Delete buttons.
 *
 * Deleting will also remove all requestors (and their prayers)
 * within this category. If any requestors exist, a warning
 * dialog will show the count before deletion.
 *
 * Props:
 * - category: {
 *     id,
 *     name,
 *     description,
 *     showSingle
 *   }
 * - onCancel: () => void        // Called when the user clicks “Cancel”
 * - onSuccess: () => void       // Called after successful save or delete
 */
export default function CategoryEditForm({ category, onCancel, onSuccess }) {
  // Initialize form state from the passed-in category object
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description || '');
  const [showSingle, setShowSingle] = useState(Boolean(category.showSingle));
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * handleSave
   *
   * Updates this category in IndexedDB, then calls onSuccess()
   * so the parent list can reload and exit edit mode.
   */
  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!name.trim()) {
      setError('Category name cannot be empty.');
      return;
    }

    setSubmitting(true);
    try {
      await db.categories.put({
        id: category.id,
        name: name.trim(),
        description: description.trim(),
        showSingle: showSingle ? 1 : 0,
      });

      // Notify parent to reload and close edit mode
      onSuccess();
    } catch (err) {
      console.error('Error saving category:', err);
      setError('Failed to save changes. Check console for details.');
    }
    setSubmitting(false);
  };

  /**
   * handleDelete
   *
   * 1. Counts requestors in this category.
   * 2. Warns the user if any exist (showing the count).
   * 3. Deletes all prayers for those requestors.
   * 4. Deletes the requestors.
   * 5. Deletes the category itself.
   * 6. Calls onSuccess().
   */
  const handleDelete = async () => {
    // Count how many requestors remain
    const count = await db.requestors
      .where('categoryId')
      .equals(category.id)
      .count();

    // Build a warning message
    let message = `Are you sure you want to delete the category "${category.name}"?`;
    if (count > 0) {
      message += `\n\nThis will also delete ${count} requestor${count > 1 ? 's' : ''} and all their prayers.`;
    }

    // Confirm with the user
    if (!window.confirm(message)) {
      return;
    }

    setSubmitting(true);
    try {
      if (count > 0) {
        // Delete prayers for each requestor in this category
        const reqs = await db.requestors
          .where('categoryId')
          .equals(category.id)
          .toArray();
        const reqIds = reqs.map((r) => r.id);

        // Bulk delete prayers whose requestorId is in reqIds
        await db.prayers
          .where('requestorId')
          .anyOf(reqIds)
          .delete();

        // Delete the requestors themselves
        await db.requestors
          .where('categoryId')
          .equals(category.id)
          .delete();
      }

      // Finally delete the category
      await db.categories.delete(category.id);

      // Notify parent to reload and close edit mode
      onSuccess();
    } catch (err) {
      console.error('Error deleting category:', err);
      setError('Failed to delete category. Check console for details.');
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 p-4 bg-gray-800 rounded-lg mb-2">
      <h4 className="text-white font-semibold">Edit Category</h4>

      {/* Name */}
      <div>
        <label className="block text-gray-300">Name</label>
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

      {/* Show in Single View toggle */}
      <label className="inline-flex items-center text-gray-300">
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-yellow-400"
          checked={showSingle}
          onChange={(e) => setShowSingle(e.target.checked)}
        />
        <span className="ml-2">Include in Single View</span>
      </label>

      {/* Error message */}
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
