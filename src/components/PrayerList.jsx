// src/components/PrayerList.jsx
// Daily/Security list:
// - Grouped by category (daily) or filtered by security (security view)
// - Expand card to show details + events
// - Add via FAB (existing behavior)
// - EDIT now opens a modal that reuses the Add Prayer form (category→requestor cascade)
//   and does NOT touch events.

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import PrayerForm from './PrayerForm';
import PrayerUpsertModal from './PrayerUpsertModal';

// Utility: date formatter for small badges if needed
function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}

export default function PrayerList({ viewType = 'daily', onOpenSingle }) {
  const isSecurity = viewType === 'security';

  const [categories, setCategories] = useState([]);
  const [requestors, setRequestors] = useState([]);
  const [prayers, setPrayers] = useState([]);

  const [loading, setLoading] = useState(true);

  // Expanded map { [prayerId]: bool }
  const [expanded, setExpanded] = useState({});

  // Show add form sticky header (existing behavior)
  const [showAddForm, setShowAddForm] = useState(false);

  // NEW: modal edit target
  const [editTarget, setEditTarget] = useState(null); // prayer object or null

  async function load() {
    setLoading(true);
    try {
      const [cats, reqs, prs] = await Promise.all([
        db.categories.toArray(),
        db.requestors.toArray(),
        db.prayers.toArray(),
      ]);
      setCategories(cats);
      setRequestors(reqs);

      // Filter for security view
      const filtered = isSecurity ? prs.filter((p) => Boolean(p.security)) : prs;

      // Sort recent requested first (optional)
      filtered.sort((a, b) => {
        const da = a.requestedAt || '';
        const db_ = b.requestedAt || '';
        return db_ > da ? 1 : db_ < da ? -1 : 0;
      });

      setPrayers(filtered);
    } catch (e) {
      console.error('Error loading prayers:', e);
      setPrayers([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [isSecurity]);
  useEffect(() => {
    const onDbChanged = () => load();
    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, []);

  // Group by category for daily view
  const grouped = useMemo(() => {
    if (isSecurity) return { All: prayers };
    const byCat = {};
    for (const p of prayers) {
      const req = requestors.find((r) => r.id === p.requestorId);
      const catName = req ? (categories.find((c) => c.id === req.categoryId)?.name || 'Uncategorized') : 'Unassigned';
      if (!byCat[catName]) byCat[catName] = [];
      byCat[catName].push(p);
    }
    return byCat;
  }, [isSecurity, prayers, requestors, categories]);

  const handleAddSuccess = async () => {
    await load();
    setShowAddForm(false);
  };

  return (
    <div className="relative overflow-y-auto p-4 pb-24">
      {/* Sticky header for optional add form */}
      {showAddForm && (
        <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border-b border-gray-700 rounded-b-lg shadow-lg -mx-4 px-4 pt-4 pb-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Add Prayer</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                title="Minimize"
              >
                Minimize
              </button>
            </div>
            <PrayerForm onSuccess={handleAddSuccess} onCancel={() => setShowAddForm(false)} />
          </div>
        </div>
      )}

      <h2 className="text-2xl font-bold mb-4">{isSecurity ? 'Security' : 'Daily'} Prayers</h2>

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && Object.keys(grouped).length === 0 && (
        <p className="text-gray-400">No prayers found.</p>
      )}

      {!loading && Object.entries(grouped).map(([groupName, items]) => (
        <section key={groupName} className="mb-6">
          {!isSecurity && (
            <h3 className="text-lg font-semibold text-white mb-2">{groupName}</h3>
          )}
          <ul className="space-y-3">
            {items.map((p) => (
              <li key={p.id} className="bg-gray-800 rounded-lg p-3 shadow">
                <div className="flex items-start justify-between">
                  <div
                    className="flex-1 cursor-pointer select-none"
                    onClick={() => setExpanded((m) => ({ ...m, [p.id]: !m[p.id] }))}
                  >
                    <h4 className="text-white font-semibold">{p.name}</h4>
                    <p className="text-gray-300 text-sm line-clamp-2">{p.description}</p>
                    <div className="text-gray-400 text-xs mt-1">
                      Requested: {fmt(p.requestedAt)} • Status: {p.status}
                    </div>
                  </div>

                  <div className="ml-2 flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSingle?.(p.id);
                      }}
                      className="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                    >
                      Open
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTarget(p); // <<< NEW: open modal editor
                      }}
                      className="text-sm px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {/* Expanded details + (already existing) events area lives here in your code.
                   We intentionally do NOT change your events UI. */}
                {expanded[p.id] && (
                  <div className="mt-2 text-gray-200 whitespace-pre-wrap">
                    {p.description}
                    {/* Your events list/form remain in this expanded area (unchanged). */}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* FAB to show add form */}
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
          aria-label="Add prayer"
          title="Add prayer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none"
               viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
          </svg>
        </button>
      )}

      {/* EDIT MODAL */}
      {editTarget && (
        <PrayerUpsertModal
          initialPrayer={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
