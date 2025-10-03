// src/components/PrayerUpsertModal.jsx
// Modal wrapper around PrayerForm for editing (and optionally creating) prayers.

import React from 'react';
import PrayerForm from './PrayerForm';

export default function PrayerUpsertModal({ initialPrayer, onClose, onSuccess }) {
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60">
      <div className="w-[92vw] max-w-lg bg-gray-800 text-white rounded-lg shadow-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">
            {initialPrayer?.id ? 'Edit Prayer' : 'Add Prayer'}
          </h3>
          <button
            onClick={onClose}
            className="px-2 py-1 text-sm rounded bg-gray-600 hover:bg-gray-500"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <PrayerForm
          initialPrayer={initialPrayer}
          onSuccess={() => {
            onSuccess?.();
            onClose?.();
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
