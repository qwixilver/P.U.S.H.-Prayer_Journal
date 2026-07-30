// src/components/CategoryList.jsx
// Categories page with explicit category expansion controls, inline editing,
// requestor management, a sticky add form, and db:changed refresh support.

import React, { useEffect, useState } from 'react';
import { db } from '../db';
import CategoryForm from './CategoryForm';
import CategoryEditForm from './CategoryEditForm';
import RequestorForm from './RequestorForm';
import RequestorEditForm from './RequestorEditForm';

function CategoryList() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [requestors, setRequestors] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState({});
  const [editingRequestor, setEditingRequestor] = useState({});

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

  const handleRequestorEditSuccess = async (categoryId, requestorId) => {
    await loadRequestors(categoryId);
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

      <h2 className="text-2xl font-bold mb-4">Categories</h2>

      {loading && <p className="text-gray-400">Loading categories...</p>}

      {!loading && categories.length === 0 && (
        <p className="text-gray-400">No categories available. Tap + to add one.</p>
      )}

      {!loading && categories.length > 0 && (
        <ul className="space-y-4">
          {categories.map((category) => {
            const isExpanded = Boolean(expanded[category.id]);
            const isEditingCategory = Boolean(editingCategory[category.id]);

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

                    {requestors[category.id] &&
                    requestors[category.id].length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {requestors[category.id].map((requestor) => {
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
                                  onSuccess={() =>
                                    handleRequestorEditSuccess(
                                      category.id,
                                      requestor.id
                                    )
                                  }
                                />
                              ) : (
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-white font-medium">
                                      {requestor.name}
                                    </p>
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
                        No requestors added yet.
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
