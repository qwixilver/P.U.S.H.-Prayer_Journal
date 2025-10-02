// src/components/EmergencyRestore.jsx
// A minimal, self-contained Import/Export JSON modal that appears when the URL hash is "#restore".
// Additive: does not replace or remove your hidden/easter-egg panel.
// You can open it at: https://<your-gh-pages>/P.U.S.H.-Prayer_Journal/#restore

import React, { useRef, useState } from 'react';
import { db, emitDbChanged } from '../db';

export default function EmergencyRestore({ onClose }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function exportJson() {
    try {
      setBusy(true);
      // Dump all tables to JSON
      const [categories, requestors, prayers, events] = await Promise.all([
        db.categories.toArray(),
        db.requestors.toArray(),
        db.prayers.toArray(),
        db.events?.toArray?.() ?? [],
      ]);
      const payload = { categories, requestors, prayers, events, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `prayer-journal-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      setMsg('Exported backup JSON.');
    } catch (e) {
      console.error('export failed', e);
      setMsg('Export failed. See console.');
    } finally {
      setBusy(false);
    }
  }

  async function importJson(file) {
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Defensive parsing: treat missing tables as empty arrays
      const categories = Array.isArray(data.categories) ? data.categories : [];
      const requestors = Array.isArray(data.requestors) ? data.requestors : [];
      const prayers = Array.isArray(data.prayers) ? data.prayers : [];
      const events = Array.isArray(data.events) ? data.events : [];

      // Basic sanity: if everything is empty, bail
      if (categories.length + requestors.length + prayers.length + events.length === 0) {
        setMsg('Import file has no data tables.');
        setBusy(false);
        return;
      }

      // Transaction: clear tables first or upsert? We’ll clear and replace to ensure integrity.
      // If you prefer merge, say so and I’ll adapt.
      await db.transaction('rw', db.categories, db.requestors, db.prayers, db.events, async () => {
        await Promise.all([
          db.categories.clear(),
          db.requestors.clear(),
          db.prayers.clear(),
          db.events.clear().catch(() => {}), // in case events table didn’t exist earlier
        ]);

        // Bulk add with simple mapping; assumes your backup used same fields.
        if (categories.length) await db.categories.bulkAdd(categories);
        if (requestors.length) await db.requestors.bulkAdd(requestors);
        if (prayers.length) await db.prayers.bulkAdd(prayers);
        if (events.length && db.events) await db.events.bulkAdd(events);
      });

      emitDbChanged();
      setMsg('Import complete. UI refreshed.');
    } catch (e) {
      console.error('import failed', e);
      setMsg('Import failed. See console for details (invalid JSON or field mismatch).');
    } finally {
      setBusy(false);
      // Reset file input
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
      <div className="w-[92vw] max-w-md bg-gray-800 text-white rounded-lg shadow-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Backup / Restore (Emergency)</h3>
          <button
            onClick={onClose}
            className="px-2 py-1 text-sm rounded bg-gray-600 hover:bg-gray-500"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <p className="text-gray-300 text-sm mb-3">
          This panel is accessible via <code>#restore</code> in the URL. It won’t replace your hidden panel.
        </p>

        <div className="space-y-4">
          <div className="bg-gray-700 rounded p-3">
            <div className="font-semibold mb-2">Export JSON</div>
            <button
              onClick={exportJson}
              disabled={busy}
              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Download Backup'}
            </button>
          </div>

          <div className="bg-gray-700 rounded p-3">
            <div className="font-semibold mb-2">Import JSON</div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => importJson(e.target.files?.[0])}
              className="block w-full text-sm text-gray-200 file:mr-3 file:py-1 file:px-2 file:rounded
                         file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-white
                         hover:file:bg-gray-500"
            />
            <p className="text-xs text-gray-300 mt-2">
              Import will replace existing tables (categories, requestors, prayers, events).
            </p>
          </div>

          {msg && <p className="text-yellow-300 text-sm">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
