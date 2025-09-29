// src/components/BackupRestorePanel.jsx
import React, { useState } from 'react';
import {
  exportAllAsJson,
  downloadJson,
  importFromJsonBackup,
  importFromCsvBundle,
} from '../utils/backup';

export default function BackupRestorePanel() {
  const [mode, setMode] = useState('merge');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [categoriesCsv, setCategoriesCsv] = useState(null);
  const [requestorsCsv, setRequestorsCsv] = useState(null);
  const [prayersCsv, setPrayersCsv] = useState(null);
  const [jsonFile, setJsonFile] = useState(null);

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
      const c = res?.counts || {};
      setMessage(
        `Import complete. Categories +${c.addedCats || 0}/${c.updatedCats || 0}, ` +
        `Requestors +${c.addedReqs || 0}/${c.updatedReqs || 0}, ` +
        `Prayers +${c.addedPrs || 0}/${c.updatedPrs || 0}`
      );
      // No manual refresh needed—listeners update via 'db:changed'
    } catch (e) {
      console.error(e);
      setMessage('Import failed (see console).');
    } finally {
      setBusy(false);
    }
  }

  async function handleImportCsv() {
    if (!categoriesCsv || !requestorsCsv || !prayersCsv) {
      setMessage('Please choose all three CSV files.');
      return;
    }
    try {
      setBusy(true);
      setMessage('Importing CSV bundle…');
      const res = await importFromCsvBundle(
        { categoriesFile: categoriesCsv, requestorsFile: requestorsCsv, prayersFile: prayersCsv },
        mode
      );
      const c = res?.counts || {};
      setMessage(
        `CSV import complete. Categories +${c.addedCats || 0}/${c.updatedCats || 0}, ` +
        `Requestors +${c.addedReqs || 0}/${c.updatedReqs || 0}, ` +
        `Prayers +${c.addedPrs || 0}/${c.updatedPrs || 0}`
      );
    } catch (e) {
      console.error(e);
      setMessage('CSV import failed (see console).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 p-4 bg-gray-800 rounded-lg">
      <h3 className="text-xl font-semibold text-white mb-3">Backup &amp; Restore</h3>

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
          Merge (upsert by names)
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

      <div className="mb-6">
        <button
          onClick={handleExportJson}
          disabled={busy}
          className="px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600 disabled:opacity-50 font-semibold"
        >
          Export JSON Backup
        </button>
      </div>

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

      <div className="mb-2">
        <p className="text-gray-300 mb-2">Import CSVs from AppSheet</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Categories CSV</label>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setCategoriesCsv(e.target.files?.[0] || null)} />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Requestors CSV</label>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setRequestorsCsv(e.target.files?.[0] || null)} />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Prayers CSV</label>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setPrayersCsv(e.target.files?.[0] || null)} />
          </div>
        </div>
        <button
          onClick={handleImportCsv}
          disabled={busy}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Import CSV Bundle
        </button>
      </div>

      {message && <p className="mt-4 text-gray-300">{message}</p>}
    </div>
  );
}
