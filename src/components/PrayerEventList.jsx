// src/components/PrayerEventList.jsx
// Read-only timeline of events for a prayer, with optional quick delete.
// Props:
//   - prayerId   (required)
//   - allowDelete (optional, default true)
//   - compact     (optional, default false) → slightly tighter spacing for cards
//
// The list auto-refreshes on 'db:changed' and orders events oldest→newest.

import React, { useEffect, useState } from 'react';
import { db, emitDbChanged } from '../db';

function fmt(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(); // includes date + time based on user locale
}

export default function PrayerEventList({ prayerId, allowDelete = true, compact = false }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!prayerId) return;
    setLoading(true);
    try {
      // Get all events for this prayer and sort by createdAt ascending
      const list = await db.events.where('prayerId').equals(prayerId).toArray();
      list.sort((a, b) => (new Date(a.createdAt) - new Date(b.createdAt)));
      setEvents(list);
    } catch (err) {
      console.error('load events failed', err);
      setEvents([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [prayerId]);

  useEffect(() => {
    const onDbChanged = () => load();
    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, [prayerId]);

  async function handleDelete(id) {
    const yes = confirm('Delete this event? This cannot be undone.');
    if (!yes) return;
    try {
      await db.events.delete(id);
      emitDbChanged();
    } catch (err) {
      console.error('delete event failed', err);
      alert('Failed to delete event (see console).');
    }
  }

  if (!prayerId) return null;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {loading && <p className="text-gray-400">Loading events…</p>}
      {!loading && events.length === 0 && (
        <p className="text-gray-400">No events yet.</p>
      )}

      {events.map((e) => (
        <div key={e.id} className="bg-gray-700 rounded p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-gray-300 text-sm">{fmt(e.createdAt)}</div>
              {e.title && <div className="text-white font-semibold">{e.title}</div>}
              {e.note && (
                <div className="text-gray-100 whitespace-pre-wrap">
                  {e.note}
                </div>
              )}
            </div>
            {allowDelete && (
              <button
                onClick={() => handleDelete(e.id)}
                className="self-start text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white"
                title="Delete event"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
