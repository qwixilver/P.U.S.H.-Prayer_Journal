// src/components/RequestorEditForm.jsx
// Edits a requestor, including moving it to another category.

import React, { useEffect, useState } from 'react';
import { db, emitDbChanged } from '../db';

export default function RequestorEditForm({
  requestor,
  onCancel,
  onSuccess,
}) {
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(requestor.categoryId);
  const [name, setName] = useState(requestor.name || '');
  const [description, setDescription] = useState(
    requestor.description || ''
  );
  const [security, setSecurity] = useState(Boolean(requestor.security));
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      setLoadingCategories(true);

      try {
        const categoryRows = await db.categories.toArray();
        categoryRows.sort((categoryA, categoryB) =>
          (categoryA.name || '').localeCompare(categoryB.name || '', undefined, {
            sensitivity: 'base',
          })
        );

        if (!cancelled) {
          setCategories(categoryRows);
        }
      } catch (loadError) {
        console.error('Error loading categories:', loadError);

        if (!cancelled) {
          setError('Failed to load categories. See console for details.');
        }
      } finally {
        if (!cancelled) {
          setLoadingCategories(false);
        }
      }
    }

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    setError(null);

    if (!categoryId) {
      setError('Please choose a category.');
      return;
    }

    if (!name.trim()) {
      setError('Requestor name cannot be empty.');
      return;
    }

    setSubmitting(true);

    try {
      const nextCategoryId = Number(categoryId);
      const previousCategoryId = Number(requestor.categoryId);

      await db.requestors.update(requestor.id, {
        categoryId: nextCategoryId,
        name: name.trim(),
        description: description.trim(),
        security: security ? 1 : 0,
      });

      emitDbChanged();
      onSuccess?.({
        previousCategoryId,
        categoryId: nextCategoryId,
        requestorId: requestor.id,
      });
    } catch (saveError) {
      console.error('Error saving requestor:', saveError);
      setError('Failed to save changes. See console for details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this requestor and all its prayers?')) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await db.transaction('rw', db.requestors, db.prayers, async () => {
        await db.requestors.delete(requestor.id);
        await db.prayers
          .where('requestorId')
          .equals(requestor.id)
          .delete();
      });

      emitDbChanged();
      onSuccess?.({
        previousCategoryId: Number(requestor.categoryId),
        categoryId: null,
        requestorId: requestor.id,
        deleted: true,
      });
    } catch (deleteError) {
      console.error('Error deleting requestor:', deleteError);
      setError('Failed to delete requestor. See console for details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="space-y-4 p-4 bg-gray-800 rounded-lg mb-2"
    >
      <h4 className="text-white font-semibold">Edit Requestor</h4>

      <div>
        <label className="block text-gray-300" htmlFor={`requestor-category-${requestor.id}`}>
          Category
        </label>
        <select
          id={`requestor-category-${requestor.id}`}
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white disabled:opacity-50"
          value={categoryId ?? ''}
          onChange={(event) =>
            setCategoryId(
              event.target.value ? Number(event.target.value) : null
            )
          }
          disabled={loadingCategories || submitting}
        >
          <option value="" disabled>
            {loadingCategories ? 'Loading categories…' : 'Select a category…'}
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-gray-300" htmlFor={`requestor-name-${requestor.id}`}>
          Name
        </label>
        <input
          id={`requestor-name-${requestor.id}`}
          type="text"
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={submitting}
        />
      </div>

      <div>
        <label className="block text-gray-300" htmlFor={`requestor-description-${requestor.id}`}>
          Description
        </label>
        <textarea
          id={`requestor-description-${requestor.id}`}
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={submitting}
        />
      </div>

      <label className="inline-flex items-center text-gray-300">
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-yellow-400"
          checked={security}
          onChange={(event) => setSecurity(event.target.checked)}
          disabled={submitting}
        />
        <span className="ml-2">Security View Only</span>
      </label>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting || loadingCategories}
          className="px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600 disabled:opacity-50 font-semibold"
        >
          {submitting ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={submitting}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </form>
  );
}
