// src/components/Settings.jsx
// Full Settings page:
//  - JSON Backup/Restore (export + import with merge/replace)
//  - Advanced CSV Import (AppSheet-style) behind unlock (7 taps or long-press)
//  - Emits 'db:changed' or calls emitDbChanged() so UI refreshes immediately
//  - Onboarding controls: reopen tutorial, reset first-run flag
//
// Notes:
//  - Uses utils/backup helpers for robust import/export.
//  - Persists Advanced section visibility via localStorage('pj_unlockCsvImport').
//  - Dark theme classes aligned with the rest of the app.

import React, { useEffect, useRef, useState } from 'react';
import { emitDbChanged } from '../db';
import {
  exportAllAsJson,
  downloadJson,
  importFromJsonBackup,
  importFromCsvBundle,
} from '../utils/backup';

const UNLOCK_KEY = 'pj_unlockCsvImport';

export default function Settings() {
  // ---------- JSON backup/restore ----------
  const jsonFileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [jsonPreview, setJsonPreview] = useState(null); // {fileName, counts:{...}, valid:boolean, error?:string}

  // ---------- Advanced (CSV) unlock state ----------
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [csvFiles, setCsvFiles] = useState({
    categories: null,
    requestors: null,
    prayers: null,
  });

  // Unlock logic: 7 taps within 5s, OR long-press (>=1500ms)
  const tapCountRef = useRef(0);
  const tapWindowTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);

  // Hash shortcut for convenience
  useEffect(() => {
    const fromStorage = localStorage.getItem(UNLOCK_KEY);
    if (fromStorage === '1') setAdvancedVisible(true);
    if ((window.location.hash || '') === '#unlock-csv') setAdvancedVisible(true);
  }, []);

  useEffect(() => {
    if (advancedVisible) {
      localStorage.setItem(UNLOCK_KEY, '1');
    } else {
      localStorage.removeItem(UNLOCK_KEY);
    }
  }, [advancedVisible]);

  function beginLongPress() {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setAdvancedVisible(true);
      setMessage('Advanced CSV import unlocked.');
    }, 1500);
  }
  function endLongPress() {
    clearTimeout(longPressTimerRef.current);
  }

  function handleUnlockTap() {
    tapCountRef.current += 1;
    if (!tapWindowTimerRef.current) {
      tapWindowTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
        tapWindowTimerRef.current = null;
      }, 5000);
    }
    if (tapCountRef.current >= 7) {
      setAdvancedVisible(true);
      setMessage('Advanced CSV import unlocked.');
      clearTimeout(tapWindowTimerRef.current);
      tapWindowTimerRef.current = null;
      tapCountRef.current = 0;
    }
  }

  // ---------- JSON helpers ----------
  function resetJsonFileInput() {
    if (jsonFileRef.current) {
      jsonFileRef.current.value = '';
    }
  }

  function parseJsonForPreview(text, fileName = 'backup.json') {
    try {
      const parsed = JSON.parse(text);
      const data = parsed?.data || parsed || {};
      const counts = {
        categories: Array.isArray(data.categories) ? data.categories.length : 0,
        requestors: Array.isArray(data.requestors) ? data.requestors.length : 0,
        prayers: Array.isArray(data.prayers) ? data.prayers.length : 0,
        events: Array.isArray(data.events) ? data.events.length : 0,
        journalEntries: Array.isArray(data.journalEntries) ? data.journalEntries.length : 0,
      };
      return {
        fileName,
        counts,
        valid: true,
        error: null,
        raw: parsed,
      };
    } catch (e) {
      return { fileName, counts: null, valid: false, error: e?.message || 'Invalid JSON', raw: null };
    }
  }

  async function handleExportJson() {
    try {
      setBusy(true);
      setMessage('');
      const json = await exportAllAsJson();
      downloadJson(json);
      setMessage('Backup exported as JSON.');
    } catch (e) {
      console.error(e);
      setMessage('Export failed. See console.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJsonFileChange(e) {
    setMessage('');
    const file = e.target?.files?.[0];
    if (!file) {
      setJsonPreview(null);
      return;
    }
    try {
      const text = await file.text();
      const preview = parseJsonForPreview(text, file.name);
      setJsonPreview(preview);
      if (!preview.valid) {
        setMessage(`Could not read JSON: ${preview.error}`);
      } else {
        setMessage(
          `Loaded ${preview.fileName}: ` +
            `${preview.counts.categories} categories, ` +
            `${preview.counts.requestors} requestors, ` +
            `${preview.counts.prayers} prayers, ` +
            `${preview.counts.events} events, ` +
            `${preview.counts.journalEntries} journal entries.`
        );
      }
    } catch (err) {
      console.error(err);
      setJsonPreview(null);
      setMessage('Failed to read file.');
    }
  }

  async function importJsonWithMode(mode) {
    if (!jsonPreview?.valid || !jsonPreview?.raw) {
      setMessage('Please choose a valid JSON backup first.');
      return;
    }
    try {
      setBusy(true);
      setMessage('');
      const result = await importFromJsonBackup(jsonPreview.raw, mode); // returns counts + skipped info
      emitDbChanged(); // ensure UI updates instantly
      setMessage(
        `Import (${mode}) complete. ` +
          `Added/updated items; you can verify in Daily/Categories/Single.`
      );
      // Clear selection after import
      setJsonPreview(null);
      resetJsonFileInput();
    } catch (e) {
      console.error(e);
      setMessage(`Import (${mode}) failed. ${e?.message || ''}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- CSV helpers ----------
  function setCsv(kind, file) {
    setCsvFiles((s) => ({ ...s, [kind]: file || null }));
  }

  async function importCsv(mode) {
    try {
      setBusy(true);
      setMessage('');
      const files = [];
      if (csvFiles.categories) files.push(csvFiles.categories);
      if (csvFiles.requestors) files.push(csvFiles.requestors);
      if (csvFiles.prayers) files.push(csvFiles.prayers);

      if (files.length === 0) {
        setMessage('Select at least one CSV file to import.');
        return;
      }

      const res = await importFromCsvBundle(files, mode); // counts + skipped diagnostics
      emitDbChanged();

      const parts = [];
      if (res?.counts) {
        const { categories = 0, requestors = 0, prayers = 0 } = res.counts;
        parts.push(`Imported: ${categories} categories, ${requestors} requestors, ${prayers} prayers.`);
      }
      if (res?.skippedTotal) {
        parts.push(`Skipped: ${res.skippedTotal} rows (see console for details).`);
        console.log('CSV skipped diagnostics:', res?.skipped);
      }
      setMessage(parts.join(' '));

      // Clear inputs
      setCsvFiles({ categories: null, requestors: null, prayers: null });
      // (no special UI reset needed)
    } catch (e) {
      console.error(e);
      setMessage(`CSV import failed. ${e?.message || ''}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative overflow-y-auto p-4 pb-24">
      <h2 className="text-2xl font-bold mb-4">Settings</h2>

      {/* ---------- Backup & Restore (JSON) ---------- */}
      <section
        className="bg-gray-800 rounded-lg p-4 shadow select-none"
        onMouseDown={beginLongPress}
        onMouseUp={endLongPress}
        onMouseLeave={endLongPress}
        onTouchStart={beginLongPress}
        onTouchEnd={endLongPress}
      >
        <h3
          className="text-lg font-semibold text-white mb-2"
          onClick={handleUnlockTap}
          title="Tap 7× in 5s or long-press to unlock Advanced (CSV)"
        >
          Backup &amp; Restore
        </h3>

        <div className="flex flex-wrap gap-2 items-center mb-4">
          <button
            onClick={handleExportJson}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Export JSON
          </button>

          <label className="inline-flex items-center gap-2">
            <span className="px-3 py-2 bg-gray-700 rounded text-white">Choose JSON</span>
            <input
              ref={jsonFileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleJsonFileChange}
              className="hidden"
            />
          </label>

          <button
            onClick={() => importJsonWithMode('merge')}
            disabled={busy || !jsonPreview?.valid}
            className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            Import (Merge)
          </button>

          <button
            onClick={() => importJsonWithMode('replace')}
            disabled={busy || !jsonPreview?.valid}
            className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            title="Replace clears existing data before import"
          >
            Import (Replace)
          </button>
        </div>

        {/* JSON preview summary */}
        {jsonPreview?.valid && (
          <div className="text-gray-300 text-sm">
            <p className="mb-1">
              <span className="font-semibold">Ready to import:</span> {jsonPreview.fileName}
            </p>
            <ul className="list-disc list-inside">
              <li>Categories: {jsonPreview.counts.categories}</li>
              <li>Requestors: {jsonPreview.counts.requestors}</li>
              <li>Prayers: {jsonPreview.counts.prayers}</li>
              <li>Events: {jsonPreview.counts.events}</li>
              <li>Journal entries: {jsonPreview.counts.journalEntries}</li>
            </ul>
          </div>
        )}

        {/* Advanced (CSV) */}
        {advancedVisible && (
          <div className="mt-6 border-t border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-md font-semibold text-white">Advanced (CSV)</h4>
              <button
                className="px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600"
                onClick={() => setAdvancedVisible(false)}
                title="Hide the Advanced CSV area and remove the unlock flag"
              >
                Hide
              </button>
            </div>

            <p className="text-gray-300 text-sm mb-3">
              Import AppSheet-style CSV exports. You can provide any subset (Categories, Requestors,
              Prayers). Blank rows are skipped. Names/keys are normalized leniently.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="bg-gray-900 rounded p-3">
                <label className="block text-gray-200 text-sm mb-1">Categories CSV</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setCsv('categories', e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-200"
                />
                <p className="text-xs text-gray-400 mt-1">Expected columns include Key, Name…</p>
              </div>

              <div className="bg-gray-900 rounded p-3">
                <label className="block text-gray-200 text-sm mb-1">Requestors CSV</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setCsv('requestors', e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-200"
                />
                <p className="text-xs text-gray-400 mt-1">Expected columns include Key, Requestor Category…</p>
              </div>

              <div className="bg-gray-900 rounded p-3 sm:col-span-2">
                <label className="block text-gray-200 text-sm mb-1">Prayers CSV</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setCsv('prayers', e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-200"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Expected columns include Key, Requestor, Name, Description, Requested/Answered dates, Status, Security…
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => importCsv('merge')}
                disabled={busy}
                className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
              >
                Import CSV (Merge)
              </button>
              <button
                onClick={() => importCsv('replace')}
                disabled={busy}
                className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                title="Replace clears existing data before import"
              >
                Import CSV (Replace)
              </button>
            </div>
          </div>
        )}

        {/* Status line */}
        {message && <p className="mt-4 text-gray-300">{message}</p>}
      </section>

      {/* ---------- Onboarding controls ---------- */}
      <section className="bg-gray-800 rounded-lg p-4 shadow mt-6">
        <h3 className="text-lg font-semibold text-white mb-2">Onboarding</h3>
        <div className="flex flex-wrap gap-2">
          <button
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
            onClick={() => window.dispatchEvent(new Event('ui:showTutorial'))}
          >
            Show tutorial
          </button>
          <button
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
            onClick={() => {
              localStorage.removeItem('cp:onboarded');
              setMessage('First-run flag cleared. The tutorial will show on next launch or when you press “Show tutorial.”');
            }}
            title="Clear first-run flag (tutorial shows again)"
          >
            Reset first-run flag
          </button>
        </div>
      </section>

      {/* ---------- About ---------- */}
      <section className="bg-gray-800 rounded-lg p-4 shadow mt-6">
        <h3 className="text-lg font-semibold text-white mb-2">About</h3>
        <p className="text-gray-300 text-sm">
          This app stores your data locally for privacy (IndexedDB). Use Backup to export a JSON you can
          keep securely or move to another device. To restore, import that JSON. No account required.
        </p>
      </section>
    </div>
  );
}
