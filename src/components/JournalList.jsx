// src/components/JournalList.jsx
// Main view for the Journal tab:
// - Lists entries newest-first
// - Expand/collapse per entry
// - Inline edit + delete
// - FAB to add new entry
// - NEW: Search box (title+text, case-insensitive)
// - NEW: Markdown rendering via react-markdown + remark-gfm

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import JournalForm from './JournalForm';
import JournalEditForm from './JournalEditForm';

// NEW: Markdown renderer + GFM plugin
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Format a date-time ISO string for display */
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

/** Case-insensitive substring match helper */
function ciIncludes(haystack = '', needle = '') {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export default function JournalList() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Per-entry UI state
  const [expanded, setExpanded] = useState({}); // { [id]: bool }
  const [editing, setEditing] = useState({});   // { [id]: bool }

  // Add-entry form visibility (FAB toggles this)
  const [showAddForm, setShowAddForm] = useState(false);

  // NEW: search query
  const [query, setQuery] = useState('');

  /** Load all entries */
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

  // Initial load + auto refresh on db change
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onDbChanged = () => load();
    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, []);

  /** Filtered entries based on the search query (title+text) */
  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    return entries.filter((e) =>
      ciIncludes(e.title || '', query) || ciIncludes(e.text || '', query)
    );
  }, [entries, query]);

  const hasEntries = filtered.length > 0;

  const handleAddSuccess = async () => {
    await load();
    setShowAddForm(false);
  };

  /** Reusable Markdown renderer with Tailwind styling per element */
  function Markdown({ children }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Map HTML elements -> Tailwind-styled React elements
        components={{
          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-2 mb-1 text-white" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-semibold mt-2 mb-1 text-white" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mt-2 mb-1 text-white" {...props} />,
          p:  ({ node, ...props }) => <p className="text-gray-100 leading-relaxed my-2" {...props} />,
          a:  ({ node, ...props }) => <a className="text-blue-300 hover:underline" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc ml-5 my-2 space-y-1 text-gray-100" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal ml-5 my-2 space-y-1 text-gray-100" {...props} />,
          li: ({ node, ...props }) => <li className="text-gray-100" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-gray-500 pl-3 italic text-gray-200 my-2" {...props} />
          ),
          code: ({ inline, className, children: codeChildren, ...props }) => {
            if (inline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-gray-700 text-yellow-200" {...props}>
                  {codeChildren}
                </code>
              );
            }
            // fenced code block
            return (
              <pre className="p-3 rounded bg-gray-800 overflow-x-auto text-sm text-gray-100">
                <code {...props}>{codeChildren}</code>
              </pre>
            );
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full text-left text-sm text-gray-100" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => <th className="border-b border-gray-600 px-2 py-1 font-semibold" {...props} />,
          td: ({ node, ...props }) => <td className="border-b border-gray-700 px-2 py-1" {...props} />,
          hr: ({ node, ...props }) => <hr className="border-gray-700 my-3" {...props} />,
          em: ({ node, ...props }) => <em className="text-gray-100" {...props} />,
          strong: ({ node, ...props }) => <strong className="text-gray-100 font-semibold" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    );
  }

  return (
    <div className="relative overflow-y-auto p-4 pb-24">
      {/* Sticky header: search + (optionally) the add form */}
      <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border-b border-gray-800 -mx-4 px-4 py-3">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">Personal Journal</h2>
            {/* show results count when filtering */}
            {query.trim() && (
              <span className="text-xs text-gray-400">
                {filtered.length} result{filtered.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {/* NEW: search */}
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search journal (title or text)…"
              className="flex-1 p-2 rounded bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-100"
                title="Clear"
              >
                Clear
              </button>
            )}
          </div>

          {/* Top-anchored add form when requested */}
          {showAddForm && (
            <div className="rounded-lg shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Add Journal Entry</span>
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
          )}
        </div>
      </div>

      {/* Empty / loading states */}
      {loading && <p className="text-gray-400 mt-3">Loading…</p>}
      {!loading && !hasEntries && (
        <p className="text-gray-400 mt-3">No journal entries{query ? ' match your search' : ''}.</p>
      )}

      {/* Entries */}
      {!loading && hasEntries && (
        <ul className="space-y-3 mt-3">
          {filtered.map((e) => {
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
                    {/* Header row (click to expand) */}
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

                    {/* Collapsed teaser (first lines only) */}
                    {!isExpanded && e.text && (
                      <div className="mt-2 text-gray-200 line-clamp-3 whitespace-pre-wrap">
                        {/* Render a small markdown snippet without headings looking huge */}
                        <div className="[&_h1]:text-base [&_h2]:text-base [&_h3]:text-base">
                          <Markdown>{e.text}</Markdown>
                        </div>
                      </div>
                    )}

                    {/* Expanded full Markdown */}
                    {isExpanded && (
                      <div className="mt-3 text-gray-100 prose-invert">
                        <Markdown>{e.text || '(No content)'}</Markdown>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* FAB (hidden while the add form is open) */}
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
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none"
               viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
          </svg>
        </button>
      )}
    </div>
  );
}
