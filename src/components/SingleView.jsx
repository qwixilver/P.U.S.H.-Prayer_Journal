// src/components/SingleView.jsx
// Focus view of one eligible prayer, opened directly by ID or chosen randomly.
// Editing does not modify the prayer's event timeline.

import React, { useCallback, useEffect, useState } from 'react';
import { db } from '../db';
import PrayerUpsertModal from './PrayerUpsertModal';
import PrayerEventList from './PrayerEventList';
import PrayerEventForm from './PrayerEventForm';

function fmt(iso) {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString();
}

function randomPrayer(prayers) {
  if (!prayers.length) return null;
  return prayers[Math.floor(Math.random() * prayers.length)];
}

function getPrayerStatus(prayer) {
  const normalizedStatus = String(prayer?.status ?? '')
    .trim()
    .toLowerCase();

  if (normalizedStatus === 'answered') return 'answered';
  if (normalizedStatus === 'requested') return 'requested';

  // Legacy fallback only: explicit status always wins when present.
  return prayer?.answeredAt ? 'answered' : 'requested';
}

function isActivePrayer(prayer) {
  return getPrayerStatus(prayer) === 'requested';
}

export default function SingleView({ initialPrayerId = null }) {
  const [eligible, setEligible] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);

  const loadEligible = useCallback(async ({ preferInitial = false } = {}) => {
    setLoading(true);

    try {
      const [categories, requestors, prayers] = await Promise.all([
        db.categories.toArray(),
        db.requestors.toArray(),
        db.prayers.toArray(),
      ]);

      const eligibleCategoryIds = new Set(
        categories
          .filter((category) => Boolean(category.showSingle))
          .map((category) => category.id)
      );
      const eligibleRequestorIds = new Set(
        requestors
          .filter((requestor) => eligibleCategoryIds.has(requestor.categoryId))
          .map((requestor) => requestor.id)
      );
      const eligiblePrayers = prayers.filter(
        (prayer) =>
          eligibleRequestorIds.has(prayer.requestorId) &&
          isActivePrayer(prayer)
      );

      setEligible(eligiblePrayers);
      setCurrent((previous) => {
        if (preferInitial && initialPrayerId != null) {
          return eligiblePrayers.find((prayer) => prayer.id === initialPrayerId) || null;
        }

        if (previous) {
          const refreshed = eligiblePrayers.find((prayer) => prayer.id === previous.id);
          if (refreshed) return refreshed;
        }

        return randomPrayer(eligiblePrayers);
      });
    } catch (error) {
      console.error('Load eligible failed', error);
      setEligible([]);
      setCurrent(null);
    } finally {
      setLoading(false);
    }
  }, [initialPrayerId]);

  useEffect(() => {
    loadEligible({ preferInitial: true });
  }, [loadEligible]);

  useEffect(() => {
    const onDbChanged = () => loadEligible({ preferInitial: false });

    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, [loadEligible]);

  function nextRandom() {
    if (!eligible.length) return;

    setAddEventOpen(false);
    setCurrent(randomPrayer(eligible));
  }

  if (loading) return <div className="p-4">Loading…</div>;

  if (!current) {
    return <div className="p-4">No eligible prayers for Focus.</div>;
  }

  return (
    <div className="p-4 pb-24">
      <div
        className="
          relative mx-auto max-w-2xl
          bg-gray-800 rounded-xl shadow-lg
          p-4
          min-h-[260px] max-h-[calc(100vh-180px)]
          flex flex-col overflow-hidden
        "
      >
        <div className="flex items-start justify-between">
          <div className="pr-2">
            <h3 className="text-xl font-semibold text-white">{current.name}</h3>
            <div className="text-gray-300 text-sm">
              Requested: {fmt(current.requestedAt)} • Status: Requested
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="px-2 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
          >
            Edit
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="text-gray-100 whitespace-pre-wrap">
            {current.description || '(No details)'}
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-white font-semibold">Events</h4>
              <button
                type="button"
                onClick={() => setAddEventOpen((open) => !open)}
                className="text-sm px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {addEventOpen ? 'Close' : 'Add event'}
              </button>
            </div>

            {addEventOpen && (
              <PrayerEventForm
                prayerId={current.id}
                onSuccess={() => setAddEventOpen(false)}
                onCancel={() => setAddEventOpen(false)}
              />
            )}

            <PrayerEventList prayerId={current.id} allowDelete />
          </div>
        </div>

        <div className="mt-3 border-t border-gray-700 pt-3 flex-shrink-0">
          <button
            type="button"
            onClick={nextRandom}
            className="px-3 py-1 rounded bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            Next
          </button>
        </div>
      </div>

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
