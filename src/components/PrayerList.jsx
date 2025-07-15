// src/components/PrayerList.jsx
// This component renders a list of prayers based on the `viewType` prop:
// - 'daily': shows prayers with status 'requested', sorted by request date, and includes a form to add and edit prayers
// - 'security': shows prayers where security=true, sorted by request date, with edit functionality

import React, { useEffect, useState } from 'react';
import { db } from '../db';
import PrayerForm from './PrayerForm';
import PrayerEditForm from './PrayerEditForm';

/**
 * @param {{ viewType: 'daily' | 'security' }} props
 */
function PrayerList({ viewType }) {
  // Local state
  const [prayers, setPrayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState({}); // track which prayers are in edit mode

  // Fetch prayers based on viewType
  const loadPrayers = async () => {
    setLoading(true);
    try {
      let all = await db.prayers.toArray();
      if (viewType === 'daily') {
        all = all.filter(p => p.status === 'requested');
      } else if (viewType === 'security') {
        all = all.filter(p => p.security === 1);
      }
      all.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
      setPrayers(all);
    } catch (err) {
      console.error('Error loading prayers:', err);
      setPrayers([]);
    }
    setLoading(false);
  };

  // Load on mount and when viewType changes
  useEffect(() => {
    loadPrayers();
  }, [viewType]);

  // Enter edit mode
  const onEditClick = id => {
    setEditMode(prev => ({ ...prev, [id]: true }));
  };

  // Exit edit mode without saving
  const onCancelEdit = id => {
    setEditMode(prev => ({ ...prev, [id]: false }));
  };

  // After saving, reload and exit edit mode
  const onSaveEdit = id => {
    loadPrayers();
    setEditMode(prev => ({ ...prev, [id]: false }));
  };

  // Determine title
  const title = viewType === 'daily' ? 'Daily Prayers' : 'Security Prayers';

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>

      {/* Show add form only in daily view */}
      {viewType === 'daily' && (
        <div className="mb-6">
          <PrayerForm onSuccess={loadPrayers} />
        </div>
      )}

      {/* Loading */}
      {loading && <p>Loading...</p>}

      {/* No prayers */}
      {!loading && prayers.length === 0 && (
        <p className="text-gray-400">No prayers to display.</p>
      )}

      {/* List prayers */}
      {!loading && prayers.length > 0 && (
        <ul className="space-y-3">
          {prayers.map(p => (
            <li key={p.id} className="bg-gray-800 p-3 rounded-lg shadow-sm">
              {editMode[p.id] ? (
                <PrayerEditForm
                  prayer={p}
                  onCancel={() => onCancelEdit(p.id)}
                  onSuccess={() => onSaveEdit(p.id)}
                />
              ) : (
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg text-white">{p.name}</h3>
                    <p className="text-gray-300 text-sm mt-1">{p.description}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      Requested: {new Date(p.requestedAt).toLocaleDateString()}
                    </p>
                    {p.status === 'answered' && (
                      <p className="text-green-400 text-xs">
                        Answered: {new Date(p.answeredAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onEditClick(p.id)}
                    className="text-blue-400 text-sm"
                  >
                    Edit
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PrayerList;
