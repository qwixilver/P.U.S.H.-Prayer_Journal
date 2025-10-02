// src/components/CategoryList.jsx
// Categories page with:
// - Floating Action Button (FAB) to open a sticky "Add Category" form at the top
// - Expandable category panels that show RequestorForm + requestor list
// - Auto-refresh on db:changed
// - Bottom padding so nothing sits under the BottomNav

import React, { useEffect, useState } from 'react';
import { db } from '../db';
import CategoryForm from './CategoryForm';
import RequestorForm from './RequestorForm';

function CategoryList() {
  // Data state
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [expanded, setExpanded] = useState({});   // which category ids are expanded
  const [requestors, setRequestors] = useState({}); // cache: { [catId]: Requestor[] }
  const [showAddForm, setShowAddForm] = useState(false); // FAB → sticky add form

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
            {/* Same CategoryForm, but now shown inside the sticky panel */}
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
          {categories.map((cat) => (
            <li key={cat.id} className="bg-gray-800 rounded-lg shadow-md">
              {/* Non-editable header here; edit happens on the requestor side or a dedicated edit form */}
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full text-left p-4 flex justify-between items-center"
              >
                <div>
                  <h3 className="font-semibold text-lg text-white">{cat.name}</h3>
                  <p className="text-gray-400 text-sm">{cat.description}</p>
                </div>
                <span className="text-white text-xl">
                  {expanded[cat.id] ? '▾' : '▸'}
                </span>
              </button>

              {/* Expanded panel: add requestor & list requestors */}
              {expanded[cat.id] && (
                <div className="p-4 border-t border-gray-700">
                  {/* Add requestor under this category */}
                  <RequestorForm
                    categoryId={cat.id}
                    onSuccess={() => loadRequestors(cat.id)}
                  />

                  {/* Requestors list */}
                  {requestors[cat.id] && requestors[cat.id].length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {requestors[cat.id].map((r) => (
                        <li
                          key={r.id}
                          className="bg-gray-700 p-3 rounded hover:bg-gray-600"
                        >
                          <p className="text-white font-medium">{r.name}</p>
                          <p className="text-gray-300 text-sm">{r.description}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-400 mt-2">No requestors added yet.</p>
                  )}
                </div>
              )}
            </li>
          ))}
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
