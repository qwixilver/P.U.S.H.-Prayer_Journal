// src/components/PrayerList.jsx
// Daily/Security list with:
// - FAB to open "Add Prayer" sticky form (unchanged from your last version)
// - Inline EXPAND: clicking the card body toggles a fuller details view
// - "Open in Single View" button: jumps to Single tab focused on this prayer
//
// Requires App.jsx to pass:
//   <PrayerList onOpenSingle={(id) => ...} />
//
// Notes:
// - We stop propagation on the Edit button so it doesn't trigger expand.
// - Expanded view shows more spacing and keeps description visible.
// - The sticky Add form closes on Save/Cancel as before.

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import PrayerForm from './PrayerForm';
import PrayerEditForm from './PrayerEditForm';

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
  const [editing, setEditing] = useState({});
  const [expanded, setExpanded] = useState({}); // NEW: track which cards are expanded
  const [showAddForm, setShowAddForm] = useState(false);

  const loadPrayers = async () => {
    setLoading(true);
    try {
      const all = await db.prayers.toArray();
      const enriched = await Promise.all(
        all.map(async (p) => {
          const requestor = await db.requestors.get(p.requestorId);
          const category = requestor ? await db.categories.get(requestor.categoryId) : null;
          return { ...p, requestor, category };
        })
      );

      let filtered = enriched;
      if (viewType === 'daily') {
        filtered = enriched.filter((p) => normStatus(p.status) === 'requested');
      } else if (viewType === 'security') {
        filtered = enriched.filter((p) => Number(p.security) === 1);
      }

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

  useEffect(() => {
    const onDbChanged = () => loadPrayers();
    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, []);

  const handleAddSuccess = async () => {
    await loadPrayers();
    setShowAddForm(false);
  };
  const handleAddCancel = () => setShowAddForm(false);

  const toggleEdit = (id, on) => setEditing((prev) => ({ ...prev, [id]: on }));
  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const showFab = useMemo(() => !showAddForm, [showAddForm]);

  return (
    <div className="relative h-full overflow-auto pb-20 p-4">
      {/* Sticky Add Form */}
      {showAddForm && (
        <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border-b border-gray-700 rounded-b-lg shadow-lg -mx-4 px-4 pt-4 pb-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Add Prayer</h2>
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
      {!loading && prayers.length === 0 && (
        <p className="text-gray-400">No prayers to display.</p>
      )}

      <ul className="space-y-3">
        {prayers.map((p) => {
          const isEditing = !!editing[p.id];
          const isExpanded = !!expanded[p.id];
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
                  {/* Card header: click area toggles expand (except the buttons) */}
                  <div
                    className="flex items-start justify-between cursor-pointer select-none"
                    onClick={() => toggleExpand(p.id)}
                  >
                    <div>
                      <h4 className="text-white font-semibold">{p.name}</h4>
                      <div className="text-gray-400 text-sm space-x-2">
                        <span>{p.requestor?.name || 'Unknown'}</span>
                        <span>•</span>
                        <span>{p.category?.name || 'Uncategorized'}</span>
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
                      {/* Open in Single View button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // don't toggle expand
                          if (typeof onOpenSingle === 'function') {
                            onOpenSingle(p.id);
                          } else {
                            console.warn('onOpenSingle not provided to PrayerList');
                          }
                        }}
                        className="text-sm px-2 py-1 rounded bg-yellow-500 hover:bg-yellow-600 text-black"
                        title="Open in Single View"
                      >
                        Single
                      </button>

                      {/* Edit button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // don't toggle expand
                          toggleEdit(p.id, true);
                        }}
                        className="text-sm px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* Condensed description always visible a bit; 
                      Expanded area shows the full details with nicer spacing */}
                  {p.description && !isExpanded && (
                    <p className="mt-2 text-gray-200 line-clamp-3 whitespace-pre-wrap">
                      {p.description}
                    </p>
                  )}

                  {isExpanded && (
                    <div className="mt-3 text-gray-200 space-y-2">
                      <p className="whitespace-pre-wrap">{p.description || '(No additional details.)'}</p>
                      {/* You can add more fields here later (e.g., answered notes, tags, etc.) */}
                      <div className="text-xs text-gray-400">
                        Tap card to collapse.
                      </div>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* Floating Add button */}
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
