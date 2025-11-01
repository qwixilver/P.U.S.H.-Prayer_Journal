// src/components/Settings.jsx
// Full Settings page with:
//  - Install as App (PWA): beforeinstallprompt + help instructions
//  - Private Vault: enable/unlock/change passphrase/recovery code/idle auto-lock/lock now
//  - Notifications & Reminders: fixed times or interval; simple/random/ordered modes; ICS export
//  - Backup/Restore: encrypted export when vault enabled; plain JSON otherwise; encrypted import prompt
//  - Advanced CSV Import: unlockable via hidden gesture (long-press or 7 taps)
//  - Onboarding controls: show tutorial / reset first-run flag
//  - About: privacy message

import React, { useEffect, useRef, useState } from 'react';
import { emitDbChanged, db } from '../db';

import {
  exportAllAsJson,           // used for preview counts
  exportSmartJson,           // chooses encrypted/plain automatically
  downloadJson,
  importSmartFromFileText,   // auto-detects encrypted vs plain
  importFromCsvBundle,       // advanced CSV import (kept/preserved)
} from '../utils/backup';

import {
  loadNotificationConfig,
  saveNotificationConfig,
  ensurePermission,
  scheduleNotifications,
  clearScheduledNotifications,
  buildICS,
  downloadICS,
} from '../utils/notifications';

import {
  isVaultEnabled, isUnlocked, enableVaultFirstTime, unlockWithPassphrase,
  unlockWithRecoveryCode, changePassphrase, regenerateRecoveryCode,
  lockNow, setIdleMinutes, getIdleMinutes
} from '../utils/vault';

// -------------------- Constants --------------------
const UNLOCK_KEY = 'pj_unlockCsvImport';

const DEFAULT_NOTIF_CFG = {
  enabled: false,
  mode: 'simple',                 // 'simple' | 'random' | 'ordered-category' | 'ordered-requestor'
  scheduleType: 'fixed-times',    // 'fixed-times' | 'interval'
  times: ['08:00', '20:00'],      // fixed-times mode
  intervalMinutes: 60,            // interval mode
  daysOfWeek: [true, true, true, true, true, true, true], // Sun..Sat
  categoryId: null,
  requestorId: null,
};

// -------------------- Small helpers --------------------
function isStandalone() {
  const mql = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : { matches: false };
  return (window.navigator && (window.navigator.standalone === true)) || mql.matches;
}

