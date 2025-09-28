// src/components/CategoryList.jsx
// This component displays all categories, allows adding new ones via CategoryForm,
// lets you add requestors via RequestorForm, supports editing requestors inline,
// and now supports editing categories inline

import React, { useEffect, useState } from 'react';
import { db } from '../db';
import CategoryForm from './CategoryForm';
import CategoryEditForm from './CategoryEditForm';
import RequestorForm from './RequestorForm';
import RequestorEditForm from './RequestorEditForm';
import BackupRestorePanel from './BackupRestorePanel';


function CategoryList() {
  // State for categories and loading
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Track which categories are expanded
  const [expanded, setExpanded] = useState({});
  // Cache requestors per category
  const [requestors, setRequestors] = useState({});
  // Track which requestors are in edit mode
  const [editMode, setEditMode] = useState({});
  // Track which categories are in edit mode
  const [categoryEditMode, setCategoryEditMode] = useState({});

  // Load all categories
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

  // Load requestors for a category
  const loadRequestors = async (catId) => {
    try {
      const reqs = await db.requestors.where('categoryId').equals(catId).toArray();
      setRequestors(prev => ({ ...prev, [catId]: reqs }));
    } catch (e) {
      console.error(`Error loading requestors for category ${catId}:`, e);
    }
  };

  // Expand/collapse category
  const toggleCategory = (catId) => {
    setExpanded(prev => {
      const now = !prev[catId];
      if (now && !requestors[catId]) loadRequestors(catId);
      return { ...prev, [catId]: now };
    });
  };

  // Requestor inline edit handlers
  const onEditClick = (id) => setEditMode(prev => ({ ...prev, [id]: true }));
  const onCancelEdit = (id) => setEditMode(prev => ({ ...prev, [id]: false }));
  const onSaveEdit = (catId, id) => { loadRequestors(catId); setEditMode(prev => ({ ...prev, [id]: false })); };

  // Category inline edit handlers
  const onCategoryEditClick = (id) => setCategoryEditMode(prev => ({ ...prev, [id]: true }));
  const onCategoryCancelEdit = (id) => setCategoryEditMode(prev => ({ ...prev, [id]: false }));
  const onCategorySaveEdit = (id) => { loadCategories(); setCategoryEditMode(prev => ({ ...prev, [id]: false })); };

  // Initial load
  useEffect(() => { loadCategories(); }, []);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Categories</h2>

      {/* Add Category Form */}
      <CategoryForm onSuccess={loadCategories} />

      {/* Loading indicator */}
      {loading && <p>Loading categories...</p>}

      {/* Empty state */}
      {!loading && categories.length === 0 && <p className="text-gray-400">No categories. Add one above.</p>}

      {/* Categories List */}
      {!loading && categories.length > 0 && (
        <ul className="space-y-4">
          {categories.map(cat => (
            <li key={cat.id} className="bg-gray-800 rounded-lg shadow-md">

              {/* Category header or edit form */}
              {categoryEditMode[cat.id] ? (
                <CategoryEditForm
                  category={cat}
                  onCancel={() => onCategoryCancelEdit(cat.id)}
                  onSuccess={() => onCategorySaveEdit(cat.id)}
                />
              ) : (
                <div className="flex justify-between items-center p-4">
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="flex-1 text-left"
                  >
                    <h3 className="font-semibold text-lg text-white">{cat.name}</h3>
                    <p className="text-gray-400 text-sm">{cat.description}</p>
                  </button>
                  <button
                    onClick={() => onCategoryEditClick(cat.id)}
                    className="ml-2 text-yellow-400 text-sm"
                  >Edit
                  </button>
                </div>
              )}

              {/* Requestor panel (only when category header is expanded and not editing category) */}
              {expanded[cat.id] && !categoryEditMode[cat.id] && (
                <div className="p-4 border-t border-gray-700">
                  {/* Add Requestor Form */}
                  <RequestorForm categoryId={cat.id} onSuccess={() => loadRequestors(cat.id)} />

                  {/* Requestors List */}
                  {requestors[cat.id] && requestors[cat.id].length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {requestors[cat.id].map(r => (
                        <li key={r.id} className="bg-gray-700 p-3 rounded hover:bg-gray-600">
                          {editMode[r.id] ? (
                            <RequestorEditForm
                              requestor={r}
                              onCancel={() => onCancelEdit(r.id)}
                              onSuccess={() => onSaveEdit(cat.id, r.id)}
                            />
                          ) : (
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-white font-medium">{r.name}</p>
                                <p className="text-gray-300 text-sm">{r.description}</p>
                              </div>
                              <button
                                onClick={() => onEditClick(r.id)}
                                className="text-blue-400 text-sm"
                              >Edit</button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-400 mt-2">No requestors yet.</p>
                  )}
                </div>
              )}

            </li>
          ))}
        </ul>
      )}
      {/* Backup & Restore section */}
<BackupRestorePanel />
    </div>
  );
}

export default CategoryList;
