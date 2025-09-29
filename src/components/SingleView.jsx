// src/components/SingleView.jsx
// Shows one random "requested" prayer. Prefers categories marked showSingle,
// but gracefully falls back to any requested prayer if none are flagged.

import React, { useState, useEffect } from 'react';
import { db } from '../db';

export default function SingleView() {
  const [prayer, setPrayer] = useState(null);
  const [hint, setHint] = useState('');

  // Normalize a status string to 'requested'|'answered'
  const normStatus = (s) => (String(s || '').toLowerCase() === 'answered' ? 'answered' : 'requested');

  const loadRandomPrayer = async () => {
    try {
      // 1) Load everything and filter in JS (avoids needing an index on 'status')
      const allPrayers = await db.prayers.toArray();

      // 2) Enrich each with its Requestor + Category
      const enriched = await Promise.all(
        allPrayers.map(async (p) => {
          const requestor = await db.requestors.get(p.requestorId);
          const category = requestor ? await db.categories.get(requestor.categoryId) : null;
          return { ...p, requestor, category };
        })
      );

      // 3) Keep only 'requested'
      const requested = enriched.filter((p) => normStatus(p.status) === 'requested');

      // 4) Try “single-eligible” first
      const singles = requested.filter((p) => p.category && (p.category.showSingle === 1 || p.category.showSingle === true));

      let pool = singles;
      setHint('');
      if (pool.length === 0) {
        // 5) Fallback to *all* requested if no categories are flagged
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
      console.error('SingleView load error:', e);
      setPrayer(null);
    }
  };

  useEffect(() => {
    loadRandomPrayer();
  }, []);

  // Also refresh when other parts of the app import data, etc.
  useEffect(() => {
    const onDbChanged = () => loadRandomPrayer();
    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, []);

  if (!prayer) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
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
    <div className="p-4 h-full overflow-hidden">
      <div
        className="
          w-full max-w-xl mx-auto bg-gray-800 rounded-lg shadow-lg overflow-hidden
          grid grid-rows-[auto_1fr_auto]
        "
        style={{ maxHeight: '100%' }}
      >
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-2">{prayer.name}</h2>
          <div className="text-gray-400 text-sm space-y-1">
            <p><span className="font-semibold text-white">Requestor: </span>{prayer.requestor?.name || 'Unknown'}</p>
            <p><span className="font-semibold text-white">Category: </span>{prayer.category?.name || 'Unknown'}</p>
            <p><span className="font-semibold text-white">Date: </span>{new Date(prayer.requestedAt).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="overflow-y-auto px-6 text-gray-200">
          {prayer.description ? <p>{prayer.description}</p> : <p className="text-gray-500 italic">(No additional details.)</p>}
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
