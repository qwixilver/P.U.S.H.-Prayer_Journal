// src/components/Settings.jsx
// Visible Settings page that includes a Backup/Restore panel (JSON).
// - Accepts BOTH top-level and nested ("data") backup shapes
// - Includes journalEntries in export/import
// - Emits db:changed after import so UI updates immediately

import React, { useRef, useState } from 'react';
import { db, emitDbChanged } from '../db';

// Normalize backup shapes:
//  1) { categories, requestors, prayers, events, journalEntries? }
//  2) { data: { categories, requestors, prayers, events, journalEntries? }, meta? }
function extractTables(parsed) {
  const root = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  const categories     = Array.isArray(root?.categories)     ? root.categories     : [];
  const requestors     = Array.isArray(root?.requestors)     ? root.requestors     : [];
  const prayers        = Array.isArray(root?.prayers)        ? root.prayers        : [];
  const events         = Array.isArray(root?.events)         ? root.events         : [];
  const journalEntries = Array.isArray(root?.journalEntries) ? root.journalEntries : [];
  return { categories, requestors, prayers, events, journalEntries };
}

export default function Settings() {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState(null);

  async function exportJson() {
    try {
      setBusy(true);
      setMsg('');
      setPreview(null);

      const [categories, requestors, prayers, events, journalEntries] = await Promise.all([
        db.categories.toArray(),
        db.requestors.toArray(),
        db.prayers.toArray(),
        db.events?.toArray?.() ?? [],
        db.journalEntries?.toArray?.() ?? [],
      ]);

      const payload = {
        meta: {
          type: 'prayer-journal-backup',
          version: 2,
          exportedAt: new Date().toISOString(),
        },
        data: { categories, requestors, prayers, events, journalEntries },
      };

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
      console.error('Export failed', e);
      setMsg('Export failed. See console.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChosen(file) {
    if (!file) return;
    setBusy(true);
    setMsg('');
    setPreview(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { categories, requestors, prayers, events, journalEntries } = extractTables(parsed);
      const totals = {
        categories: categories.length,
        requestors: requestors.length,
        prayers: prayers.length,
        events: events.length,
        journalEntries: journalEntries.length,
      };
      const total = Object.values(totals).reduce((a, b) => a + b, 0);

      if (total === 0) {
        setMsg('Import file parsed, but contains zero rows. Is this the right backup?');
        setBusy(false);
        return;
      }

      setPreview({ ...totals, total, fileName: file.name });
      setMsg('File parsed successfully. Click “Import Now” to proceed.');
    } catch (e) {
      console.error('Parse failed', e);
      setMsg('Invalid JSON: could not parse file.');
    } finally {
      setBusy(false);
    }
  }

  async function importNow() {
    if (!preview || !fileRef.current?.files?.[0]) return;
    setBusy(true);
    setMsg('');
    try {
      const text = await fileRef.current.files[0].text();
      const parsed = JSON.parse(text);
      const { categories, requestors, prayers, events, journalEntries } = extractTables(parsed);

      await db.transaction(
        'rw',
        db.categories,
        db.requestors,
        db.prayers,
        db.events,
        db.journalEntries,
        async () => {
          await Promise.all([
            db.categories.clear(),
            db.requestors.clear(),
            db.prayers.clear(),
            db.events.clear().catch(() => {}),
            db.journalEntries.clear().catch(() => {}),
          ]);

          if (categories.length)     await db.categories.bulkAdd(categories);
          if (requestors.length)     await db.requestors.bulkAdd(requestors);
          if (prayers.length)        await db.prayers.bulkAdd(prayers);
          if (events.length)         await db.events.bulkAdd(events);
          if (journalEntries.length) await db.journalEntries.bulkAdd(journalEntries);
        }
      );

      emitDbChanged();
      setMsg(
        `Import complete: ${preview.categories} categories, ${preview.requestors} requestors, `
        + `${preview.prayers} prayers, ${preview.events} events, ${preview.journalEntries} journal entries.`
      );

      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      console.error('Import failed', e);
      setMsg('Import failed. See console (field mismatch or IndexedDB error).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative overflow-y-auto p-4 pb-24">
      <h2 className="text-2xl font-bold mb-4">Settings</h2>

      <section className="bg-gray-800 rounded-lg p-4 shadow mb-4">
        <h3 className="text-lg font-semibold text-white mb-2">Backup &amp; Restore</h3>
        <p className="text-gray-300 text-sm mb-3">
          Back up or restore your personal Prayer Journal data (stored locally in your browser using IndexedDB).
        </p>

        <div className="space-y-4">
          {/* Export */}
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

          {/* Import */}
          <div className="bg-gray-700 rounded p-3">
            <div className="font-semibold mb-2">Import JSON</div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => handleFileChosen(e.target.files?.[0])}
              className="block w-full text-sm text-gray-200 file:mr-3 file:py-1 file:px-2 file:rounded
                         file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-white
                         hover:file:bg-gray-500"
            />
            <p className="text-xs text-gray-300 mt-2">
              Import will replace existing tables (categories, requestors, prayers, events, journal entries).
            </p>

            {preview && (
              <div className="mt-3 text-sm bg-gray-800 rounded p-2">
                <div className="font-semibold">Parsed: {preview.fileName}</div>
                <ul className="list-disc list-inside text-gray-200">
                  <li>Categories: {preview.categories}</li>
                  <li>Requestors: {preview.requestors}</li>
                  <li>Prayers: {preview.prayers}</li>
                  <li>Events: {preview.events}</li>
                  <li>Journal Entries: {preview.journalEntries}</li>
                  <li>Total: {preview.total}</li>
                </ul>
                <button
                  onClick={importNow}
                  disabled={busy}
                  className="mt-2 px-3 py-1 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  {busy ? 'Importing…' : 'Import Now'}
                </button>
              </div>
            )}
          </div>

          {msg && <p className="text-yellow-300 text-sm">{msg}</p>}
        </div>
      </section>

      {/* Future settings sections can go here */}
      <section className="bg-gray-800 rounded-lg p-4 shadow">
        <h3 className="text-lg font-semibold text-white mb-2">About</h3>
        <p className="text-gray-300 text-sm">
          Data is stored locally in your browser for privacy. Use backup to move your data between devices.
        </p>
      </section>
    </div>
  );
}
