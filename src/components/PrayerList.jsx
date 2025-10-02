// src/components/PrayerList.jsx
// Adds a per-prayer timeline (events) inside the EXPANDED card for Daily/Security.
// When a card is expanded, users can view the timeline and add new events.
// All previous features (FAB, edit, open-in-single, category grouping, etc.) are preserved.

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import PrayerForm from './PrayerForm';
import PrayerEditForm from './PrayerEditForm';
import PrayerEventList from './PrayerEventList';
import PrayerEventForm from './PrayerEventForm';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}
const normStatus = (s) =>
  String(s || '').toLowerCase() === 'answered' ? 'answered' : 'requested';

export default function PrayerList({ viewType = 'daily', onOpenSingle }) {
  const [prayers, setPrayers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Per-item UI state
  const [editing, setEditing] = useState({});
  const [expanded, setExpanded] = useState({});
  const [addingEvent, setAddingEvent] = useState({}); // { [prayerId]: boolean }

  // Add form visibility (FAB opens it)
  const [showAddForm, setShowAddForm] = useState(false);

  // -------- Data loading --------
  const loadPrayers = async () => {
    setLoading(true);
    try {
      const all = await db.prayers.toArray();

      // Enrich with requestor & category for each prayer
      const enriched = await Promise.all(
        all.map(async (p) => {
          const requestor = await db.requestors.get(p.requestorId);
          const category = requestor ? await db.categories.get(requestor.categoryId) : null;
          return { ...p, requestor, category };
        })
      );

      // Filter per tab
      let filtered = enriched;
      if (viewType === 'daily') {
        filtered = enriched.filter((p) => normStatus(p.status) === 'requested');
      } else if (viewType === 'security') {
        filtered = enriched.filter((p) => Number(p.security) === 1);
      }

      // Sort prayers newest-first within their category sections
      filtered.sort((a, b) => {
        const ta = new Date(a.requestedAt).getTime() || 0;
        const tb = new Date(b.requestedAt).getTime() || 0;
        return tb - ta;
      });

      setPrayers(filtered);
    } catch (err) {
      console.error('Error loading prayers:', err);
      setPrayers([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPrayers();
  }, [viewType]);

  // Auto-refresh after imports or bulk DB changes
  useEffect(() => {
    const onDbChanged = () => loadPrayers();
    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, []);

  // -------- Grouping into sections --------
  const sections = useMemo(() => {
    const buckets = new Map();
    for (const p of prayers) {
      const catId = p.category?.id ?? null;
      const catName = (p.category?.name || 'Uncategorized').trim() || 'Uncategorized';
      if (!buckets.has(catId)) {
        buckets.set(catId, { categoryId: catId, categoryName: catName, items: [] });
      }
      buckets.get(catId).items.push(p);
    }
    const list = Array.from(buckets.values());
    list.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    return list;
  }, [prayers]);

  // -------- UI handlers --------
  const handleAddSuccess = async () => {
    await loadPrayers();
    setShowAddForm(false);
  };
  const handleAddCancel = () => setShowAddForm(false);

  const toggleEdit = (id, on) => setEditing((prev) => ({ ...prev, [id]: on }));
  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleAddEvent = (id) => setAddingEvent((prev) => ({ ...prev, [id]: !prev[id] }));

  const showFab = useMemo(() => !showAddForm, [showAddForm]);

  // -------- Render --------
  return (
    <div className="relative overflow-y-auto p-4 pb-24">
      {/* Sticky Add Prayer (revealed by FAB) */}
      {showAddForm && (
        <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border-b border-gray-700 rounded-b-lg shadow-lg -mx-4 px-4 pt-4 pb-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">
                {viewType === 'security' ? 'Add Security Prayer' : 'Add Prayer'}
              </h2>
              <button
                onClick={handleAddCancel}
                className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                title="Minimize"
              >
                Minimize
              </button>
            </div>
            <PrayerForm onSuccess={handleAddSuccess} onCancel={handleAddCancel} />
          </div>
        </div>
      )}

      <h2 className="text-2xl font-bold mb-4">
        {viewType === 'security' ? 'Security View' : 'Daily Prayers'}
      </h2>

      {loading && <p className="text-gray-400">Loading…</p>}
      {!loading && sections.length === 0 && (
        <p className="text-gray-400">No prayers to display.</p>
      )}

      {/* Category sections */}
      {!loading && sections.length > 0 && (
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.categoryId ?? 'uncat'}>
              <div className="sticky top-0 -mx-4 px-4 py-2 bg-gray-900/95 backdrop-blur border-b border-gray-800 z-10">
                <h3 className="text-lg font-semibold text-yellow-300">
                  {section.categoryName}
                </h3>
              </div>

              <ul className="mt-2 space-y-3">
                {section.items.map((p) => {
                  const isEditing = !!editing[p.id];
                  const isExpanded = !!expanded[p.id];
                  const isAddingEvent = !!addingEvent[p.id];

                  return (
                    <li key={p.id} className="bg-gray-800 rounded-lg p-3 shadow">
                      {isEditing ? (
                        <PrayerEditForm
                          prayer={p}
                          onCancel={() => toggleEdit(p.id, false)}
                          onSuccess={async () => {
                            await loadPrayers();
                            toggleEdit(p.id, false);
                          }}
                        />
                      ) : (
                        <>
                          {/* Header row */}
                          <div
                            className="flex items-start justify-between cursor-pointer select-none"
                            onClick={() => toggleExpand(p.id)}
                          >
                            <div>
                              <h4 className="text-white font-semibold">{p.name}</h4>
                              <div className="text-gray-400 text-sm space-x-2">
                                <span>{p.requestor?.name || 'Unknown'}</span>
                                {p.requestedAt && (
                                  <>
                                    <span>•</span>
                                    <span>{formatDate(p.requestedAt)}</span>
                                  </>
                                )}
                                {Number(p.security) === 1 && (
                                  <>
                                    <span>•</span>
                                    <span className="uppercase text-xs tracking-wide text-yellow-300">
                                      Security
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (typeof onOpenSingle === 'function') onOpenSingle(p.id);
                                }}
                                className="text-sm px-2 py-1 rounded bg-yellow-500 hover:bg-yellow-600 text-black"
                                title="Open in Single View"
                              >
                                Single
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleEdit(p.id, true);
                                }}
                                className="text-sm px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                              >
                                Edit
                              </button>
                            </div>
                          </div>

                          {/* Collapsed body (teaser) */}
                          {p.description && !isExpanded && (
                            <p className="mt-2 text-gray-200 line-clamp-3 whitespace-pre-wrap">
                              {p.description}
                            </p>
                          )}

                          {/* Expanded body with timeline */}
                          {isExpanded && (
                            <div className="mt-3 text-gray-200 space-y-3">
                              {/* Full description */}
                              <div>
                                <h5 className="text-white font-semibold mb-1">Details</h5>
                                <p className="whitespace-pre-wrap">
                                  {p.description || '(No additional details.)'}
                                </p>
                              </div>

                              {/* Timeline header + toggle add form */}
                              <div className="flex items-center justify-between">
                                <h5 className="text-white font-semibold">Timeline</h5>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleAddEvent(p.id);
                                  }}
                                  className="text-sm px-2 py-1 rounded bg-yellow-500 hover:bg-yellow-600 text-black"
                                >
                                  {isAddingEvent ? 'Close' : 'Add Event'}
                                </button>
                              </div>

                              {/* Add Event form */}
                              {isAddingEvent && (
                                <PrayerEventForm
                                  prayerId={p.id}
                                  onSuccess={() => toggleAddEvent(p.id)}
                                  onCancel={() => toggleAddEvent(p.id)}
                                />
                              )}

                              {/* Timeline list */}
                              <PrayerEventList prayerId={p.id} compact />
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Floating Action Button */}
      {showFab && (
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
          aria-label="Add prayer"
          title="Add prayer"
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
          </svg>
        </button>
      )}
    </div>
  );
}
