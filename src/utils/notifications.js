// src/utils/notifications.js
// Lightweight, privacy-friendly notifications manager.
// - Schedules OS-level notifications when Notification Triggers are available.
// - Falls back to in-app timers while the app is open.
// - Offers .ics export for device calendar alarms.
// - No servers, no push endpoints, no accounts.

import { db } from '../db';

// ---------- constants & storage keys ----------
const CFG_KEY = 'cp:notifications:v1';
const CYCLE_KEY_PREFIX = 'cp:notifyCycle'; // cp:notifyCycle:category:<id> or ...:requestor:<id>
const SCHEDULE_TAG_PREFIX = 'cp:notify:';  // used for tags when scheduling with triggers

// ---------- public config helpers ----------
export function loadNotificationConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveNotificationConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg || {}));
}

export async function ensurePermission() {
  if (!('Notification' in window)) {
    throw new Error('Notifications are not supported on this device/browser.');
  }
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was denied.');
  return true;
}

function supportsTriggers() {
  try {
    return 'serviceWorker' in navigator && 'TimestampTrigger' in window;
  } catch {
    return false;
  }
}

// Parse "HH:mm" → Date (today at time), and return timestamp in ms for a given date anchor.
function timeOnDate(anchor, hhmm) {
  const [h, m] = (hhmm || '09:00').split(':').map((n) => parseInt(n, 10));
  const d = new Date(anchor);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

// daysOfWeek = [0..6] booleans; return true if given date matches.
function isAllowedDay(date, daysOfWeek) {
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length !== 7) return true; // default allow
  return !!daysOfWeek[date.getDay()];
}

// Build a list of upcoming timestamps (ms) for the next N days at given times (HH:mm strings)
function buildUpcomingTimestamps({ times = ['09:00'], daysOfWeek = [true,true,true,true,true,true,true] }, horizonDays = 14) {
  const out = [];
  const start = new Date();
  start.setSeconds(0, 0);
  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (!isAllowedDay(d, daysOfWeek)) continue;
    for (const t of times) {
      const ts = timeOnDate(d, t);
      if (ts > Date.now()) out.push(ts);
    }
  }
  return out;
}

// ---------- picking logic ----------
async function pickRandomPrayer() {
  // Same pool as Daily: prayers with status === 'requested'
  const prayers = await db.prayers.where('status').equals('requested').toArray();
  if (!prayers.length) return null;
  const i = Math.floor(Math.random() * prayers.length);
  const p = prayers[i];
  const req = p?.requestorId ? await db.requestors.get(p.requestorId) : null;
  const cat = req?.categoryId ? await db.categories.get(req.categoryId) : null;
  return {
    title: p?.name || 'Prayer request',
    requestor: req?.name || 'Someone',
    category: cat?.name || 'General',
    id: p?.id
  };
}

function cycleKey(scope, id) {
  return `${CYCLE_KEY_PREFIX}:${scope}:${id}`;
}

function getAndBumpCycle(scope, id, listLen) {
  const key = cycleKey(scope, id);
  const raw = localStorage.getItem(key);
  let idx = raw ? parseInt(raw, 10) : 0;
  if (Number.isNaN(idx) || idx < 0) idx = 0;
  const next = listLen ? (idx % listLen) : 0;
  localStorage.setItem(key, String((idx + 1) % Math.max(1, listLen)));
  return next;
}

async function pickOrderedByCategory(categoryId) {
  if (!categoryId) return null;
  // All requested prayers under requestors in category
  const reqs = await db.requestors.where('categoryId').equals(categoryId).toArray();
  const reqIds = reqs.map(r => r.id);
  if (!reqIds.length) return null;
  const prayers = await db.prayers
    .where('requestorId').anyOf(reqIds)
    .and(p => p.status === 'requested')
    .toArray();
  if (!prayers.length) return null;
  const idx = getAndBumpCycle('category', categoryId, prayers.length);
  const p = prayers[idx];
  const req = reqs.find(r => r.id === p.requestorId);
  const cat = await db.categories.get(categoryId);
  return {
    title: p?.name || 'Prayer request',
    requestor: req?.name || 'Someone',
    category: cat?.name || 'General',
    id: p?.id
  };
}

async function pickOrderedByRequestor(requestorId) {
  if (!requestorId) return null;
  const prayers = await db.prayers
    .where('requestorId').equals(requestorId)
    .and(p => p.status === 'requested')
    .toArray();
  if (!prayers.length) return null;
  const idx = getAndBumpCycle('requestor', requestorId, prayers.length);
  const p = prayers[idx];
  const req = await db.requestors.get(requestorId);
  const cat = req?.categoryId ? await db.categories.get(req.categoryId) : null;
  return {
    title: p?.name || 'Prayer request',
    requestor: req?.name || 'Someone',
    category: cat?.name || 'General',
    id: p?.id
  };
}

