// src/components/Settings.jsx
// Settings page with PWA installation, Private Vault controls,
// notifications, JSON backup/restore, onboarding, and privacy information.
// Legacy CSV import has been removed.

import React, { useEffect, useRef, useState } from 'react';
import { emitDbChanged, db } from '../db';
import {
  exportSmartJson,
  downloadJson,
  importSmartFromFileText,
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
  isVaultEnabled,
  isUnlocked,
  enableVaultFirstTime,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  changePassphrase,
  regenerateRecoveryCode,
  lockNow,
  setIdleMinutes,
  getIdleMinutes,
} from '../utils/vault';

const DEFAULT_NOTIFICATION_CONFIG = {
  enabled: false,
  mode: 'simple',
  scheduleType: 'fixed-times',
  times: ['08:00', '20:00'],
  intervalMinutes: 60,
  daysOfWeek: [true, true, true, true, true, true, true],
  categoryId: null,
  requestorId: null,
};

// In-memory only: preserves a selected backup across Settings remounts and
// Vite hot-module replacement while the page itself remains open. Backup file
// contents are never persisted to localStorage/sessionStorage.
const BACKUP_CACHE_GLOBAL_KEY = '__closetPrayerBackupImportCacheV2';
const BACKUP_DEBUG_STORAGE_KEY = 'cp:backup-debug-events:v1';
const BACKUP_DEBUG_EVENT_LIMIT = 80;

function getBackupImportCache() {
  if (typeof window === 'undefined') {
    return { text: '', preview: null, selectedAt: null };
  }

  if (!window[BACKUP_CACHE_GLOBAL_KEY]) {
    window[BACKUP_CACHE_GLOBAL_KEY] = {
      text: '',
      preview: null,
      selectedAt: null,
    };
  }

  return window[BACKUP_CACHE_GLOBAL_KEY];
}

function readBackupDebugEvents() {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(BACKUP_DEBUG_STORAGE_KEY) || '[]'
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendBackupDebugEvent(eventName, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    event: eventName,
    ...details,
  };

  console.info('[ClosetPrayer BackupDebug]', entry);

  try {
    const current = readBackupDebugEvents();
    const next = [...current, entry].slice(-BACKUP_DEBUG_EVENT_LIMIT);
    window.sessionStorage.setItem(
      BACKUP_DEBUG_STORAGE_KEY,
      JSON.stringify(next)
    );
    return next;
  } catch {
    return [entry];
  }
}

function isStandalone() {
  const displayMode = window.matchMedia
    ? window.matchMedia('(display-mode: standalone)')
    : { matches: false };

  return Boolean(window.navigator?.standalone === true || displayMode.matches);
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;

  return Boolean(
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes('Mac') && 'ontouchend' in window)
  );
}

