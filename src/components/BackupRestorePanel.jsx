// src/components/BackupRestorePanel.jsx
// UI for exporting JSON and importing JSON with a hidden "Advanced (CSV)" easter egg.
// - JSON backup/restore is always visible.
// - AppSheet CSV import is hidden until you unlock it by:
//     * clicking the "Backup & Restore" header 7 times within 5 seconds, OR
//     * long-pressing the header for 1.5 seconds (mobile-friendly).
// - Once unlocked, it persists via localStorage ("pj_unlockCsvImport").
// - You can hide it again from inside the advanced section.

import React, { useEffect, useRef, useState } from 'react';
import {
  exportAllAsJson,
  downloadJson,
  importFromJsonBackup,
  importFromCsvBundle,
} from '../utils/backup';

const UNLOCK_KEY = 'pj_unlockCsvImport';

export default function BackupRestorePanel() {
  // ---- existing states ----
  const [mode, setMode] = useState('merge');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [jsonFile, setJsonFile] = useState(null);

  // CSV files (hidden until "advanced" unlocked)
  const [categoriesCsv, setCategoriesCsv] = useState(null);
  const [requestorsCsv, setRequestorsCsv] = useState(null);
  const [prayersCsv, setPrayersCsv] = useState(null);

  // ---- easter egg state ----
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef(null);
  const pressTimerRef = useRef(null);

  // On mount, restore unlock from localStorage or URL hash (optional shortcut)
  useEffect(() => {
    const fromStorage = localStorage.getItem(UNLOCK_KEY);
    if (fromStorage === '1') setAdvancedVisible(true);
    if (window.location.hash === '#unlock-csv') setAdvancedVisible(true);
  }, []);

  // When visibility changes, persist it for convenience
  useEffect(() => {
    if (advancedVisible) {
      localStorage.setItem(UNLOCK_KEY, '1');
    } else {
      localStorage.removeItem(UNLOCK_KEY);
    }
  }, [advancedVisible]);

  // Desktop/mobile friendly unlock gestures on the header:
  //  - 7 clicks within 5 seconds
  //  - long-press (~1500ms)
  function handleHeaderClick() {
    clickCountRef.current += 1;

    // Start/reset a 5s window
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 5000);

    if (clickCountRef.current >= 7) {
      clickCountRef.current = 0;
      clearTimeout(clickTimerRef.current);
      setAdvancedVisible(true);
      setMessage('Advanced (CSV) import unlocked.');
    }
  }

  function handleHeaderPointerDown() {
    // Long-press unlock after 1500ms
    pressTimerRef.current = setTimeout(() => {
      setAdvancedVisible(true);
      setMessage('Advanced (CSV) import unlocked.');
    }, 1500);
  }

  function handleHeaderPointerUpOrLeave() {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  // ---- JSON export/import ----
  async function handleExportJson() {
    try {
      setBusy(true);
      setMessage('Exporting…');
      const data = await exportAllAsJson();
      downloadJson(data);
      setMessage('Backup downloaded.');
    } catch (e) {
      console.error(e);
      setMessage('Export failed (see console).');
    } finally {
      setBusy(false);
    }
  }

  function summarizeCounts(prefix, res) {
    const c = res?.counts || {};
    const s = res?.skipped || {};
    const skippedTotal =
      (s.categories?.length || 0) + (s.requestors?.length || 0) + (s.prayers?.length || 0);
    return [
      `${prefix} complete.`,
      `Categories +${c.addedCats || 0}/${c.updatedCats || 0}`,
      `Requestors +${c.addedReqs || 0}/${c.updatedReqs || 0}`,
      `Prayers +${c.addedPrs || 0}/${c.updatedPrs || 0}`,
      skippedTotal ? `Skipped ${skippedTotal} row(s). See console for details.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  async function handleImportJson() {
    if (!jsonFile) {
      setMessage('Please choose a JSON backup file first.');
      return;
    }
    try {
      setBusy(true);
      setMessage('Importing JSON backup…');
      const text = await jsonFile.text();
      const json = JSON.parse(text);
      const res = await importFromJsonBackup(json, mode);
      setMessage(summarizeCounts('JSON import', res));
      // Other views refresh automatically via 'db:changed' broadcast.
    } catch (e) {
      console.error(e);
      setMessage('Import failed (see console).');
    } finally {
      setBusy(false);
    }
  }

  // ---- Advanced (hidden) CSV import ----
  async function handleImportCsv() {
    if (!categoriesCsv && !requestorsCsv && !prayersCsv) {
      setMessage('Choose at least one CSV (categories, requestors, or prayers).');
      return;
    }
    try {
      setBusy(true);
      setMessage('Importing CSV…');
      const res = await importFromCsvBundle(
        { categoriesFile: categoriesCsv, requestorsFile: requestorsCsv, prayersFile: prayersCsv },
        mode
      );
      setMessage(summarizeCounts('CSV import', res));
      // Auto-refresh is handled by 'db:changed'.
    } catch (e) {
      console.error(e);
      setMessage('CSV import failed (see console).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 p-4 bg-gray-800 rounded-lg">
      {/* Header with hidden unlock gestures */}
      <h3
        className="text-xl font-semibold text-white mb-3 select-none"
        title="Backup & Restore"
        onClick={handleHeaderClick}
        onPointerDown={handleHeaderPointerDown}
        onPointerUp={handleHeaderPointerUpOrLeave}
        onPointerLeave={handleHeaderPointerUpOrLeave}
      >
        Backup &amp; Restore
      </h3>

      {/* Import mode (applies to JSON and CSV) */}
      <div className="mb-4">
        <span className="text-gray-300 mr-3">Import Mode:</span>
        <label className="mr-4">
          <input
            type="radio"
            name="importMode"
            value="merge"
            checked={mode === 'merge'}
            onChange={() => setMode('merge')}
            className="mr-1"
          />
          Merge (upsert by names/keys)
        </label>
        <label>
          <input
            type="radio"
            name="importMode"
            value="replace"
            checked={mode === 'replace'}
            onChange={() => setMode('replace')}
            className="mr-1"
          />
          Replace (wipe then import)
        </label>
      </div>

      {/* Export JSON */}
      <div className="mb-6">
        <button
          onClick={handleExportJson}
          disabled={busy}
          className="px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600 disabled:opacity-50 font-semibold"
        >
          Export JSON Backup
        </button>
      </div>

      {/* Import JSON */}
      <div className="mb-6">
        <p className="text-gray-300 mb-2">Import JSON Backup</p>
        <input
          type="file"
          accept="application/json"
          onChange={(e) => setJsonFile(e.target.files?.[0] || null)}
          className="mb-2 block"
        />
        <button
          onClick={handleImportJson}
          disabled={busy}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Import JSON
        </button>
      </div>

      {/* Advanced (CSV) — hidden until unlocked */}
      {advancedVisible && (
        <div className="mt-8 border-t border-gray-700 pt-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-semibold text-yellow-300">
              Advanced (CSV) — AppSheet Import
            </h4>
            <button
              onClick={() => setAdvancedVisible(false)}
              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
              title="Hide this section"
            >
              Hide
            </button>
          </div>

          <p className="text-gray-400 text-sm mb-3">
            Optional CSV import for legacy AppSheet exports. Provide any subset of the three files.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Categories CSV (optional)</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCategoriesCsv(e.target.files?.[0] || null)}
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Requestors CSV (optional)</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setRequestorsCsv(e.target.files?.[0] || null)}
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Prayers CSV (optional)</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setPrayersCsv(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <button
            onClick={handleImportCsv}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Import CSV
          </button>
        </div>
      )}

      {/* Status line */}
      {message && <p className="mt-4 text-gray-300">{message}</p>}
    </div>
  );
}
