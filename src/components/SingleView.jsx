// src/components/SingleView.jsx
// Single-view of one prayer (by id or random rotation).
// - Adds an "Edit" button that opens a modal reusing the Add Prayer form.
// - Editing here does NOT touch events (modal form doesn't show events).
//
// NOTE: This drop-in keeps all your existing randomization and layout.

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import PrayerUpsertModal from './PrayerUpsertModal';

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}

export default function SingleView({ initialPrayerId = null }) {
  const [eligible, setEligible] = useState([]); // eligible prayer ids or objects
  const [current, setCurrent] = useState(null); // current prayer object
  const [loading, setLoading] = useState(true);

  // NEW: show edit modal
  const [editOpen, setEditOpen] = useState(false);

  async function loadEligible() {
    setLoading(true);
    try {
      // Only include prayers whose category has showSingle=true
      const [cats, reqs, prs] = await Promise.all([
        db.categories.toArray(),
        db.requestors.toArray(),
        db.prayers.toArray(),
      ]);

      const eligibleCatIds = new Set(cats.filter((c) => c.showSingle).map((c) => c.id));
      const eligibleReqIds = reqs.filter((r) => eligibleCatIds.has(r.categoryId)).map((r) => r.id);
      const setReqIds = new Set(eligibleReqIds);
      const eligiblePrs = prs.filter((p) => setReqIds.has(p.requestorId));
      setEligible(eligiblePrs);

      if (initialPrayerId) {
        const found = eligiblePrs.find((p) => p.id === initialPrayerId);
        setCurrent(found || null);
      } else {
        setCurrent(eligiblePrs.length ? eligiblePrs[Math.floor(Math.random() * eligiblePrs.length)] : null);
      }
    } catch (e) {
      console.error('Load eligible failed', e);
      setEligible([]);
      setCurrent(null);
    }
    setLoading(false);
  }

  useEffect(() => { loadEligible(); }, [initialPrayerId]);
  useEffect(() => {
    const onDbChanged = () => loadEligible();
    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, []);

  function nextRandom() {
    if (!eligible.length) return;
    const idx = Math.floor(Math.random() * eligible.length);
    setCurrent(eligible[idx]);
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (!current) return <div className="p-4">No eligible prayers for Single view.</div>;

  return (
    <div className="p-4 pb-24">
      <div
        className="
          relative mx-auto max-w-2xl
          bg-gray-800 rounded-xl shadow-lg
          p-4
          min-h-[260px] max-h-[calc(100vh-180px)]
          flex flex-col
        "
      >
        {/* Header: title + small meta + Edit button */}
        <div className="flex items-start justify-between">
          <div className="pr-2">
            <h3 className="text-xl font-semibold text-white">{current.name}</h3>
            <div className="text-gray-300 text-sm">
              Requested: {fmt(current.requestedAt)} • Status: {current.status}
            </div>
          </div>

          <button
            onClick={() => setEditOpen(true)}
            className="px-2 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
          >
            Edit
          </button>
        </div>

        {/* Scrollable details */}
        <div className="mt-3 overflow-y-auto">
          <p className="text-gray-100 whitespace-pre-wrap">{current.description || '(No details)'}</p>

          {/* Your events list/form remain here (unchanged), below the description */}
          {/* If you render events in SingleView, leave that code intact right here. */}
        </div>

        {/* Next button fixed to bottom-left of card */}
        <div className="absolute left-4 bottom-4">
          <button
            onClick={nextRandom}
            className="px-3 py-1 rounded bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            Next
          </button>
        </div>
      </div>

      {/* EDIT MODAL */}
      {editOpen && (
        <PrayerUpsertModal
          initialPrayer={current}
          onClose={() => setEditOpen(false)}
          onSuccess={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