export default function Settings() {
  // -------------------------------------------------------------------------
  // Install as App
  // -------------------------------------------------------------------------
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [installMessage, setInstallMessage] = useState('');
  const [installed, setInstalled] = useState(isStandalone());
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault?.();
      setInstallPromptEvent(event);
      setInstallMessage('App installation is available on this device.');
    }

    function onAppInstalled() {
      setInstalled(true);
      setInstallPromptEvent(null);
      setInstallMessage('App installed.');
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayModeChange = () => setInstalled(isStandalone());

    displayMode?.addEventListener?.('change', onDisplayModeChange);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        onBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', onAppInstalled);
      displayMode?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  async function handleInstallClick() {
    try {
      setInstallMessage('');

      if (!installPromptEvent) {
        setShowInstallHelp(true);
        return;
      }

      installPromptEvent.prompt?.();
      const choice = await installPromptEvent.userChoice;

      setInstallMessage(
        choice?.outcome === 'accepted'
          ? 'Install accepted. Check your Home Screen or app list.'
          : 'Install dismissed.'
      );
      setInstallPromptEvent(null);
    } catch (error) {
      setInstallMessage(error?.message || 'Could not start installation.');
    }
  }

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationConfig, setNotificationConfig] = useState(() => ({
    ...DEFAULT_NOTIFICATION_CONFIG,
    ...(loadNotificationConfig() || {}),
  }));
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [categories, setCategories] = useState([]);
  const [requestors, setRequestors] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationOptions() {
      try {
        const [categoryRows, requestorRows] = await Promise.all([
          db.categories.toArray(),
          db.requestors.toArray(),
        ]);

        categoryRows.sort((a, b) =>
          (a.name || '').localeCompare(b.name || '')
        );
        const activeRequestorRows = requestorRows.filter(
          (requestor) => !Boolean(requestor.archived)
        );

        activeRequestorRows.sort((a, b) =>
          (a.name || '').localeCompare(b.name || '')
        );

        if (!cancelled) {
          setCategories(categoryRows);
          setRequestors(activeRequestorRows);
        }
      } catch (error) {
        console.error('Could not load notification options:', error);
      }
    }

    loadNotificationOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateNotificationConfig(patch) {
    setNotificationConfig((current) => {
      const next = {
        ...current,
        ...patch,
      };

      if (!Array.isArray(next.times) || next.times.length === 0) {
        next.times = ['08:00'];
      }

      if (
        !Array.isArray(next.daysOfWeek) ||
        next.daysOfWeek.length !== 7
      ) {
        next.daysOfWeek = [true, true, true, true, true, true, true];
      }

      if (
        !Number.isFinite(Number(next.intervalMinutes)) ||
        Number(next.intervalMinutes) < 5
      ) {
        next.intervalMinutes = 60;
      }

      saveNotificationConfig(next);
      return next;
    });
  }

  async function handleTestNotification() {
    try {
      setNotificationBusy(true);
      setNotificationMessage('');
      await ensurePermission();

      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('Closet Prayer — Test', {
          body: 'This is a test notification.',
          tag: 'cp:test',
        });
      } else {
        new Notification('Closet Prayer — Test', {
          body: 'This is a test notification.',
        });
      }

      setNotificationPermission(Notification.permission);
      setNotificationMessage('Test notification sent.');
    } catch (error) {
      setNotificationMessage(
        error?.message || 'Unable to show a notification.'
      );
    } finally {
      setNotificationBusy(false);
    }
  }

  async function handleSaveAndSchedule() {
    try {
      setNotificationBusy(true);
      setNotificationMessage('');

      if (!notificationConfig.enabled) {
        await clearScheduledNotifications();
        setNotificationMessage(
          'Notifications are disabled. Existing local schedules were cleared.'
        );
        return;
      }

      if (notificationConfig.scheduleType === 'interval') {
        const interval = Number.parseInt(
          notificationConfig.intervalMinutes,
          10
        );

        if (!Number.isFinite(interval) || interval < 5) {
          setNotificationMessage(
            'Choose an interval of at least 5 minutes.'
          );
          return;
        }
      }

      if (!notificationConfig.daysOfWeek.some(Boolean)) {
        setNotificationMessage('Select at least one day of the week.');
        return;
      }

      if (
        notificationConfig.mode === 'ordered-category' &&
        !notificationConfig.categoryId
      ) {
        setNotificationMessage('Choose a category for the ordered cycle.');
        return;
      }

      if (
        notificationConfig.mode === 'ordered-requestor' &&
        !notificationConfig.requestorId
      ) {
        setNotificationMessage('Choose a requestor for the ordered cycle.');
        return;
      }

      await ensurePermission();
      await scheduleNotifications(notificationConfig);
      setNotificationPermission(Notification.permission);
      setNotificationMessage(
        'Notification settings saved and the local schedule was refreshed.'
      );
    } catch (error) {
      setNotificationMessage(error?.message || 'Failed to schedule reminders.');
    } finally {
      setNotificationBusy(false);
    }
  }

  async function handleClearScheduled() {
    try {
      setNotificationBusy(true);
      setNotificationMessage('');
      await clearScheduledNotifications();
      setNotificationMessage('Scheduled notifications cleared.');
    } catch (error) {
      setNotificationMessage(
        error?.message || 'Failed to clear scheduled notifications.'
      );
    } finally {
      setNotificationBusy(false);
    }
  }

  function handleExportCalendar() {
    try {
      const calendarText = buildICS(notificationConfig, 60);
      downloadICS(calendarText);
      setNotificationMessage('Calendar reminder file exported.');
    } catch (error) {
      setNotificationMessage(
        error?.message || 'Failed to create the calendar file.'
      );
    }
  }

  // -------------------------------------------------------------------------
  // Private Vault
  // -------------------------------------------------------------------------
  const [vaultEnabled, setVaultEnabled] = useState(isVaultEnabled());
  const [vaultUnlocked, setVaultUnlocked] = useState(isUnlocked());
  const [vaultMessage, setVaultMessage] = useState('');
  const [idleMinutes, setIdleMinutesState] = useState(getIdleMinutes());
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  function syncVaultState() {
    setVaultEnabled(isVaultEnabled());
    setVaultUnlocked(isUnlocked());
  }

  async function handleEnableVault() {
    const accepted = window.confirm(
      'Private Vault warning:\n\nIf you forget both your passphrase and Recovery Code, encrypted data cannot be recovered. Continue only if you are prepared to store the Recovery Code safely.'
    );

    if (!accepted) return;

    const passphrase = window.prompt(
      'Create a Private Vault passphrase with at least 8 characters:'
    );

    if (!passphrase) return;

    const confirmation = window.prompt('Enter the passphrase again:');

    if (confirmation !== passphrase) {
      setVaultMessage('Passphrases did not match. The vault was not enabled.');
      return;
    }

    try {
      const result = await enableVaultFirstTime(passphrase);
      setRecoveryCode(result.recoveryCode);
      setShowRecoveryCode(true);
      setVaultMessage(
        'Vault enabled and unlocked for this session. Save the Recovery Code now.'
      );
      syncVaultState();
    } catch (error) {
      setVaultMessage(error?.message || 'Failed to enable the vault.');
    }
  }

  async function handleUnlockWithPassphrase() {
    const passphrase = window.prompt('Enter your Private Vault passphrase:');

    if (!passphrase) return;

    try {
      await unlockWithPassphrase(passphrase);
      setVaultMessage('Vault unlocked for this session.');
      syncVaultState();
    } catch (error) {
      setVaultMessage(error?.message || 'Wrong passphrase.');
    }
  }

  async function handleUnlockWithRecoveryCode() {
    const code = window.prompt('Enter your Recovery Code:');

    if (!code) return;

    try {
      await unlockWithRecoveryCode(code);
      setVaultMessage('Vault unlocked with the Recovery Code.');
      syncVaultState();
    } catch (error) {
      setVaultMessage(
        error?.message || 'The Recovery Code could not unlock the vault.'
      );
    }
  }

  async function handleChangePassphrase() {
    const currentPassphrase = window.prompt('Enter the current passphrase:');
    if (!currentPassphrase) return;

    const newPassphrase = window.prompt(
      'Enter a new passphrase with at least 8 characters:'
    );
    if (!newPassphrase) return;

    const confirmation = window.prompt('Enter the new passphrase again:');

    if (confirmation !== newPassphrase) {
      setVaultMessage('New passphrases did not match. No change was made.');
      return;
    }

    try {
      await changePassphrase(currentPassphrase, newPassphrase);
      setVaultMessage('Vault passphrase changed.');
      syncVaultState();
    } catch (error) {
      setVaultMessage(error?.message || 'Failed to change the passphrase.');
    }
  }

  async function handleRegenerateRecoveryCode() {
    if (!vaultUnlocked) {
      setVaultMessage('Unlock the vault before regenerating the Recovery Code.');
      return;
    }

    const accepted = window.confirm(
      'Regenerating the Recovery Code permanently invalidates the old code. Continue?'
    );

    if (!accepted) return;

    try {
      const result = await regenerateRecoveryCode();
      setRecoveryCode(result.recoveryCode);
      setShowRecoveryCode(true);
      setVaultMessage(
        'A new Recovery Code was generated. Replace every stored copy of the old code.'
      );
    } catch (error) {
      setVaultMessage(
        error?.message || 'Failed to regenerate the Recovery Code.'
      );
    }
  }

  function handleLockNow() {
    lockNow();
    setRecoveryCode('');
    setShowRecoveryCode(false);
    setVaultMessage('Vault locked.');
    syncVaultState();
  }

  function handleIdleMinutesChange(value) {
    const parsed = Number.parseInt(value || '0', 10);
    const next = Math.max(1, Number.isFinite(parsed) ? parsed : 1);

    setIdleMinutesState(next);
    setIdleMinutes(next);
  }

  async function handleCopyRecoveryCode() {
    if (!recoveryCode) return;

    try {
      await navigator.clipboard.writeText(recoveryCode);
      setVaultMessage('Recovery Code copied. Store it somewhere safe and offline.');
    } catch {
      setVaultMessage(
        'The browser could not copy the code. Select it and copy it manually.'
      );
    }
  }

  // -------------------------------------------------------------------------
  // Backup and Restore
  // -------------------------------------------------------------------------
  const backupFileRef = useRef(null);
  const backupReadTokenRef = useRef(0);
  const initialBackupCacheRef = useRef(getBackupImportCache());
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupPreview, setBackupPreview] = useState(
    () => initialBackupCacheRef.current.preview
  );
  const [backupFileText, setBackupFileText] = useState(
    () => initialBackupCacheRef.current.text
  );
  const [showBackupDebug, setShowBackupDebug] = useState(false);
  const [backupDebugEvents, setBackupDebugEvents] = useState(
    () => readBackupDebugEvents()
  );

  const cachedBackup = getBackupImportCache();
  const effectiveBackupPreview =
    backupPreview?.valid ? backupPreview : cachedBackup.preview;
  const effectiveBackupFileText = backupFileText || cachedBackup.text || '';

  function recordBackupDebug(eventName, details = {}) {
    setBackupDebugEvents(appendBackupDebugEvent(eventName, details));
  }

  useEffect(() => {
    const cache = getBackupImportCache();
    setBackupDebugEvents(
      appendBackupDebugEvent('settings-mounted', {
        cachedSelection: Boolean(cache.preview?.valid),
        cachedFileName: cache.preview?.fileName || null,
        cachedTextLength: cache.text?.length || 0,
      })
    );

    const onVisibilityChange = () => {
      setBackupDebugEvents(
        appendBackupDebugEvent('visibility-change', {
          visibilityState: document.visibilityState,
          cachedSelection: Boolean(getBackupImportCache().preview?.valid),
        })
      );
    };

    const onPageShow = (event) => {
      setBackupDebugEvents(
        appendBackupDebugEvent('pageshow', {
          persisted: Boolean(event.persisted),
          cachedSelection: Boolean(getBackupImportCache().preview?.valid),
        })
      );
    };

    const onPageHide = (event) => {
      appendBackupDebugEvent('pagehide', {
        persisted: Boolean(event.persisted),
        cachedSelection: Boolean(getBackupImportCache().preview?.valid),
      });
    };

    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      appendBackupDebugEvent('settings-unmounted', {
        cachedSelection: Boolean(getBackupImportCache().preview?.valid),
      });
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const cache = getBackupImportCache();

    if (!backupPreview?.valid && cache.preview?.valid) {
      setBackupPreview(cache.preview);
      setBackupFileText(cache.text || '');
      recordBackupDebug('selection-resynced-from-memory', {
        fileName: cache.preview.fileName || null,
        textLength: cache.text?.length || 0,
      });
    }
  }, [backupPreview]);

  function parseBackupPreview(text, fileName = 'backup.json') {
    try {
      const parsed = JSON.parse(text);

      if (parsed?.header?.type === 'cp/encrypted-backup') {
        return {
          fileName,
          encrypted: true,
          portable: parsed?.header?.contents === 'portable-graft',
          selection: null,
          counts: null,
          valid: true,
          raw: parsed,
        };
      }

      const portable = parsed?.exportType === 'cp/portable-graft';
      const data = parsed?.data || parsed || {};
      const counts = {
        categories: Array.isArray(data.categories) ? data.categories.length : 0,
        requestors: Array.isArray(data.requestors) ? data.requestors.length : 0,
        prayers: Array.isArray(data.prayers) ? data.prayers.length : 0,
        events: Array.isArray(data.events) ? data.events.length : 0,
        journalEntries: Array.isArray(data.journalEntries)
          ? data.journalEntries.length
          : 0,
      };

      return {
        fileName,
        encrypted: false,
        portable,
        selection: parsed?.selection || null,
        counts,
        valid: true,
        raw: parsed,
      };
    } catch (error) {
      return {
        fileName,
        encrypted: false,
        portable: false,
        selection: null,
        counts: null,
        valid: false,
        error: error?.message || 'Invalid JSON',
        raw: null,
      };
    }
  }

  function resetBackupFileInputElement() {
    if (backupFileRef.current) {
      backupFileRef.current.value = '';
    }
  }

  function commitBackupSelection(text, preview) {
    const cache = getBackupImportCache();
    cache.text = text;
    cache.preview = preview;
    cache.selectedAt = Date.now();

    setBackupFileText(text);
    setBackupPreview(preview);

    recordBackupDebug('selection-committed', {
      fileName: preview?.fileName || null,
      valid: Boolean(preview?.valid),
      encrypted: Boolean(preview?.encrypted),
      portable: Boolean(preview?.portable),
      textLength: text?.length || 0,
    });
  }

  function clearSelectedBackup(reason = 'manual-clear') {
    backupReadTokenRef.current += 1;

    const cache = getBackupImportCache();
    cache.text = '';
    cache.preview = null;
    cache.selectedAt = null;

    setBackupFileText('');
    setBackupPreview(null);
    setBackupMessage('');
    resetBackupFileInputElement();

    recordBackupDebug('selection-cleared', { reason });
  }

  async function handleExportBackup() {
    try {
      setBackupBusy(true);
      setBackupMessage('');
      recordBackupDebug('export-started', {
        selectionPreserved: Boolean(effectiveBackupPreview?.valid),
      });

      const result = await exportSmartJson();
      downloadJson(result.text, result.fileName);
      setBackupMessage(
        vaultEnabled ? 'Encrypted backup exported.' : 'Backup exported as JSON.'
      );
      recordBackupDebug('export-finished', {
        exportedFileName: result.fileName || null,
        selectionPreserved: Boolean(getBackupImportCache().preview?.valid),
      });
    } catch (error) {
      console.error(error);
      setBackupMessage(error?.message || 'Backup export failed.');
      recordBackupDebug('export-failed', {
        error: error?.message || String(error),
      });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleBackupFileChange(event) {
    setBackupMessage('');

    const input = event.currentTarget;
    const file = input?.files?.[0];

    if (!file) {
      recordBackupDebug('file-change-empty', {
        existingSelection: Boolean(getBackupImportCache().preview?.valid),
        inputFileCount: input?.files?.length || 0,
      });
      return;
    }

    const readToken = ++backupReadTokenRef.current;
    const hadPreviousSelection = Boolean(
      getBackupImportCache().preview?.valid
    );

    recordBackupDebug('file-read-started', {
      readToken,
      fileName: file.name || null,
      fileSize: Number.isFinite(file.size) ? file.size : null,
      fileType: file.type || null,
      hadPreviousSelection,
    });

    try {
      const text = await file.text();

      if (readToken !== backupReadTokenRef.current) {
        recordBackupDebug('file-read-ignored-stale', {
          readToken,
          fileName: file.name || null,
        });
        return;
      }

      const preview = parseBackupPreview(text, file.name);

      if (!preview.valid) {
        resetBackupFileInputElement();
        setBackupMessage(
          hadPreviousSelection
            ? `Could not read ${file.name || 'the new file'} as a backup. Your previous backup selection is still ready to import.`
            : `Could not read backup: ${preview.error}`
        );
        recordBackupDebug('file-parse-invalid', {
          readToken,
          fileName: file.name || null,
          error: preview.error || 'Invalid backup',
          previousSelectionRetained: hadPreviousSelection,
        });
        return;
      }

      commitBackupSelection(text, preview);

      if (preview.encrypted) {
        setBackupMessage(
          preview.portable
            ? `Encrypted portable graft detected: ${preview.fileName}`
            : `Encrypted backup detected: ${preview.fileName}`
        );
      } else {
        const prefix = preview.portable
          ? `Portable ${preview.selection?.kind || 'data'} graft loaded: `
          : 'Loaded ';
        setBackupMessage(
          prefix +
            `${preview.fileName}: ` +
            `${preview.counts.categories} categories, ` +
            `${preview.counts.requestors} requestors, ` +
            `${preview.counts.prayers} prayers, ` +
            `${preview.counts.events} events, ` +
            `${preview.counts.journalEntries} journal entries.`
        );
      }
    } catch (error) {
      console.error(error);

      if (readToken !== backupReadTokenRef.current) {
        recordBackupDebug('file-read-error-ignored-stale', {
          readToken,
          fileName: file.name || null,
          error: error?.message || String(error),
        });
        return;
      }

      resetBackupFileInputElement();
      const previousStillAvailable = Boolean(
        getBackupImportCache().preview?.valid
      );
      setBackupMessage(
        previousStillAvailable
          ? 'The browser failed to read the new file, but your previous backup selection is still ready to import.'
          : 'Failed to read the selected backup file.'
      );
      recordBackupDebug('file-read-failed', {
        readToken,
        fileName: file.name || null,
        error: error?.message || String(error),
        previousSelectionRetained: previousStillAvailable,
      });
    }
  }

  async function handleImportBackup(mode) {
    const cache = getBackupImportCache();
    const activePreview =
      effectiveBackupPreview?.valid ? effectiveBackupPreview : cache.preview;
    const activeText = effectiveBackupFileText || cache.text || '';

    if (!activePreview?.valid || !activePreview?.raw) {
      setBackupMessage('Choose a valid backup file first.');
      recordBackupDebug('import-blocked-no-selection', { mode });
      return;
    }

    if (mode === 'replace' && activePreview.portable) {
      setBackupMessage(
        'Portable branch exports must be imported with Merge so they can be grafted into the current database.'
      );
      recordBackupDebug('import-blocked-portable-replace', {
        fileName: activePreview.fileName || null,
      });
      return;
    }

    if (
      mode === 'replace' &&
      !window.confirm(
        'Replace will erase all current app data before importing this backup. Continue?'
      )
    ) {
      recordBackupDebug('import-replace-cancelled', {
        fileName: activePreview.fileName || null,
      });
      return;
    }

    try {
      setBackupBusy(true);
      setBackupMessage('');
      recordBackupDebug('import-started', {
        mode,
        fileName: activePreview.fileName || null,
        encrypted: Boolean(activePreview.encrypted),
        portable: Boolean(activePreview.portable),
        textLength: activeText.length,
      });

      if (activePreview.encrypted) {
        const method = window.prompt(
          'Encrypted backup detected. Type "pass" to use the passphrase or "recovery" to use the Recovery Code:'
        );

        if (!method) {
          recordBackupDebug('import-unlock-cancelled', { mode });
          return;
        }

        const normalizedMethod = method.trim().toLowerCase();

        if (normalizedMethod !== 'pass' && normalizedMethod !== 'recovery') {
          setBackupMessage('Import cancelled: unknown unlock method.');
          recordBackupDebug('import-unlock-method-invalid', {
            mode,
            method: normalizedMethod,
          });
          return;
        }

        const secret = window.prompt(
          normalizedMethod === 'pass'
            ? 'Enter the backup passphrase:'
            : 'Enter the backup Recovery Code:'
        );

        if (!secret) {
          recordBackupDebug('import-secret-cancelled', { mode });
          return;
        }

        await importSmartFromFileText(
          activeText || JSON.stringify(activePreview.raw),
          {
            mode,
            secretKind:
              normalizedMethod === 'pass' ? 'passphrase' : 'recovery',
            secret,
          }
        );
      } else {
        await importSmartFromFileText(
          activeText || JSON.stringify(activePreview.raw),
          { mode }
        );
      }

      emitDbChanged();
      setBackupMessage(
        activePreview.portable
          ? 'Portable graft imported successfully. Existing unrelated data was preserved.'
          : `Import (${mode}) complete.`
      );
      recordBackupDebug('import-succeeded', {
        mode,
        fileName: activePreview.fileName || null,
      });
      clearSelectedBackup('successful-import');
    } catch (error) {
      console.error(error);
      setBackupMessage(
        `Import (${mode}) failed. ${error?.message || ''}`.trim()
      );
      recordBackupDebug('import-failed', {
        mode,
        fileName: activePreview?.fileName || null,
        error: error?.message || String(error),
        selectionRetained: Boolean(getBackupImportCache().preview?.valid),
      });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleCopyBackupDiagnostics() {
    const cache = getBackupImportCache();
    const diagnostics = {
      capturedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      visibilityState: document.visibilityState,
      state: {
        backupBusy,
        stateHasPreview: Boolean(backupPreview?.valid),
        effectiveHasPreview: Boolean(effectiveBackupPreview?.valid),
        fileName: effectiveBackupPreview?.fileName || null,
        encrypted: Boolean(effectiveBackupPreview?.encrypted),
        portable: Boolean(effectiveBackupPreview?.portable),
        stateTextLength: backupFileText.length,
        cachedTextLength: cache.text?.length || 0,
        cacheSelectedAt: cache.selectedAt || null,
        inputFileCount: backupFileRef.current?.files?.length || 0,
      },
      events: backupDebugEvents,
    };

    const text = JSON.stringify(diagnostics, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      setBackupMessage(
        'Backup diagnostics copied to the clipboard. No backup contents were included.'
      );
    } catch (error) {
      console.info('[ClosetPrayer BackupDebug] Diagnostics payload:', diagnostics);
      setBackupMessage(
        'Clipboard access was unavailable. Backup diagnostics were written to the browser console instead.'
      );
    }
  }

  function clearBackupDebugLog() {
    try {
      window.sessionStorage.removeItem(BACKUP_DEBUG_STORAGE_KEY);
    } catch {}
    setBackupDebugEvents([]);
    console.info('[ClosetPrayer BackupDebug] Debug log cleared.');
  }

  return (
    <div className="relative overflow-y-auto p-4 pb-24">
      <h2 className="text-2xl font-bold mb-4">Settings</h2>

      <section className="bg-gray-800 rounded-lg p-4 shadow space-y-3 mb-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Install as App</h3>
          {installed && (
            <span className="text-xs px-2 py-1 rounded bg-emerald-700 text-white">
              Installed
            </span>
          )}
        </div>

        {!installed && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              onClick={handleInstallClick}
            >
              Install app
            </button>
            <button
              type="button"
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
              onClick={() => setShowInstallHelp((current) => !current)}
            >
              {showInstallHelp ? 'Hide help' : 'How to install on this device'}
            </button>
          </div>
        )}

        {installMessage && (
          <p className="text-gray-300 text-sm">{installMessage}</p>
        )}

        {showInstallHelp && !installed && (
          <div className="bg-gray-900 rounded p-3 text-sm text-gray-200 space-y-3">
            {isIOS() ? (
              <>
                <div>
                  <p className="font-semibold">iPhone or iPad:</p>
                  <ol className="list-decimal list-inside space-y-1 mt-1">
                    <li>Open Closet Prayer in Safari.</li>
                    <li>Tap Safari’s Share button.</li>
                    <li>Choose Add to Home Screen.</li>
                    <li>Tap Add.</li>
                  </ol>
                </div>
                <p className="text-xs text-gray-400">
                  Apple does not expose the programmatic install prompt used by
                  Chromium browsers, so the Share menu is required.
                </p>
              </>
            ) : (
              <div>
                <p className="font-semibold">Android or desktop:</p>
                <ol className="list-decimal list-inside space-y-1 mt-1">
                  <li>Open the browser menu or address-bar install control.</li>
                  <li>Choose Install app or Add to Home Screen.</li>
                  <li>Confirm the installation.</li>
                </ol>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="bg-gray-800 rounded-lg p-4 shadow space-y-3 mb-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Private Vault</h3>
          <div className="flex flex-wrap justify-end gap-2 text-xs">
            <span
              className={`px-2 py-1 rounded text-white ${
                vaultEnabled ? 'bg-emerald-700' : 'bg-gray-700'
              }`}
            >
              {vaultEnabled ? 'Enabled' : 'Disabled'}
            </span>
            {vaultEnabled && (
              <span
                className={`px-2 py-1 rounded text-white ${
                  vaultUnlocked ? 'bg-emerald-700' : 'bg-amber-700'
                }`}
              >
                {vaultUnlocked ? 'Unlocked' : 'Locked'}
              </span>
            )}
          </div>
        </div>

        {!vaultEnabled ? (
          <>
            <p className="text-gray-300 text-sm">
              The Private Vault protects encrypted data with a passphrase and a
              one-time Recovery Code. The vault key remains only in memory while
              the vault is unlocked.
            </p>
            <button
              type="button"
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white self-start"
              onClick={handleEnableVault}
            >
              Enable vault
            </button>
          </>
        ) : (
          <>
            {!vaultUnlocked ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
                  onClick={handleUnlockWithPassphrase}
                >
                  Unlock with passphrase
                </button>
                <button
                  type="button"
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                  onClick={handleUnlockWithRecoveryCode}
                >
                  Unlock with Recovery Code
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                  onClick={handleChangePassphrase}
                >
                  Change passphrase
                </button>
                <button
                  type="button"
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                  onClick={handleRegenerateRecoveryCode}
                >
                  Regenerate Recovery Code
                </button>
                <button
                  type="button"
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-white"
                  onClick={handleLockNow}
                >
                  Lock now
                </button>
              </div>
            )}

            <div>
              <label
                htmlFor="vault-idle-timeout"
                className="block text-gray-200 text-sm mb-1"
              >
                Auto-lock after inactivity
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="vault-idle-timeout"
                  type="number"
                  min="1"
                  className="bg-gray-700 text-white rounded p-2 w-24"
                  value={idleMinutes}
                  onChange={(event) =>
                    handleIdleMinutesChange(event.target.value)
                  }
                />
                <span className="text-gray-300 text-sm">minutes</span>
              </div>
            </div>

            {showRecoveryCode && recoveryCode && (
              <div className="bg-gray-900 rounded p-3">
                <p className="text-gray-200 text-sm font-semibold">
                  Recovery Code — save this now
                </p>
                <p className="mt-2 text-white font-mono text-lg break-all">
                  {recoveryCode}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleCopyRecoveryCode}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
                  >
                    Copy code
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRecoveryCode(false)}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                  >
                    Hide code
                  </button>
                </div>
                <p className="text-xs text-amber-300 mt-2">
                  Store it offline. Generating another Recovery Code invalidates
                  this one.
                </p>
              </div>
            )}
          </>
        )}

        {vaultMessage && <p className="text-gray-300">{vaultMessage}</p>}

        <p className="text-xs text-gray-400">
          Forgetting both the passphrase and Recovery Code makes encrypted data
          permanently unrecoverable.
        </p>
      </section>

      <section className="bg-gray-800 rounded-lg p-4 shadow space-y-4 mb-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">
            Notifications &amp; Reminders
          </h3>
          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={Boolean(notificationConfig.enabled)}
              onChange={(event) =>
                updateNotificationConfig({ enabled: event.target.checked })
              }
            />
            Enabled
          </label>
        </div>

        <div className="text-sm text-gray-300">
          <p>
            Reminders are configured locally. Browser and operating-system power
            controls can affect exact delivery on some devices.
          </p>
          <p className="mt-1">
            Permission:{' '}
            <span className="font-medium">{notificationPermission}</span>
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-gray-900 rounded p-3">
            <label
              htmlFor="notification-content"
              className="block text-gray-200 text-sm mb-1"
            >
              Notification content
            </label>
            <select
              id="notification-content"
              className="w-full bg-gray-700 text-white rounded p-2"
              value={notificationConfig.mode}
              onChange={(event) =>
                updateNotificationConfig({ mode: event.target.value })
              }
            >
              <option value="simple">Simple — Remember to pray</option>
              <option value="random">Randomized prayer request</option>
              <option value="ordered-category">
                Ordered cycle by category
              </option>
              <option value="ordered-requestor">
                Ordered cycle by requestor
              </option>
            </select>

            {notificationConfig.mode === 'ordered-category' && (
              <div className="mt-3">
                <label
                  htmlFor="notification-category"
                  className="block text-gray-200 text-sm mb-1"
                >
                  Category
                </label>
                <select
                  id="notification-category"
                  className="w-full bg-gray-700 text-white rounded p-2"
                  value={notificationConfig.categoryId || ''}
                  onChange={(event) =>
                    updateNotificationConfig({
                      categoryId: event.target.value || null,
                    })
                  }
                >
                  <option value="">Choose a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {notificationConfig.mode === 'ordered-requestor' && (
              <div className="mt-3">
                <label
                  htmlFor="notification-requestor"
                  className="block text-gray-200 text-sm mb-1"
                >
                  Requestor
                </label>
                <select
                  id="notification-requestor"
                  className="w-full bg-gray-700 text-white rounded p-2"
                  value={notificationConfig.requestorId || ''}
                  onChange={(event) =>
                    updateNotificationConfig({
                      requestorId: event.target.value || null,
                    })
                  }
                >
                  <option value="">Choose a requestor</option>
                  {requestors.map((requestor) => (
                    <option key={requestor.id} value={requestor.id}>
                      {requestor.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="bg-gray-900 rounded p-3">
            <label
              htmlFor="notification-schedule-type"
              className="block text-gray-200 text-sm mb-1"
            >
              Schedule type
            </label>
            <select
              id="notification-schedule-type"
              className="w-full bg-gray-700 text-white rounded p-2 mb-3"
              value={notificationConfig.scheduleType || 'fixed-times'}
              onChange={(event) =>
                updateNotificationConfig({
                  scheduleType: event.target.value,
                })
              }
            >
              <option value="fixed-times">Specific times of day</option>
              <option value="interval">Repeating interval</option>
            </select>

            {notificationConfig.scheduleType === 'interval' ? (
              <div>
                <label
                  htmlFor="notification-interval"
                  className="block text-gray-200 text-sm mb-2"
                >
                  Repeat every
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="notification-interval"
                    type="number"
                    min="5"
                    step="1"
                    className="bg-gray-700 text-white rounded p-2 w-24"
                    value={notificationConfig.intervalMinutes}
                    onChange={(event) =>
                      updateNotificationConfig({
                        intervalMinutes: Math.max(
                          5,
                          Number.parseInt(event.target.value || '0', 10) || 0
                        ),
                      })
                    }
                  />
                  <span className="text-gray-300 text-sm">minutes</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Examples: 30 minutes, 60 minutes for hourly, or 180 minutes
                  for every 3 hours.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-gray-200 text-sm mb-2">
                  Times of day
                </label>
                <div className="flex flex-col gap-2">
                  {notificationConfig.times.map((time, index) => (
                    <div
                      key={`${time}-${index}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="time"
                        className="bg-gray-700 text-white rounded p-2"
                        value={time}
                        onChange={(event) => {
                          const times = [...notificationConfig.times];
                          times[index] = event.target.value;
                          updateNotificationConfig({ times });
                        }}
                      />
                      <button
                        type="button"
                        className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 text-gray-200"
                        onClick={() => {
                          const times = notificationConfig.times.filter(
                            (_, itemIndex) => itemIndex !== index
                          );
                          updateNotificationConfig({
                            times: times.length > 0 ? times : ['08:00'],
                          });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-sm px-3 py-2 bg-gray-700 rounded hover:bg-gray-600 text-gray-200 self-start"
                    onClick={() =>
                      updateNotificationConfig({
                        times: [...notificationConfig.times, '12:00'],
                      })
                    }
                  >
                    Add another time
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4">
              <span className="block text-gray-200 text-sm mb-2">
                Days of week
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-gray-200">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                  (day, index) => (
                    <label key={day} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(
                          notificationConfig.daysOfWeek[index]
                        )}
                        onChange={(event) => {
                          const days = [...notificationConfig.daysOfWeek];
                          days[index] = event.target.checked;
                          updateNotificationConfig({ daysOfWeek: days });
                        }}
                      />
                      {day}
                    </label>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white disabled:opacity-50"
            onClick={handleSaveAndSchedule}
            disabled={notificationBusy}
          >
            Save &amp; schedule
          </button>
          <button
            type="button"
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white disabled:opacity-50"
            onClick={handleClearScheduled}
            disabled={notificationBusy}
          >
            Clear scheduled
          </button>
          <button
            type="button"
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-white disabled:opacity-50"
            onClick={handleTestNotification}
            disabled={notificationBusy}
          >
            Test now
          </button>
          <button
            type="button"
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white disabled:opacity-50"
            onClick={handleExportCalendar}
            disabled={notificationBusy}
          >
            Export .ics calendar
          </button>
        </div>

        {notificationMessage && (
          <p className="text-gray-300">{notificationMessage}</p>
        )}
      </section>

      <section className="bg-gray-800 rounded-lg p-4 shadow mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-lg font-semibold text-white">
            Backup &amp; Restore
          </h3>
          <button
            type="button"
            onClick={() => setShowBackupDebug((current) => !current)}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-white"
          >
            {showBackupDebug ? 'Hide diagnostics' : 'Show diagnostics'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center mb-4">
          <button
            type="button"
            onClick={handleExportBackup}
            disabled={backupBusy}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {vaultEnabled ? 'Export encrypted backup' : 'Export JSON'}
          </button>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <span className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white">
              Choose backup file
            </span>
            <input
              ref={backupFileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleBackupFileChange}
              className="hidden"
            />
          </label>

          {effectiveBackupPreview?.valid && (
            <button
              type="button"
              onClick={clearSelectedBackup}
              disabled={backupBusy}
              className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              Clear selection
            </button>
          )}

          <button
            type="button"
            onClick={() => handleImportBackup('merge')}
            disabled={backupBusy || !effectiveBackupPreview?.valid}
            className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            Import (Merge)
          </button>

          <button
            type="button"
            onClick={() => handleImportBackup('replace')}
            disabled={
              backupBusy ||
              !effectiveBackupPreview?.valid ||
              Boolean(effectiveBackupPreview?.portable)
            }
            className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            title={
              effectiveBackupPreview?.portable
                ? 'Portable grafts must use Merge Import'
                : 'Erase current data and restore this full backup'
            }
          >
            Import (Replace)
          </button>
        </div>

        {showBackupDebug && (
          <div className="mb-4 rounded bg-gray-900 p-3 text-xs text-gray-300 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-gray-100">Backup diagnostics</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyBackupDiagnostics}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
                >
                  Copy diagnostics
                </button>
                <button
                  type="button"
                  onClick={clearBackupDebugLog}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white"
                >
                  Clear log
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-gray-500">Selected</span>
              <span>{effectiveBackupPreview?.valid ? 'yes' : 'no'}</span>
              <span className="text-gray-500">File</span>
              <span className="break-all">{effectiveBackupPreview?.fileName || '—'}</span>
              <span className="text-gray-500">Busy</span>
              <span>{backupBusy ? 'yes' : 'no'}</span>
              <span className="text-gray-500">State text</span>
              <span>{backupFileText.length.toLocaleString()} chars</span>
              <span className="text-gray-500">Memory cache</span>
              <span>{(getBackupImportCache().text?.length || 0).toLocaleString()} chars</span>
              <span className="text-gray-500">File input</span>
              <span>{backupFileRef.current?.files?.length || 0} file(s)</span>
            </div>

            <p className="text-gray-500">
              The log contains metadata only—never the contents of your backup.
            </p>

            <div className="max-h-48 overflow-y-auto rounded bg-black/30 p-2 font-mono text-[11px] leading-relaxed">
              {backupDebugEvents.length === 0 ? (
                <p className="text-gray-500">No debug events recorded.</p>
              ) : (
                backupDebugEvents.slice().reverse().map((entry, index) => (
                  <div key={`${entry.at}-${index}`} className="mb-1 break-words">
                    <span className="text-gray-500">{entry.at}</span>{' '}
                    <span className="text-gray-200">{entry.event}</span>{' '}
                    <span className="text-gray-500">
                      {JSON.stringify(
                        Object.fromEntries(
                          Object.entries(entry).filter(
                            ([key]) => key !== 'at' && key !== 'event'
                          )
                        )
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {effectiveBackupPreview?.valid && !effectiveBackupPreview.encrypted && (
          <div className="text-gray-300 text-sm">
            <p className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {effectiveBackupPreview.portable
                  ? 'Portable graft ready:'
                  : 'Ready to import:'}
              </span>{' '}
              <span>{effectiveBackupPreview.fileName}</span>
              {effectiveBackupPreview.portable && (
                <span className="rounded bg-emerald-700 px-2 py-0.5 text-xs text-white">
                  Merge only
                </span>
              )}
            </p>
            {effectiveBackupPreview.portable && effectiveBackupPreview.selection?.label && (
              <p className="mb-2 text-gray-400">
                Selection: {effectiveBackupPreview.selection.label}
              </p>
            )}
            <ul className="list-disc list-inside">
              <li>Categories: {effectiveBackupPreview.counts.categories}</li>
              <li>Requestors: {effectiveBackupPreview.counts.requestors}</li>
              <li>Prayers: {effectiveBackupPreview.counts.prayers}</li>
              <li>Events: {effectiveBackupPreview.counts.events}</li>
              <li>
                Journal entries: {effectiveBackupPreview.counts.journalEntries}
              </li>
            </ul>
          </div>
        )}

        {effectiveBackupPreview?.valid && effectiveBackupPreview.encrypted && (
          <div className="text-gray-300 text-sm">
            <p>
              <span className="font-semibold">
                {effectiveBackupPreview.portable
                  ? 'Encrypted portable graft detected:'
                  : 'Encrypted backup detected:'}
              </span>{' '}
              {effectiveBackupPreview.fileName}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Import will request its passphrase or Recovery Code.
              {effectiveBackupPreview.portable
                ? ' Portable grafts must use Merge Import.'
                : ''}
            </p>
          </div>
        )}

        {backupMessage && (
          <p className="mt-4 text-gray-300">{backupMessage}</p>
        )}
      </section>

      <section className="bg-gray-800 rounded-lg p-4 shadow mb-6">
        <h3 className="text-lg font-semibold text-white mb-2">Onboarding</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
            onClick={() =>
              window.dispatchEvent(new Event('ui:showTutorial'))
            }
          >
            Show tutorial
          </button>
          <button
            type="button"
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
            onClick={() => {
              localStorage.removeItem('cp:onboarded');
              setBackupMessage(
                'First-run flag cleared. The tutorial will appear on the next launch.'
              );
            }}
          >
            Reset first-run flag
          </button>
        </div>
      </section>

      <section className="bg-gray-800 rounded-lg p-4 shadow">
        <h3 className="text-lg font-semibold text-white mb-2">About</h3>
        <p className="text-gray-300 text-sm leading-relaxed">
          Closet Prayer stores its database locally on this device using
          IndexedDB. No account is required. Keep current backups before clearing
          browser data, uninstalling the app, or moving to another device.
        </p>
      </section>
    </div>
  );
}
