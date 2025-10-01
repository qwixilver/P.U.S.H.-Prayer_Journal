// src/components/SingleView.jsx
// Single-card view:
// - If `initialPrayerId` is provided, loads that specific prayer.
// - Otherwise picks a random requested prayer, preferring categories with showSingle=true,
//   with a fallback to all requested.
// - Card is sized with a safe maxHeight so the "Next" button is always reachable.

import React, { useEffect, useState } from 'react';
import { db } from '../db';

export default function SingleView({ initialPrayerId = null }) {
  const [prayer, setPrayer] = useState(null);
  const [hint, setHint] = useState('');

  const normStatus = (s) =>
    String(s || '').toLowerCase() === 'answered' ? 'answered' : 'requested';

  const loadPrayerById = async (id) => {
    try {
      const p = await db.prayers.get(id);
      if (!p) {
        setPrayer(null);
        setHint('Prayer not found.');
        return;
      }
      const requestor = await db.requestors.get(p.requestorId);
      const category = requestor ? await db.categories.get(requestor.categoryId) : null;
      setPrayer({ ...p, requestor, category });
      setHint('');
    } catch (e) {
      console.error('SingleView loadPrayerById error:', e);
      setPrayer(null);
    }
  };

  const loadRandomPrayer = async () => {
    try {
      const allPrayers = await db.prayers.toArray();
      const enriched = await Promise.all(
        allPrayers.map(async (p) => {
          const requestor = await db.requestors.get(p.requestorId);
          const category = requestor ? await db.categories.get(requestor.categoryId) : null;
          return { ...p, requestor, category };
        })
      );

      const requested = enriched.filter((p) => normStatus(p.status) === 'requested');
      const singles = requested.filter(
        (p) => p.category && (p.category.showSingle === 1 || p.category.showSingle === true)
      );

      let pool = singles;
      setHint('');
      if (pool.length === 0) {
        pool = requested;
        if (requested.length > 0) {
          setHint(
            'Tip: No categories are set to “Include in Single View”. Showing all requests. Enable this in Categories → Edit Category.'
          );
        }
      }

      if (pool.length === 0) {
        setPrayer(null);
        return;
      }

      const pick = pool[Math.floor(Math.random() * pool.length)];
      setPrayer(pick);
    } catch (e) {
      console.error('SingleView loadRandomPrayer error:', e);
      setPrayer(null);
    }
  };

  // React to targeted id vs random
  useEffect(() => {
    if (initialPrayerId != null) {
      loadPrayerById(initialPrayerId);
    } else {
      loadRandomPrayer();
    }
  }, [initialPrayerId]);

  // Refresh when DB changes (e.g. after imports)
  useEffect(() => {
    const onDbChanged = () => {
      if (initialPrayerId != null) {
        loadPrayerById(initialPrayerId);
      } else {
        loadRandomPrayer();
      }
    };
    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, [initialPrayerId]);

  if (!prayer) {
    return (
      <div className="flex flex-col items-center justify-center p-4">
        <p className="text-gray-400 mb-4">No prayers to show.</p>
        {hint && <p className="text-gray-500 text-sm mb-4 text-center max-w-md">{hint}</p>}
        <button
          onClick={loadRandomPrayer}
          className="px-6 py-3 bg-yellow-500 text-black rounded-lg font-semibold hover:bg-yellow-600"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-hidden">
      <div
        className="
          w-full max-w-xl mx-auto bg-gray-800 rounded-lg shadow-lg overflow-hidden
          grid grid-rows-[auto_1fr_auto]
        "
        style={{ maxHeight: 'calc(100vh - 160px)' }} // room for headers + bottom nav
      >
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-2">{prayer.name}</h2>
          <div className="text-gray-400 text-sm space-y-1">
            <p>
              <span className="font-semibold text-white">Requestor: </span>
              {prayer.requestor?.name || 'Unknown'}
            </p>
            <p>
              <span className="font-semibold text-white">Category: </span>
              {prayer.category?.name || 'Unknown'}
            </p>
            <p>
              <span className="font-semibold text-white">Date: </span>
              {new Date(prayer.requestedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="overflow-y-auto px-6 text-gray-200">
          {prayer.description ? (
            <p className="whitespace-pre-wrap">{prayer.description}</p>
          ) : (
            <p className="text-gray-500 italic">(No additional details.)</p>
          )}
        </div>

        <button
          onClick={loadRandomPrayer}
          className="m-4 px-8 py-3 bg-yellow-500 text-black rounded-lg font-semibold hover:bg-yellow-600 justify-self-start"
        >
          Next
        </button>
      </div>

      {hint && <p className="text-gray-400 text-xs text-center mt-3">{hint}</p>}
    </div>
  );
}