// ============================================================================
// Component
// ============================================================================
export default function Settings() {
  // ===== PWA Install =====
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [installMsg, setInstallMsg] = useState('');
  const [installed, setInstalled] = useState(isStandalone());
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(e) {
      e.preventDefault?.();
      setInstallPromptEvent(e);
      setInstallMsg('App install is available.');
    }
    function onAppInstalled() {
      setInstalled(true);
      setInstallPromptEvent(null);
      setInstallMsg('App installed.');
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    const mql = window.matchMedia?.('(display-mode: standalone)');
    const dmHandler = () => setInstalled(isStandalone());
    mql?.addEventListener?.('change', dmHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      mql?.removeEventListener?.('change', dmHandler);
    };
  }, []);

  async function handleInstallClick() {
    try {
      setInstallMsg('');
      const ev = installPromptEvent;
      if (!ev) {
        setShowInstallHelp(true);
        return;
      }
      ev.prompt?.();
      const choice = await ev.userChoice;
      setInstallMsg(choice?.outcome === 'accepted' ? 'Install accepted. Check your home screen / app list.' : 'Install dismissed.');
      setInstallPromptEvent(null);
    } catch (e) {
      setInstallMsg(e?.message || 'Could not trigger install.');
    }
  }

  // ===== Notifications =====
  const [notifMsg, setNotifMsg] = useState('');
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifCfg, setNotifCfg] = useState(() => ({ ...DEFAULT_NOTIF_CFG, ...(loadNotificationConfig() || {}) }));
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'denied'));
  const [categories, setCategories] = useState([]);
  const [requestors, setRequestors] = useState([]);

  useEffect(() => {
    (async () => {
      const cats = await db.categories.toArray();
      cats.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
      setCategories(cats);
      const reqs = await db.requestors.toArray();
      reqs.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
      setRequestors(reqs);
    })();
  }, []);

  function updateNotifCfg(patch) {
    setNotifCfg(prev => {
      const next = { ...prev, ...patch };
      if (!Array.isArray(next.times) || !next.times.length) next.times = ['08:00'];
      if (!Array.isArray(next.daysOfWeek) || next.daysOfWeek.length !== 7) next.daysOfWeek = [true,true,true,true,true,true,true];
      if (!Number.isFinite(Number(next.intervalMinutes)) || next.intervalMinutes < 5) next.intervalMinutes = 60;
      saveNotificationConfig(next);
      return next;
    });
  }

  async function handleTestNotification() {
    try {
      setNotifBusy(true);
      setNotifMsg('');
      await ensurePermission();
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification('Closet Prayer — Test', {
          body: 'This is a test notification.',
          tag: 'cp:test',
        });
      } else {
        new Notification('Closet Prayer — Test', { body: 'This is a test notification.' });
      }
      setPerm(Notification.permission);
      setNotifMsg('Test notification sent.');
    } catch (e) {
      setNotifMsg(e?.message || 'Unable to show notification.');
    } finally {
      setNotifBusy(false);
    }
  }

  async function handleSaveAndSchedule() {
    try {
      setNotifBusy(true);
      setNotifMsg('');
      if (!notifCfg.enabled) {
        await clearScheduledNotifications();
        setNotifMsg('Notifications are disabled. Nothing scheduled.');
        return;
      }
      if (notifCfg.scheduleType === 'interval') {
        const m = parseInt(notifCfg.intervalMinutes, 10);
        if (!Number.isFinite(m) || m < 5) {
          setNotifMsg('Please choose an interval of at least 5 minutes.');
          return;
        }
      }
      await ensurePermission();
      await scheduleNotifications(notifCfg);
      setPerm(Notification.permission);
      setNotifMsg('Notifications scheduled (next 14 days). For maximum reliability, you can also export an .ics.');
    } catch (e) {
      setNotifMsg(e?.message || 'Failed to schedule.');
    } finally {
      setNotifBusy(false);
    }
  }

  async function handleClearScheduled() {
    try {
      setNotifBusy(true);
      setNotifMsg('');
      await clearScheduledNotifications();
      setNotifMsg('Cleared any scheduled notifications (best effort).');
    } catch (e) {
      setNotifMsg(e?.message || 'Failed to clear.');
    } finally {
      setNotifBusy(false);
    }
  }

  function handleExportICS() {
    try {
      const ics = buildICS(notifCfg, 60);
      downloadICS(ics);
      setNotifMsg('.ics calendar exported.');
    } catch (e) {
      setNotifMsg(e?.message || 'Failed to create .ics file.');
    }
  }

  // ===== Private Vault =====
  const [vaultEnabled, setVaultEnabled] = useState(isVaultEnabled());
  const [vaultUnlocked, setVaultUnlocked] = useState(isUnlocked());
  const [vaultMsg, setVaultMsg] = useState('');
  const [idleMin, setIdleMinState] = useState(getIdleMinutes());
  const [showRecovery, setShowRecovery] = useState(false);
  const [generatedRecovery, setGeneratedRecovery] = useState('');

  function syncVaultState() {
    setVaultEnabled(isVaultEnabled());
    setVaultUnlocked(isUnlocked());
  }

  async function onEnableVault() {
    const pass = prompt('Create a passphrase (min 8 chars). Do NOT forget it.');
    if (!pass) return;
    try {
      const { recoveryCode } = await enableVaultFirstTime(pass);
      setVaultMsg('Vault enabled and unlocked for this session.');
      setShowRecovery(true);
      setGeneratedRecovery(recoveryCode);
      syncVaultState();
    } catch (e) { setVaultMsg(e?.message || 'Failed to enable vault.'); }
  }

  async function onUnlock() {
    const pass = prompt('Enter your vault passphrase:');
    if (!pass) return;
    try { await unlockWithPassphrase(pass); setVaultMsg('Unlocked.'); syncVaultState(); }
    catch (e) { setVaultMsg(e?.message || 'Wrong passphrase.'); }
  }

  async function onUnlockWithRecovery() {
    const code = prompt('Enter your Recovery Code (format XXXX-XXXX-...):');
    if (!code) return;
    try { await unlockWithRecoveryCode(code); setVaultMsg('Unlocked with Recovery Code.'); syncVaultState(); }
    catch (e) { setVaultMsg(e?.message || 'Could not unlock with Recovery Code.'); }
  }

  async function onChangePass() {
    const oldPass = prompt('Current passphrase:');
    if (!oldPass) return;
    const newPass = prompt('New passphrase (min 8 chars):');
    if (!newPass) return;
    try { await changePassphrase(oldPass, newPass); setVaultMsg('Passphrase updated.'); }
    catch (e) { setVaultMsg(e?.message || 'Failed to change passphrase.'); }
  }

  async function onRegenRecovery() {
    try {
      if (!vaultUnlocked) { setVaultMsg('Unlock first to regenerate the Recovery Code.'); return; }
      const { recoveryCode } = await regenerateRecoveryCode();
      setGeneratedRecovery(recoveryCode);
      setShowRecovery(true);
      setVaultMsg('New Recovery Code generated. Store it safely.');
    } catch (e) { setVaultMsg(e?.message || 'Failed to regenerate Recovery Code.'); }
  }

  function onLockNow() { lockNow(); setVaultMsg('Locked.'); syncVaultState(); }

  function onIdleChange(v) {
    const n = Math.max(1, parseInt(v || '0', 10));
    setIdleMinState(n);
    setIdleMinutes(n);
  }

  // ===== Backup/Restore =====
  const jsonFileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [jsonPreview, setJsonPreview] = useState(null);

  function parseJsonForPreview(text, fileName = 'backup.json') {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.header?.type === 'cp/encrypted-backup') {
        return { fileName, encrypted: true, counts: null, valid: true, raw: parsed };
      }
      const data = parsed?.data || parsed || {};
      const counts = {
        categories: Array.isArray(data.categories) ? data.categories.length : 0,
        requestors: Array.isArray(data.requestors) ? data.requestors.length : 0,
        prayers: Array.isArray(data.prayers) ? data.prayers.length : 0,
        events: Array.isArray(data.events) ? data.events.length : 0,
        journalEntries: Array.isArray(data.journalEntries) ? data.journalEntries.length : 0,
      };
      return { fileName, encrypted: false, counts, valid: true, raw: parsed };
    } catch (e) {
      return { fileName, counts: null, valid: false, error: e?.message || 'Invalid JSON', raw: null };
    }
  }

  async function handleExportJson() {
    try {
      setBusy(true);
      setMessage('');
      setJsonPreview(null);
      const out = await exportSmartJson();
      downloadJson(out.text, out.fileName);
      setMessage(vaultEnabled ? 'Encrypted backup exported.' : 'Backup exported as JSON.');
    } catch (e) {
      console.error(e);
      setMessage(e?.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJsonFileChange(e) {
    setMessage('');
    const file = e.target?.files?.[0];
    if (!file) { setJsonPreview(null); return; }
    try {
      const text = await file.text();
      const preview = parseJsonForPreview(text, file.name);
      setJsonPreview(preview);
      if (!preview.valid) {
        setMessage(`Could not read file: ${preview.error}`);
      } else if (!preview.encrypted) {
        setMessage(
          `Loaded ${preview.fileName}: ` +
          `${preview.counts.categories} categories, ` +
          `${preview.counts.requestors} requestors, ` +
          `${preview.counts.prayers} prayers, ` +
          `${preview.counts.events} events, ` +
          `${preview.counts.journalEntries} journal entries.`
        );
      } else {
        setMessage(`Encrypted backup detected: ${preview.fileName}`);
      }
    } catch (err) {
      console.error(err);
      setJsonPreview(null);
      setMessage('Failed to read file.');
    }
  }

  async function importJson(mode) {
    if (!jsonPreview?.valid || !jsonPreview?.raw) {
      setMessage('Choose a valid file first.');
      return;
    }
    try {
      setBusy(true);
      setMessage('');
      if (jsonPreview.encrypted) {
        const choice = prompt('Encrypted backup. Type "pass" to use passphrase or "recovery" to use Recovery Code:');
        if (!choice) { setBusy(false); return; }
        if (choice !== 'pass' && choice !== 'recovery') { setBusy(false); setMessage('Cancelled.'); return; }
        const secret = prompt(choice === 'pass' ? 'Enter passphrase:' : 'Enter Recovery Code:');
        if (!secret) { setBusy(false); return; }
        await importSmartFromFileText(JSON.stringify(jsonPreview.raw), {
          mode,
          secretKind: choice === 'pass' ? 'passphrase' : 'recovery',
          secret
        });
      } else {
        await importSmartFromFileText(JSON.stringify(jsonPreview.raw), { mode });
      }
      emitDbChanged();
      setMessage(`Import (${mode}) complete.`);
      setJsonPreview(null);
      if (jsonFileRef.current) jsonFileRef.current.value = '';
    } catch (e) {
      console.error(e);
      setMessage(`Import (${mode}) failed. ${e?.message || ''}`);
    } finally {
      setBusy(false);
    }
  }

  // ===== Advanced CSV (unlockable) =====
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [csvFiles, setCsvFiles] = useState({ categories: null, requestors: null, prayers: null });
  const tapCountRef = useRef(0);
  const tapWindowTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);

  useEffect(() => {
    if (localStorage.getItem(UNLOCK_KEY) === '1') setAdvancedVisible(true);
    if ((window.location.hash || '') === '#unlock-csv') setAdvancedVisible(true);
  }, []);
  useEffect(() => {
    if (advancedVisible) localStorage.setItem(UNLOCK_KEY, '1');
    else localStorage.removeItem(UNLOCK_KEY);
  }, [advancedVisible]);

  function beginLongPress() {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setAdvancedVisible(true);
      setMessage('Advanced CSV import unlocked.');
    }, 1500);
  }
  function endLongPress() { clearTimeout(longPressTimerRef.current); }
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
  function setCsv(kind, file) { setCsvFiles(s => ({ ...s, [kind]: file || null })); }

  async function importCsv(mode) {
    try {
      setBusy(true);
      setMessage('');
      const files = [];
      if (csvFiles.categories) files.push(csvFiles.categories);
      if (csvFiles.requestors) files.push(csvFiles.requestors);
      if (csvFiles.prayers) files.push(csvFiles.prayers);
      if (!files.length) { setMessage('Select at least one CSV file to import.'); return; }
      const res = await importFromCsvBundle(files, mode);
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
      setCsvFiles({ categories: null, requestors: null, prayers: null });
    } catch (e) {
      console.error(e);
      setMessage(`CSV import failed. ${e?.message || ''}`);
    } finally {
      setBusy(false);
    }
  }

  // ========================================================================
  // Render
  // ========================================================================
  return (
    <div className="relative overflow-y-auto p-4 pb-24">
      <h2 className="text-2xl font-bold mb-4">Settings</h2>

      {/* ===== Install as App (NEW) ===== */}
      <section className="bg-gray-800 rounded-lg p-4 shadow space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Install as App</h3>
          {installed && (
            <span className="text-xs px-2 py-1 rounded bg-emerald-700 text-white">Installed</span>
          )}
        </div>

        {!installed && (
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              onClick={handleInstallClick}
              title="Add Closet Prayer to your home screen or apps list"
            >
              Install app
            </button>
            <button
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
              onClick={() => setShowInstallHelp(v => !v)}
            >
              {showInstallHelp ? 'Hide help' : 'How to install on this device'}
            </button>
          </div>
        )}

        {installMsg && <p className="text-gray-300 text-sm">{installMsg}</p>}

        {showInstallHelp && !installed && (
          <div className="mt-2 bg-gray-900 rounded p-3 text-sm text-gray-200 space-y-2">
            <p className="font-semibold">iPhone / iPad (Safari):</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open this site in <span className="font-medium">Safari</span>.</li>
              <li>Tap the <span className="font-medium">Share</span> button (square with an up arrow).</li>
              <li>Choose <span className="font-medium">Add to Home Screen</span>.</li>
              <li>Confirm the name and tap <span className="font-medium">Add</span>.</li>
            </ol>
            <p className="text-xs text-gray-400">
              Note: iOS doesn’t show the install prompt button; installing is done from the Share menu.
            </p>

            <p className="font-semibold mt-3">Android (Chrome/Edge) or Desktop (Chromium-based):</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Use <span className="font-medium">Chrome</span>, <span className="font-medium">Edge</span>, or another Chromium-based browser.</li>
              <li>If the <span className="font-medium">Install app</span> button isn’t available:
                <ul className="list-disc list-inside ml-5">
                  <li>On Android: open the browser menu and choose <span className="font-medium">Add to Home screen</span> or <span className="font-medium">Install app</span>.</li>
                  <li>On Desktop: check the address bar for an <span className="font-medium">Install</span> icon or use the browser menu.</li>
                </ul>
              </li>
            </ol>
          </div>
        )}
      </section>

      {/* ===== Private Vault ===== */}
      <section className="bg-gray-800 rounded-lg p-4 shadow space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Private Vault</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-1 rounded ${vaultEnabled ? 'bg-emerald-700' : 'bg-gray-700'} text-white`}>
              {vaultEnabled ? 'Enabled' : 'Disabled'}
            </span>
            {vaultEnabled && (
              <span className={`px-2 py-1 rounded ${vaultUnlocked ? 'bg-emerald-700' : 'bg-amber-700'} text-white`}>
                {vaultUnlocked ? 'Unlocked' : 'Locked'}
              </span>
            )}
          </div>
        </div>

        {!vaultEnabled ? (
          <>
            <p className="text-gray-300 text-sm">
              Protect sensitive entries with strong encryption. You’ll unlock once per session. If you forget your
              passphrase and Recovery Code, your encrypted data is unrecoverable.
            </p>
            <button className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white" onClick={onEnableVault}>
              Enable vault
            </button>
          </>
        ) : (
          <>
            {!vaultUnlocked ? (
              <div className="flex flex-wrap gap-2">
                <button className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white" onClick={onUnlock}>Unlock (passphrase)</button>
                <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white" onClick={onUnlockWithRecovery}>Unlock (Recovery Code)</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white" onClick={onChangePass}>Change passphrase</button>
                <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white" onClick={onRegenRecovery}>Regenerate Recovery Code</button>
                <button className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-white" onClick={onLockNow}>Lock now</button>
              </div>
            )}

            <div className="mt-3">
              <label className="block text-gray-200 text-sm mb-1">Auto-lock on idle</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className="bg-gray-700 text-white rounded p-2 w-24"
                  value={idleMin}
                  onChange={(e)=>onIdleChange(e.target.value)}
                />
                <span className="text-gray-300 text-sm">minutes</span>
              </div>
            </div>

            {showRecovery && generatedRecovery && (
              <div className="mt-3 bg-gray-900 rounded p-3">
                <p className="text-gray-200 text-sm font-semibold">Recovery Code (write this down):</p>
                <p className="mt-1 text-white font-mono text-lg break-all">{generatedRecovery}</p>
                <p className="text-xs text-amber-300 mt-2">
                  Store offline. Anyone with this code can restore your encrypted backup, but it cannot be used to log into any account.
                </p>
              </div>
            )}

            {vaultMsg && <p className="text-gray-300">{vaultMsg}</p>}
          </>
        )}

        <p className="text-xs text-gray-400">
          Warning: Forgetting your passphrase <em>and</em> Recovery Code means your encrypted data cannot be recovered.
        </p>
      </section>

      {/* ===== Notifications & Reminders ===== */}
      <section className="bg-gray-800 rounded-lg p-4 shadow space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Notifications &amp; Reminders</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!notifCfg.enabled}
              onChange={(e) => updateNotifCfg({ enabled: e.target.checked })}
            />
            <span className="text-gray-200">Enabled</span>
          </label>
        </div>

        <div className="text-sm text-gray-300">
          <p>
            Get gentle reminders to pray. No servers, no accounts — scheduled locally on your device.
            For maximum reliability across platforms, you can also export an <span className="italic">.ics</span> calendar.
          </p>
          <p className="mt-1">
            Permission: <span className="font-medium">{perm}</span>
          </p>
        </div>

        {/* Mode selection */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-gray-900 rounded p-3">
            <label className="block text-gray-2 00 text-sm mb-1">Notification content</label>
            <select
              className="w-full bg-gray-700 text-white rounded p-2"
              value={notifCfg.mode}
              onChange={(e) => updateNotifCfg({ mode: e.target.value })}
            >
              <option value="simple">Simple — “Remember to pray”</option>
              <option value="random">Randomized request (like Daily)</option>
              <option value="ordered-category">Ordered cycle by Category</option>
              <option value="ordered-requestor">Ordered cycle by Requestor</option>
            </select>

            {notifCfg.mode === 'ordered-category' && (
              <div className="mt-2">
                <label className="block text-gray-200 text-sm mb-1">Category</label>
                <select
                  className="w-full bg-gray-700 text-white rounded p-2"
                  value={notifCfg.categoryId || ''}
                  onChange={(e) => updateNotifCfg({ categoryId: e.target.value || null })}
                >
                  <option value="">— Choose a category —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {notifCfg.mode === 'ordered-requestor' && (
              <div className="mt-2">
                <label className="block text-gray-200 text-sm mb-1">Requestor</label>
                <select
                  className="w-full bg-gray-700 text-white rounded p-2"
                  value={notifCfg.requestorId || ''}
                  onChange={(e) => updateNotifCfg({ requestorId: e.target.value || null })}
                >
                  <option value="">— Choose a requestor —</option>
                  {requestors.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Schedule config (Fixed times or Interval) */}
          <div className="bg-gray-900 rounded p-3">
            <label className="block text-gray-200 text-sm mb-1">Schedule type</label>
            <select
              className="w-full bg-gray-700 text-white rounded p-2 mb-3"
              value={notifCfg.scheduleType || 'fixed-times'}
              onChange={(e) => updateNotifCfg({ scheduleType: e.target.value })}
            >
              <option value="fixed-times">Fixed times (e.g., 8:00 AM, 8:00 PM)</option>
              <option value="interval">Interval (every N minutes/hours)</option>
            </select>

            {notifCfg.scheduleType !== 'interval' ? (
              <>
                <label className="block text-gray-200 text-sm mb-2">Times (daily)</label>
                <div className="flex flex-wrap gap-2">
                  {notifCfg.times.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="time"
                        className="bg-gray-700 text-white rounded p-2"
                        value={t}
                        onChange={(e) => {
                          const times = [...notifCfg.times];
                          times[i] = e.target.value;
                          updateNotifCfg({ times });
                        }}
                      />
                      <button
                        className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600"
                        onClick={() => {
                          const times = notifCfg.times.filter((_, idx) => idx !== i);
                          updateNotifCfg({ times: times.length ? times : ['08:00'] });
                        }}
                        title="Remove time"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600"
                    onClick={() => updateNotifCfg({ times: [...notifCfg.times, '12:00'] })}
                  >
                    + Add time
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="block text-gray-200 text-sm mb-2">Interval</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    step={1}
                    className="bg-gray-700 text-white rounded p-2 w-24"
                    value={notifCfg.intervalMinutes}
                    onChange={(e) => updateNotifCfg({ intervalMinutes: Math.max(5, parseInt(e.target.value || '0', 10) || 0) })}
                    title="Minimum 5 minutes"
                  />
                  <span className="text-gray-300 text-sm">minutes</span>
                  <span className="text-gray-500 text-xs">Tip: 60 = hourly, 30 = every 30 min, 180 = every 3 hours.</span>
                </div>
              </>
            )}

            {/* Days of week always available */}
            <div className="mt-3">
              <label className="block text-gray-200 text-sm mb-1">Days of week</label>
              <div className="grid grid-cols-7 gap-1 text-xs text-gray-200">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, idx) => (
                  <label key={d} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={!!notifCfg.daysOfWeek[idx]}
                      onChange={(e) => {
                        const arr = [...notifCfg.daysOfWeek];
                        arr[idx] = e.target.checked;
                        updateNotifCfg({ daysOfWeek: arr });
                      }}
                    />
                    <span>{d}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
            onClick={handleSaveAndSchedule}
            disabled={notifBusy}
            title="Schedules next 14 days; re-run after changes."
          >
            Save &amp; schedule
          </button>
          <button
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
            onClick={handleClearScheduled}
            disabled={notifBusy}
          >
            Clear scheduled
          </button>
          <button
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-white"
            onClick={handleTestNotification}
            disabled={notifBusy}
          >
            Test now
          </button>
          <button
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
            onClick={handleExportICS}
            disabled={notifBusy}
            title="Creates a calendar file (interval = RRULE; fixed times = enumerated)"
          >
            Export .ics (calendar)
          </button>
        </div>

        {notifMsg && <p className="text-gray-300">{notifMsg}</p>}

        <p className="text-xs text-gray-400">
          Tip: Some browsers support scheduled notifications natively (Notification Triggers). On platforms that don’t,
          the .ics option is the most reliable without using a server.
        </p>
      </section>

      {/* ===== Backup & Restore ===== */}
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
            {vaultEnabled ? 'Export Encrypted Backup' : 'Export JSON'}
          </button>

          <label className="inline-flex items-center gap-2">
            <span className="px-3 py-2 bg-gray-700 rounded text-white">Choose file</span>
            <input
              ref={jsonFileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleJsonFileChange}
              className="hidden"
            />
          </label>

          <button
            onClick={() => importJson('merge')}
            disabled={busy || !jsonPreview?.valid}
            className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            Import (Merge)
          </button>

          <button
            onClick={() => importJson('replace')}
            disabled={busy || !jsonPreview?.valid}
            className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            title="Replace clears existing data before import"
          >
            Import (Replace)
          </button>
        </div>

        {jsonPreview?.valid && !jsonPreview?.encrypted && (
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

        {jsonPreview?.valid && jsonPreview?.encrypted && (
          <div className="text-gray-300 text-sm">
            <p className="mb-1"><span className="font-semibold">Encrypted backup detected:</span> {jsonPreview.fileName}</p>
            <p className="text-xs text-gray-400">You will be prompted for a passphrase or Recovery Code.</p>
          </div>
        )}

        {/* Advanced (CSV) */}
        <div className="mt-6 border-t border-gray-700 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-md font-semibold text-white">Advanced (CSV)</h4>
            <div className="flex items-center gap-2">
              {advancedVisible ? (
                <button
                  className="px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600"
                  onClick={() => setAdvancedVisible(false)}
                  title="Hide the Advanced CSV area and remove the unlock flag"
                >
                  Hide
                </button>
              ) : (
                <span className="text-xs text-gray-400">
                  (Long-press the header or tap it 7× to unlock)
                </span>
              )}
            </div>
          </div>

          {advancedVisible && (
            <>
              <p className="text-gray-300 text-sm mb-3">
                Import AppSheet-style CSV exports. You can provide any subset (Categories, Requestors, Prayers). Blank rows are skipped.
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
                </div>

                <div className="bg-gray-900 rounded p-3">
                  <label className="block text-gray-200 text-sm mb-1">Requestors CSV</label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setCsv('requestors', e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-200"
                  />
                </div>

                <div className="bg-gray-900 rounded p-3 sm:col-span-2">
                  <label className="block text-gray-200 text-sm mb-1">Prayers CSV</label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setCsv('prayers', e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-200"
                  />
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
            </>
          )}
        </div>

        {message && <p className="mt-4 text-gray-300">{message}</p>}
      </section>

      {/* ===== Onboarding ===== */}
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

      {/* ===== About ===== */}
      <section className="bg-gray-800 rounded-lg p-4 shadow mt-6">
        <h3 className="text-lg font-semibold text-white mb-2">About</h3>
        <p className="text-gray-300 text-sm">
          Your data stays on this device by default (IndexedDB). Use Backup to export a JSON you can keep
          securely or move to another device. To restore, import that JSON. No account required.
        </p>
      </section>
    </div>
  );
}
