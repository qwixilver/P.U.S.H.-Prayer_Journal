// src/components/CategoryList.jsx
// Categories page with:
// - FAB to open a sticky "Add Category" form at the top
// - Expandable category panels
// - Per-category "Edit Category" (inline) — uses CategoryEditForm (includes Delete Category)
// - Per-requestor "Edit" (inline) — uses RequestorEditForm (includes Delete Requestor)
// - Auto-refresh on db:changed
// - Bottom padding so nothing sits under the BottomNav

import React, { useEffect, useState } from 'react';
import { db } from '../db';
import CategoryForm from './CategoryForm';
import CategoryEditForm from './CategoryEditForm';      // <-- ensure this file exists (we created earlier)
import RequestorForm from './RequestorForm';
import RequestorEditForm from './RequestorEditForm';    // <-- ensure this file exists (we created earlier)

function CategoryList() {
  // Data state
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [expanded, setExpanded] = useState({});            // which category ids are expanded
  const [requestors, setRequestors] = useState({});        // cache: { [catId]: Requestor[] }
  const [showAddForm, setShowAddForm] = useState(false);   // FAB → sticky add form

  // Inline editing state maps
  const [editingCategory, setEditingCategory] = useState({}); // { [catId]: boolean }
  const [editingRequestor, setEditingRequestor] = useState({}); // { [requestorId]: boolean }

  // ----- data loading -----
  const loadCategories = async () => {
    setLoading(true);
    try {
      const cats = await db.categories.toArray();
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
    setLoading(false);
  };

  const loadRequestors = async (catId) => {
    try {
      const reqs = await db.requestors.where('categoryId').equals(catId).toArray();
      setRequestors((prev) => ({ ...prev, [catId]: reqs }));
    } catch (error) {
      console.error(`Error loading requestors for category ${catId}:`, error);
    }
  };

  const toggleCategory = (catId) => {
    setExpanded((prev) => {
      const isNowExpanded = !prev[catId];
      if (isNowExpanded && !requestors[catId]) {
        loadRequestors(catId);
      }
      return { ...prev, [catId]: isNowExpanded };
    });
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // Auto-refresh when imports or bulk changes happen
  useEffect(() => {
    const onDbChanged = () => loadCategories();
    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, []);

  // ----- add form handlers (sticky panel controlled by FAB) -----
  const handleAddSuccess = async () => {
    await loadCategories();
    setShowAddForm(false);
  };
  const handleAddCancel = () => setShowAddForm(false);

  // ----- category edit handlers -----
  const openEditCategory = (catId) =>
    setEditingCategory((prev) => ({ ...prev, [catId]: true }));
  const closeEditCategory = (catId) =>
    setEditingCategory((prev) => ({ ...prev, [catId]: false }));

  // After editing category, reload cats and (optionally) refresh requestors if still expanded
  const handleCategoryEditSuccess = async (catId) => {
    await loadCategories();
    if (expanded[catId]) {
      await loadRequestors(catId);
    }
    closeEditCategory(catId);
  };

  // ----- requestor edit handlers -----
  const openEditRequestor = (reqId) =>
    setEditingRequestor((prev) => ({ ...prev, [reqId]: true }));
  const closeEditRequestor = (reqId) =>
    setEditingRequestor((prev) => ({ ...prev, [reqId]: false }));

  const handleRequestorEditSuccess = async (catId, reqId) => {
    await loadRequestors(catId);
    closeEditRequestor(reqId);
  };

  return (
    <div className="relative p-4 pb-24 overflow-y-auto">
      {/* Sticky Add Category panel (revealed by FAB) */}
      {showAddForm && (
        <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border-b border-gray-700 rounded-b-lg shadow-lg -mx-4 px-4 pt-4 pb-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Add Category</h2>
              <button
                onClick={handleAddCancel}
                className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                title="Minimize"
              >
                Minimize
              </button>
            </div>
            {/* Same CategoryForm, but shown inside the sticky panel */}
            <CategoryForm onSuccess={handleAddSuccess} />
          </div>
        </div>
      )}

      {/* Page title */}
      <h2 className="text-2xl font-bold mb-4">Categories</h2>

      {/* Loading/empty states */}
      {loading && <p className="text-gray-400">Loading categories...</p>}
      {!loading && categories.length === 0 && (
        <p className="text-gray-400">No categories available. Tap + to add one.</p>
      )}

      {/* Category list */}
      {!loading && categories.length > 0 && (
        <ul className="space-y-4">
          {categories.map((cat) => {
            const isExpanded = !!expanded[cat.id];
            const isEditingCat = !!editingCategory[cat.id];

            return (
              <li key={cat.id} className="bg-gray-800 rounded-lg shadow-md">
                {/* Category header row */}
                <div className="w-full p-4 flex justify-between items-start">
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="text-left"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    <h3 className="font-semibold text-lg text-white">{cat.name}</h3>
                    <p className="text-gray-400 text-sm">{cat.description}</p>
                  </button>

                {/* Category-level actions (Edit Category toggle) */}
                  <div className="ml-3 flex items-center gap-2">
                    <button
                      onClick={() => openEditCategory(cat.id)}
                      className="px-2 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
                      title="Edit Category"
                    >
                      Edit Category
                    </button>
                    <span className="text-white text-xl">
                      {isExpanded ? '▾' : '▸'}
                    </span>
                  </div>
                </div>

                {/* Inline Category Edit Form (includes Delete, based on your existing component) */}
                {isEditingCat && (
                  <div className="px-4 pb-3">
                    <CategoryEditForm
                      categoryId={cat.id}
                      onCancel={() => closeEditCategory(cat.id)}
                      onSuccess={() => handleCategoryEditSuccess(cat.id)}
                    />
                  </div>
                )}

                {/* Expanded panel: add requestor & list requestors */}
                {isExpanded && (
                  <div className="p-4 border-t border-gray-700">
                    {/* Add requestor under this category */}
                    <RequestorForm
                      categoryId={cat.id}
                      onSuccess={() => loadRequestors(cat.id)}
                    />

                    {/* Requestors list */}
                    {requestors[cat.id] && requestors[cat.id].length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {requestors[cat.id].map((r) => {
                          const isEditingReq = !!editingRequestor[r.id];
                          return (
                            <li
                              key={r.id}
                              className="bg-gray-700 p-3 rounded"
                            >
                              {isEditingReq ? (
                                <RequestorEditForm
                                  requestor={r}
                                  onCancel={() => closeEditRequestor(r.id)}
                                  onSuccess={() => handleRequestorEditSuccess(cat.id, r.id)}
                                />
                              ) : (
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-white font-medium">{r.name}</p>
                                    <p className="text-gray-300 text-sm">{r.description}</p>
                                  </div>
                                  <button
                                    onClick={() => openEditRequestor(r.id)}
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
                      <p className="text-gray-400 mt-2">No requestors added yet.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Floating Action Button (Add Category) */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="
            fixed bottom-20 right-5 z-40
            w-14 h-14 rounded-full
            bg-yellow-500 text-black
            shadow-lg hover:bg-yellow-600
            flex items-center justify-center
            focus:outline-none focus:ring-4 focus:ring-yellow-300
          "
          aria-label="Add category"
          title="Add category"
        >
          {/* Plus icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default CategoryList;
