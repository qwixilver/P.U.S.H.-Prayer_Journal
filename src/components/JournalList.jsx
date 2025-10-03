// src/components/JournalList.jsx
// Main view for the Journal tab: lists entries newest-first, supports expand,
// edit inline, and add via a floating action button (FAB).

import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../db';
import JournalForm from './JournalForm';
import JournalEditForm from './JournalEditForm';

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export default function JournalList() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [expanded, setExpanded] = useState({}); // { [id]: bool }
  const [editing, setEditing] = useState({});   // { [id]: bool }

  const [showAddForm, setShowAddForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const all = await db.journalEntries.toArray();
      // Newest first
      all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setEntries(all);
    } catch (e) {
      console.error('Load journal failed', e);
      setEntries([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onDbChanged = () => load();
    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, []);

  const hasEntries = useMemo(() => entries.length > 0, [entries]);

  const handleAddSuccess = async () => {
    await load();
    setShowAddForm(false);
  };

  return (
    <div className="relative overflow-y-auto p-4 pb-24">
      {/* Sticky add form (revealed by FAB) */}
      {showAddForm && (
        <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border-b border-gray-700 rounded-b-lg shadow-lg -mx-4 px-4 pt-4 pb-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Add Journal Entry</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                title="Minimize"
              >
                Minimize
              </button>
            </div>
            <JournalForm onSuccess={handleAddSuccess} onCancel={() => setShowAddForm(false)} />
          </div>
        </div>
      )}

      <h2 className="text-2xl font-bold mb-4">Personal Journal</h2>

      {loading && <p className="text-gray-400">Loading…</p>}
      {!loading && !hasEntries && (
        <p className="text-gray-400">No journal entries yet. Tap the + button to write one.</p>
      )}

      {!loading && hasEntries && (
        <ul className="space-y-3">
          {entries.map((e) => {
            const isExpanded = !!expanded[e.id];
            const isEditing = !!editing[e.id];
            return (
              <li key={e.id} className="bg-gray-800 rounded-lg p-3 shadow">
                {isEditing ? (
                  <JournalEditForm
                    entry={e}
                    onCancel={() => setEditing((m) => ({ ...m, [e.id]: false }))}
                    onSuccess={async () => {
                      await load();
                      setEditing((m) => ({ ...m, [e.id]: false }));
                    }}
                  />
                ) : (
                  <>
                    <div
                      className="flex items-start justify-between cursor-pointer select-none"
                      onClick={() => setExpanded((m) => ({ ...m, [e.id]: !m[e.id] }))}
                    >
                      <div>
                        <h4 className="text-white font-semibold">
                          {e.title || '(Untitled)'}
                        </h4>
                        <div className="text-gray-400 text-sm">
                          {fmtDateTime(e.createdAt)}
                          {e.updatedAt && e.updatedAt !== e.createdAt && (
                            <> • edited {fmtDateTime(e.updatedAt)}</>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setEditing((m) => ({ ...m, [e.id]: true }));
                          }}
                          className="text-sm px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    {/* Collapsed teaser */}
                    {!isExpanded && e.text && (
                      <p className="mt-2 text-gray-200 line-clamp-3 whitespace-pre-wrap">{e.text}</p>
                    )}

                    {/* Expanded full text */}
                    {isExpanded && (
                      <div className="mt-3 text-gray-100 whitespace-pre-wrap">{e.text || '(No content)'}</div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* FAB */}
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
          aria-label="Add journal entry"
          title="Add journal entry"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
          </svg>
        </button>
      )}
    </div>
  );
}
