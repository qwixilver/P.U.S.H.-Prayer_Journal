// src/components/PrayerList.jsx
// Daily/Security list:
// - DAILY: Group by Category (large header) and within each Category, group by Requestor
//          (smaller subheader + distinct container margin/padding).
// - SECURITY: Flat list (unchanged).
// - Prayer cards show requestor, requested date, and status.
// - Add via FAB; Edit opens modal reusing the Add Prayer form (no changes to events).

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import PrayerForm from './PrayerForm';
import PrayerUpsertModal from './PrayerUpsertModal';

// Format helper
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

  // Expanded per prayer id
  const [expanded, setExpanded] = useState({});
  // Show add form (sticky) toggle
  const [showAddForm, setShowAddForm] = useState(false);
  // Edit modal target (prayer object)
  const [editTarget, setEditTarget] = useState(null);

  // --- Data load -------------------------------------------------------------
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

      // Filter for Security view (unchanged)
      const filtered = isSecurity ? prs.filter((p) => Boolean(p.security)) : prs;

      // Sort newest requested first (stable enough for daily)
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

  // Quick lookup maps for grouping/labels
  const catById = useMemo(() => {
    const m = new Map();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const reqById = useMemo(() => {
    const m = new Map();
    for (const r of requestors) m.set(r.id, r);
    return m;
  }, [requestors]);

  // --- Grouping --------------------------------------------------------------
  // SECURITY: keep flat (unchanged).
  // DAILY: Category -> (Requestor -> [prayers])
  const groupedDaily = useMemo(() => {
    if (isSecurity) return null;

    // Category name => Map(RequestorId => Prayer[])
    const byCat = new Map();

    for (const p of prayers) {
      const req = reqById.get(p.requestorId);
      const cat = req ? catById.get(req.categoryId) : null;
      const catName = cat?.name || 'Unassigned';
      const reqId = req?.id ?? -1; // -1 for prayers without a requestor
      if (!byCat.has(catName)) byCat.set(catName, new Map());
      const byReq = byCat.get(catName);
      if (!byReq.has(reqId)) byReq.set(reqId, []);
      byReq.get(reqId).push(p);
    }

    // Convert nested Maps into a plain object:
    // {
    //   [catName]: [{ requestorId, requestorName, items: Prayer[] }, ...]
    // }
    const out = {};
    for (const [catName, byReq] of byCat.entries()) {
      const groups = [];
      for (const [reqId, items] of byReq.entries()) {
        const r = reqById.get(reqId);
        groups.push({
          requestorId: reqId,
          requestorName: r?.name || 'Unassigned',
          items,
        });
      }
      // Sort requestor groups alphabetically by name for a stable UI
      groups.sort((a, b) => a.requestorName.localeCompare(b.requestorName));
      out[catName] = groups;
    }
    return out;
  }, [isSecurity, prayers, reqById, catById]);

  // --- Actions ---------------------------------------------------------------
  const handleAddSuccess = async () => {
    await load();
    setShowAddForm(false);
  };

  // --- Render ---------------------------------------------------------------
  return (
    <div className="relative overflow-y-auto p-4 pb-24">
      {/* Sticky header: Add Prayer form (only when user expands it via FAB) */}
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

      {!loading && !prayers.length && (
        <p className="text-gray-400">No prayers found.</p>
      )}

      {/* SECURITY VIEW: flat list (unchanged) */}
      {!loading && isSecurity && !!prayers.length && (
        <section className="mb-6">
          <ul className="space-y-3">
            {prayers.map((p) => {
              const req = reqById.get(p.requestorId);
              const reqName = req?.name || 'Unassigned';
              return (
                <li key={p.id} className="bg-gray-800 rounded-lg p-3 shadow">
                  <div className="flex items-start justify-between">
                    <div
                      className="flex-1 cursor-pointer select-none"
                      onClick={() => setExpanded((m) => ({ ...m, [p.id]: !m[p.id] }))}
                    >
                      <h4 className="text-white font-semibold">{p.name}</h4>
                      <p className="text-gray-300 text-sm line-clamp-2">{p.description}</p>
                      <div className="text-gray-400 text-xs mt-1">
                        Requestor: {reqName} • Requested: {fmt(p.requestedAt)} • Status: {p.status}
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
                          setEditTarget(p);
                        }}
                        className="text-sm px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {expanded[p.id] && (
                    <div className="mt-2 text-gray-200 whitespace-pre-wrap">
                      {p.description}
                      {/* Your events UI remains here if previously present. */}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* DAILY VIEW: Category ➜ Requestor groups */}
      {!loading && !isSecurity && groupedDaily && Object.keys(groupedDaily).map((catName) => (
        <section key={catName} className="mb-6">
          {/* Category header (large) */}
          <h3 className="text-lg font-semibold text-white mb-2">{catName}</h3>

          {/* Each requestor group under this category */}
          <div className="space-y-4">
            {groupedDaily[catName].map(({ requestorId, requestorName, items }) => (
              <div
                key={`${catName}-${requestorId}`}
                className="mt-2 rounded-lg border border-gray-700 p-2"
              >
                {/* Requestor subheader: smaller text and subtle spacing */}
                <h4 className="text-sm font-semibold text-gray-200 mb-2">
                  {requestorName}
                </h4>

                <ul className="space-y-3">
                  {items.map((p) => (
                    <li key={p.id} className="bg-gray-800 rounded-lg p-3 shadow">
                      <div className="flex items-start justify-between">
                        <div
                          className="flex-1 cursor-pointer select-none"
                          onClick={() => setExpanded((m) => ({ ...m, [p.id]: !m[p.id] }))}
                        >
                          <h5 className="text-white font-semibold">{p.name}</h5>
                          <p className="text-gray-300 text-sm line-clamp-2">{p.description}</p>

                          {/* Meta: restore requestor info + keep date & status */}
                          <div className="text-gray-400 text-xs mt-1">
                            Requestor: {requestorName} • Requested: {fmt(p.requestedAt)} • Status: {p.status}
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
                              setEditTarget(p); // open modal editor
                            }}
                            className="text-sm px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Edit
                          </button>
                        </div>
                      </div>

                      {/* Expanded details (your events UI remains here if previously present) */}
                      {expanded[p.id] && (
                        <div className="mt-2 text-gray-200 whitespace-pre-wrap">
                          {p.description}
                          {/* events UI lives below description if you previously included it here */}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* FAB: show add form */}
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
