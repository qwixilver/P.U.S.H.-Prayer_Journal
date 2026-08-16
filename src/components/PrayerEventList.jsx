// src/components/PrayerEventList.jsx
// Read-only timeline of events for a prayer, with portable export and optional delete.

import React, { useEffect, useState } from 'react';
import { db, emitDbChanged } from '../db';
import DataExportButton from './DataExportButton';

function fmt(dateTime) {
  if (!dateTime) return '';

  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString();
}

export default function PrayerEventList({
  prayerId,
  allowDelete = true,
  compact = false,
}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!prayerId) return;

    setLoading(true);

    try {
      const list = await db.events
        .where('prayerId')
        .equals(prayerId)
        .toArray();

      list.sort(
        (eventA, eventB) =>
          new Date(eventA.createdAt) - new Date(eventB.createdAt)
      );
      setEvents(list);
    } catch (error) {
      console.error('Load events failed', error);
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

  async function handleDelete(eventId) {
    const confirmed = window.confirm(
      'Delete this event? This cannot be undone.'
    );

    if (!confirmed) return;

    try {
      await db.events.delete(eventId);
      emitDbChanged();
    } catch (error) {
      console.error('Delete event failed', error);
      window.alert('Failed to delete event. See the console for details.');
    }
  }

  if (!prayerId) return null;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {loading && <p className="text-gray-400">Loading events…</p>}

      {!loading && events.length === 0 && (
        <p className="text-gray-400">No events yet.</p>
      )}

      {events.map((event) => (
        <div key={event.id} className="bg-gray-700 rounded p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="w-full min-w-0 flex-1">
              <div className="text-gray-300 text-sm">
                {fmt(event.createdAt)}
              </div>
              {event.title && (
                <div className="text-white font-semibold">{event.title}</div>
              )}
              {event.note && (
                <div className="text-gray-100 whitespace-pre-wrap">
                  {event.note}
                </div>
              )}
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
              <DataExportButton
                kind="event"
                id={event.id}
                title="Export this event with its prayer, requestor, and category"
              />
              {allowDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(event.id)}
                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white"
                  title="Delete event"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