// Build the content for a single notification occurrence based on config
async function buildPayload(cfg) {
  const mode = cfg?.mode || 'simple';
  if (mode === 'random') {
    const sel = await pickRandomPrayer();
    if (!sel) return { title: 'Closet Prayer', body: 'Remember to pray.', hash: '#daily' };
    return {
      title: 'Closet Prayer — Random',
      body: `Pray for ${sel.requestor}: ${sel.title} (${sel.category})`,
      hash: '#single'
    };
  }
  if (mode === 'ordered-category' && cfg?.categoryId) {
    const sel = await pickOrderedByCategory(cfg.categoryId);
    if (!sel) return { title: 'Closet Prayer', body: 'Remember to pray.', hash: '#daily' };
    return {
      title: 'Closet Prayer — Focused',
      body: `Category • ${sel.category}: ${sel.requestor} — ${sel.title}`,
      hash: '#daily'
    };
  }
  if (mode === 'ordered-requestor' && cfg?.requestorId) {
    const sel = await pickOrderedByRequestor(cfg.requestorId);
    if (!sel) return { title: 'Closet Prayer', body: 'Remember to pray.', hash: '#daily' };
    return {
      title: 'Closet Prayer — Focused',
      body: `Requestor • ${sel.requestor}: ${sel.title}`,
      hash: '#daily'
    };
  }
  return { title: 'Closet Prayer', body: 'Remember to pray.', hash: '#daily' };
}

// ---------- scheduling ----------
let inAppTimers = []; // fallbacks

function clearInAppTimers() {
  inAppTimers.forEach((id) => clearTimeout(id));
  inAppTimers = [];
}

export async function clearScheduledNotifications() {
  clearInAppTimers();
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    // Best-effort: close any pending notifications with our tag prefix.
    const list = await reg.getNotifications({});
    list.forEach(n => {
      if (n.tag && String(n.tag).startsWith(SCHEDULE_TAG_PREFIX)) n.close();
    });
  } catch (e) {
    // best effort
    console.warn('clearScheduledNotifications warning', e);
  }
}

export async function scheduleNotifications(cfg) {
  await ensurePermission();
  await clearScheduledNotifications();

  const timestamps = buildUpcomingTimestamps(cfg, 14); // next 2 weeks
  let useTriggers = supportsTriggers();

  if (useTriggers) {
    try {
      const reg = await navigator.serviceWorker.ready;
      for (const ts of timestamps) {
        const payload = await buildPayload(cfg);
        const tag = `${SCHEDULE_TAG_PREFIX}${ts}`;
        // Experimental: Notification Triggers
        await reg.showNotification(payload.title, {
          body: payload.body,
          tag,
          // @ts-ignore - experimental
          showTrigger: new TimestampTrigger(ts),
          data: { hash: payload.hash, ts }
        });
      }
    } catch (e) {
      console.warn('showNotification(showTrigger) failed; falling back to in-app timers', e);
      useTriggers = false;
    }
  }

  // Fallback: in-app timers while page is open
  if (!useTriggers) {
    for (const ts of timestamps) {
      const delay = Math.max(0, ts - Date.now());
      const t = setTimeout(async () => {
        try {
          const payload = await buildPayload(cfg);
          new Notification(payload.title, { body: payload.body, tag: `${SCHEDULE_TAG_PREFIX}${ts}` });
        } catch {}
      }, delay);
      inAppTimers.push(t);
    }
  }
}

// ---------- ICS export (reliable OS alarms via calendar) ----------
function pad(n) { return n < 10 ? '0'+n : ''+n; }
function toICSDateUTC(date) {
  // YYYYMMDDTHHMMSSZ
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth()+1) +
    pad(date.getUTCDate()) + 'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) + 'Z'
  );
}

export function buildICS(cfg, horizonDays = 60) {
  const timestamps = buildUpcomingTimestamps(cfg, horizonDays);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ClosetPrayer//Notifications//EN',
    'CALSCALE:GREGORIAN',
  ];
  const summaryBase = (cfg.mode === 'simple') ? 'Remember to pray' :
                      (cfg.mode === 'random') ? 'Pray (random request)' :
                      (cfg.mode === 'ordered-category') ? 'Pray (focused category)' :
                      (cfg.mode === 'ordered-requestor') ? 'Pray (focused requestor)' : 'Pray';

  for (const ts of timestamps) {
    const dt = new Date(ts);
    const uid = `${SCHEDULE_TAG_PREFIX}${ts}@closetprayer.com`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${toICSDateUTC(new Date())}`);
    lines.push(`DTSTART:${toICSDateUTC(dt)}`);
    lines.push(`SUMMARY:${summaryBase}`);
    lines.push('DESCRIPTION:Open Closet Prayer to see details or pick a request.');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(icsText, fileName = 'closet-prayer-reminders.ics') {
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
