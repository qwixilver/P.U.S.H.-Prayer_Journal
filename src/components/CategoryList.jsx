// src/components/CategoryList.jsx
// Categories page with explicit category expansion controls, inline editing,
// requestor management, a sticky add form, and db:changed refresh support.

import React, { useEffect, useState } from 'react';
import { db } from '../db';
import CategoryForm from './CategoryForm';
import CategoryEditForm from './CategoryEditForm';
import RequestorForm from './RequestorForm';
import RequestorEditForm from './RequestorEditForm';

const SHOW_ARCHIVED_STORAGE_KEY = 'cp:categoriesShowArchived:v1';

function loadShowArchived() {
  try {
    return localStorage.getItem(SHOW_ARCHIVED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function CategoryList() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [requestors, setRequestors] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState({});
  const [editingRequestor, setEditingRequestor] = useState({});
  const [showArchived, setShowArchived] = useState(loadShowArchived);

  const loadCategories = async () => {
    setLoading(true);

    try {
      const categoryRows = await db.categories.toArray();
      setCategories(categoryRows);
    } catch (error) {
      console.error('Error loading categories:', error);
    }

    setLoading(false);
  };

  const loadRequestors = async (categoryId) => {
    try {
      const requestorRows = await db.requestors
        .where('categoryId')
        .equals(categoryId)
        .toArray();

      setRequestors((current) => ({
        ...current,
        [categoryId]: requestorRows,
      }));
    } catch (error) {
      console.error(
        `Error loading requestors for category ${categoryId}:`,
        error
      );
    }
  };

  const toggleCategory = (categoryId) => {
    setExpanded((current) => {
      const willExpand = !current[categoryId];

      if (willExpand && !requestors[categoryId]) {
        loadRequestors(categoryId);
      }

      return {
        ...current,
        [categoryId]: willExpand,
      };
    });
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    const onDbChanged = () => loadCategories();

    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, []);

  const handleAddSuccess = async () => {
    await loadCategories();
    setShowAddForm(false);
  };

  const updateShowArchived = (enabled) => {
    setShowArchived(enabled);

    try {
      localStorage.setItem(SHOW_ARCHIVED_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // The toggle still works for this session if storage is unavailable.
    }
  };

  const openEditCategory = (categoryId) => {
    setEditingCategory((current) => ({
      ...current,
      [categoryId]: true,
    }));
  };

  const closeEditCategory = (categoryId) => {
    setEditingCategory((current) => ({
      ...current,
      [categoryId]: false,
    }));
  };

  const handleCategoryEditSuccess = async (categoryId) => {
    await loadCategories();

    if (expanded[categoryId]) {
      await loadRequestors(categoryId);
    }

    closeEditCategory(categoryId);
  };

  const openEditRequestor = (requestorId) => {
    setEditingRequestor((current) => ({
      ...current,
      [requestorId]: true,
    }));
  };

  const closeEditRequestor = (requestorId) => {
    setEditingRequestor((current) => ({
      ...current,
      [requestorId]: false,
    }));
  };

  const handleRequestorEditSuccess = async ({
    previousCategoryId,
    categoryId,
    requestorId,
  }) => {
    const affectedCategoryIds = Array.from(
      new Set(
        [previousCategoryId, categoryId]
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      )
    );

    await Promise.all(
      affectedCategoryIds.map((affectedCategoryId) =>
        loadRequestors(affectedCategoryId)
      )
    );

    closeEditRequestor(requestorId);
  };

  return (
    <div className="relative p-4 pb-24 overflow-y-auto">
      {showAddForm && (
        <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border-b border-gray-700 rounded-b-lg shadow-lg -mx-4 px-4 pt-4 pb-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Add Category</h2>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                title="Minimize"
              >
                Minimize
              </button>
            </div>
            <CategoryForm onSuccess={handleAddSuccess} />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Categories</h2>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm shadow">
          <span className="text-gray-200">Show archived</span>
          <span className="relative inline-flex">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={showArchived}
              onChange={(event) => updateShowArchived(event.target.checked)}
              aria-label="Show archived requestors"
            />
            <span className="h-6 w-11 rounded-full bg-gray-600 transition peer-checked:bg-yellow-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow-300" />
            <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
      </div>

      {loading && <p className="text-gray-400">Loading categories...</p>}

      {!loading && categories.length === 0 && (
        <p className="text-gray-400">No categories available. Tap + to add one.</p>
      )}

      {!loading && categories.length > 0 && (
        <ul className="space-y-4">
          {categories.map((category) => {
            const isExpanded = Boolean(expanded[category.id]);
            const isEditingCategory = Boolean(editingCategory[category.id]);
            const categoryRequestors = requestors[category.id] || [];
            const visibleRequestors = categoryRequestors.filter(
              (requestor) => showArchived || !Boolean(requestor.archived)
            );

            return (
              <li
                key={category.id}
                className="bg-gray-800 rounded-lg shadow-md"
              >
                <div className="w-full p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-lg text-white">
                      {category.name}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      {category.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                      aria-expanded={isExpanded}
                      aria-controls={`category-requestors-${category.id}`}
                    >
                      {isExpanded ? 'Hide requestors' : 'Show requestors'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditCategory(category.id)}
                      className="px-2 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
                      title="Edit Category"
                    >
                      Edit Category
                    </button>
                  </div>
                </div>

                {isEditingCategory && (
                  <div className="px-4 pb-3">
                    <CategoryEditForm
                      categoryId={category.id}
                      onCancel={() => closeEditCategory(category.id)}
                      onSuccess={() => handleCategoryEditSuccess(category.id)}
                    />
                  </div>
                )}

                {isExpanded && (
                  <div
                    id={`category-requestors-${category.id}`}
                    className="p-4 border-t border-gray-700"
                  >
                    <RequestorForm
                      categoryId={category.id}
                      onSuccess={() => loadRequestors(category.id)}
                    />

                    {visibleRequestors.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {visibleRequestors.map((requestor) => {
                          const isEditingRequestor = Boolean(
                            editingRequestor[requestor.id]
                          );

                          return (
                            <li
                              key={requestor.id}
                              className="bg-gray-700 p-3 rounded"
                            >
                              {isEditingRequestor ? (
                                <RequestorEditForm
                                  requestor={requestor}
                                  onCancel={() =>
                                    closeEditRequestor(requestor.id)
                                  }
                                  onSuccess={(result = {}) =>
                                    handleRequestorEditSuccess({
                                      previousCategoryId:
                                        result.previousCategoryId ?? category.id,
                                      categoryId:
                                        result.categoryId ?? category.id,
                                      requestorId:
                                        result.requestorId ?? requestor.id,
                                    })
                                  }
                                />
                              ) : (
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-white font-medium">
                                        {requestor.name}
                                      </p>
                                      {Boolean(requestor.archived) && (
                                        <span className="rounded bg-amber-700 px-2 py-0.5 text-xs text-white">
                                          Archived
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-gray-300 text-sm">
                                      {requestor.description}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openEditRequestor(requestor.id)
                                    }
                                    className="px-2 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white self-start"
                                    title="Edit Requestor"
                                  >
                                    Edit
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-gray-400 mt-2">
                        {showArchived
                          ? 'No requestors added yet.'
                          : 'No active requestors in this category.'}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!showAddForm && (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full bg-yellow-500 text-black shadow-lg hover:bg-yellow-600 flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-yellow-300"
          aria-label="Add category"
          title="Add category"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 5v14m-7-7h14"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

export default CategoryList;
