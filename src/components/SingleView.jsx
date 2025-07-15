// src/components/SingleView.jsx

import React, { useState, useEffect } from 'react';
import { db } from '../db';

/**
 * SingleView
 *
 * Fetch and display one random "requested" prayer whose category
 * has showSingle === true.  The card:
 *  - Grows to fit its content but never exceeds the view's height
 *  - Shows title, requestor, category, and requested date
 *  - Contains a scrollable description area if needed
 *  - Has a "Next" button fixed at its bottom-left, which picks another prayer
 */
export default function SingleView() {
  // The enriched prayer to display
  const [prayer, setPrayer] = useState(null);

  /**
   * loadRandomPrayer
   * 1. Load all prayers with status 'requested'
   * 2. Enrich each with its requestor & category
   * 3. Filter to those categories where showSingle === true
   * 4. Pick one at random or null if none exist
   */
  const loadRandomPrayer = async () => {
    // Step 1
    const rawPrayers = await db.prayers
      .where('status')
      .equals('requested')
      .toArray();

    // Step 2: enrich
    const enriched = await Promise.all(
      rawPrayers.map(async (p) => {
        const requestor = await db.requestors.get(p.requestorId);
        const category = requestor
          ? await db.categories.get(requestor.categoryId)
          : null;
        return { ...p, requestor, category };
      })
    );

    // Step 3: filter by category.showSingle
    const allowed = enriched.filter(
      (e) => e.category && e.category.showSingle
    );

    // Step 4: random pick
    if (allowed.length === 0) {
      setPrayer(null);
    } else {
      const idx = Math.floor(Math.random() * allowed.length);
      setPrayer(allowed[idx]);
    }
  };

  // On mount, load the first prayer
  useEffect(() => {
    loadRandomPrayer();
  }, []);

  // If none to show, render a placeholder + retry button
  if (!prayer) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <p className="text-gray-400 mb-4">No prayers to show.</p>
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
      {/**
        Outer container:
        - p-4: comfortable padding
        - h-full: fill vertical space of parent (which should be the remaining screen above the bottom nav)
        - overflow-hidden: so our card never spills out
      */}
      <div
        className="
          w-full
          max-w-xl
          mx-auto
          bg-gray-800
          rounded-lg
          shadow-lg
          overflow-hidden
          relative
          grid
          grid-rows-[auto_1fr_auto]
        "
        style={{
          // never exceed the parent's height
          maxHeight: '100%',
        }}
      >
        {/**
          grid-rows-[auto_1fr_auto]:
          - Row 1 (auto): header (title + meta)
          - Row 2 (1fr): description (takes remaining space, scrolls if needed)
          - Row 3 (auto): Next button
        */}

        {/* Row 1: Title + Meta */}
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            {prayer.name}
          </h2>
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

        {/* Row 2: Scrollable Description */}
        <div className="overflow-y-auto px-6 text-gray-200">
          {prayer.description ? (
            <p>{prayer.description}</p>
          ) : (
            <p className="text-gray-500 italic">
              (No additional details provided.)
            </p>
          )}
        </div>

        {/* Row 3: Next Button */}
        <button
          onClick={loadRandomPrayer}
          className="
            m-4
            px-8 py-3
            bg-yellow-500
            text-black
            rounded-lg
            font-semibold
            hover:bg-yellow-600
            justify-self-start
          "
        >
          Next
        </button>
      </div>
    </div>
  );
}
