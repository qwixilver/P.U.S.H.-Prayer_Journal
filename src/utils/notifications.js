// src/utils/notifications.js
// Lightweight, privacy-friendly notifications manager.
// - Fixed-times schedule (specific times per day) OR interval schedule (every N minutes/hours).
// - Uses Notification Triggers where available; falls back to in-app timers.
// - Optional .ics export (fixed-times enumerated; interval uses RRULE).
// - Archived requestors are excluded from request-based notifications.
// - No servers, no push endpoints, no accounts.

import { db } from '../db';

// ---------- constants & storage keys ----------
const CFG_KEY = 'cp:notifications:v1';
const CYCLE_KEY_PREFIX = 'cp:notifyCycle';
const SCHEDULE_TAG_PREFIX = 'cp:notify:';

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

  let permission = Notification.permission;

  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    throw new Error('Notification permission was denied.');
  }

  return true;
}

function supportsTriggers() {
  try {
    return 'serviceWorker' in navigator && 'TimestampTrigger' in window;
  } catch {
    return false;
  }
}

// ---------- date helpers ----------
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function timeOnDate(anchor, hhmm) {
  const [hour, minute] = (hhmm || '09:00')
    .split(':')
    .map((value) => Number.parseInt(value, 10));
  const date = new Date(anchor);

  date.setHours(hour || 0, minute || 0, 0, 0);
  return date.getTime();
}

function isAllowedDay(date, daysOfWeek) {
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length !== 7) return true;
  return Boolean(daysOfWeek[date.getDay()]);
}

function buildUpcomingSchedule(
  config,
  { horizonDays = 14, maxOccurrences = 64 } = {}
) {
  const now = Date.now();
  const scheduleType = config?.scheduleType || 'fixed-times';
  const daysOfWeek =
    Array.isArray(config?.daysOfWeek) && config.daysOfWeek.length === 7
      ? config.daysOfWeek
      : [true, true, true, true, true, true, true];

  if (scheduleType === 'interval') {
    let intervalMinutes = Number.parseInt(
      config?.intervalMinutes || 60,
      10
    );

    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5) {
      intervalMinutes = 5;
    }

    const timestamps = [];
    const horizonLimit = now + horizonDays * DAY;
    let timestamp = now + intervalMinutes * MIN;

    while (
      timestamp <= horizonLimit &&
      timestamps.length < maxOccurrences
    ) {
      const date = new Date(timestamp);

      if (isAllowedDay(date, daysOfWeek)) {
        timestamps.push(timestamp);
      }

      timestamp += intervalMinutes * MIN;
    }

    return timestamps;
  }

  const times =
    Array.isArray(config?.times) && config.times.length
      ? config.times
      : ['09:00'];
  const timestamps = [];
  const start = new Date();

  start.setSeconds(0, 0);

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset += 1) {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + dayOffset
    );

    if (!isAllowedDay(date, daysOfWeek)) continue;

    for (const time of times) {
      const timestamp = timeOnDate(date, time);
      if (timestamp > now) timestamps.push(timestamp);
    }
  }

  timestamps.sort((left, right) => left - right);
  return timestamps.slice(0, maxOccurrences);
}

// ---------- picking logic ----------
async function pickRandomPrayer() {
  const [prayers, requestors, categories] = await Promise.all([
    db.prayers.where('status').equals('requested').toArray(),
    db.requestors.toArray(),
    db.categories.toArray(),
  ]);
  const requestorById = new Map(
    requestors.map((requestor) => [requestor.id, requestor])
  );
  const categoryById = new Map(
    categories.map((category) => [category.id, category])
  );
  const eligiblePrayers = prayers.filter((prayer) => {
    const requestor = requestorById.get(prayer.requestorId);
    return !Boolean(requestor?.archived);
  });

  if (!eligiblePrayers.length) return null;

  const prayer =
    eligiblePrayers[Math.floor(Math.random() * eligiblePrayers.length)];
  const requestor = requestorById.get(prayer.requestorId) || null;
  const category = requestor
    ? categoryById.get(requestor.categoryId) || null
    : null;

  return {
    title: prayer?.name || 'Prayer request',
    requestor: requestor?.name || 'Someone',
    category: category?.name || 'General',
    id: prayer?.id,
  };
}

function cycleKey(scope, id) {
  return `${CYCLE_KEY_PREFIX}:${scope}:${id}`;
}

function getAndBumpCycle(scope, id, listLength) {
  const key = cycleKey(scope, id);
  const raw = localStorage.getItem(key);
  let index = raw ? Number.parseInt(raw, 10) : 0;

  if (Number.isNaN(index) || index < 0) index = 0;

  const next = listLength ? index % listLength : 0;

  localStorage.setItem(
    key,
    String((index + 1) % Math.max(1, listLength))
  );

  return next;
}

async function pickOrderedByCategory(categoryId) {
  if (!categoryId) return null;

  const requestors = await db.requestors
    .where('categoryId')
    .equals(categoryId)
    .toArray();
  const activeRequestors = requestors.filter(
    (requestor) => !Boolean(requestor.archived)
  );
  const requestorIds = activeRequestors.map((requestor) => requestor.id);

  if (!requestorIds.length) return null;

  const prayers = await db.prayers
    .where('requestorId')
    .anyOf(requestorIds)
    .and((prayer) => prayer.status === 'requested')
    .toArray();

  if (!prayers.length) return null;

  const index = getAndBumpCycle('category', categoryId, prayers.length);
  const prayer = prayers[index];
  const requestor = activeRequestors.find(
    (item) => item.id === prayer.requestorId
  );
  const category = await db.categories.get(categoryId);

  return {
    title: prayer?.name || 'Prayer request',
    requestor: requestor?.name || 'Someone',
    category: category?.name || 'General',
    id: prayer?.id,
  };
}

async function pickOrderedByRequestor(requestorId) {
  if (!requestorId) return null;

  const requestor = await db.requestors.get(requestorId);

  if (!requestor || Boolean(requestor.archived)) return null;

  const prayers = await db.prayers
    .where('requestorId')
    .equals(requestorId)
    .and((prayer) => prayer.status === 'requested')
    .toArray();

  if (!prayers.length) return null;

  const index = getAndBumpCycle(
    'requestor',
    requestorId,
    prayers.length
  );
  const prayer = prayers[index];
  const category = requestor.categoryId
    ? await db.categories.get(requestor.categoryId)
    : null;

  return {
    title: prayer?.name || 'Prayer request',
    requestor: requestor?.name || 'Someone',
    category: category?.name || 'General',
    id: prayer?.id,
  };
}

async function buildPayload(config) {
  const mode = config?.mode || 'simple';

  if (mode === 'random') {
    const selection = await pickRandomPrayer();

    if (!selection) {
      return {
        title: 'Closet Prayer',
        body: 'Remember to pray.',
        hash: '#daily',
      };
    }

    return {
      title: 'Closet Prayer — Random',
      body: `Pray for ${selection.requestor}: ${selection.title} (${selection.category})`,
      hash: '#single',
    };
  }

  if (mode === 'ordered-category' && config?.categoryId) {
    const selection = await pickOrderedByCategory(config.categoryId);

    if (!selection) {
      return {
        title: 'Closet Prayer',
        body: 'Remember to pray.',
        hash: '#daily',
      };
    }

    return {
      title: 'Closet Prayer — Focused',
      body: `Category • ${selection.category}: ${selection.requestor} — ${selection.title}`,
      hash: '#daily',
    };
  }

  if (mode === 'ordered-requestor' && config?.requestorId) {
    const selection = await pickOrderedByRequestor(config.requestorId);

    if (!selection) {
      return {
        title: 'Closet Prayer',
        body: 'Remember to pray.',
        hash: '#daily',
      };
    }

    return {
      title: 'Closet Prayer — Focused',
      body: `Requestor • ${selection.requestor}: ${selection.title}`,
      hash: '#daily',
    };
  }

  return {
    title: 'Closet Prayer',
    body: 'Remember to pray.',
    hash: '#daily',
  };
}

// ---------- scheduling ----------
let inAppTimers = [];

function clearInAppTimers() {
  inAppTimers.forEach((timerId) => clearTimeout(timerId));
  inAppTimers = [];
}

export async function clearScheduledNotifications() {
  clearInAppTimers();

  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({});

    notifications.forEach((notification) => {
      if (
        notification.tag &&
        String(notification.tag).startsWith(SCHEDULE_TAG_PREFIX)
      ) {
        notification.close();
      }
    });
  } catch (error) {
    console.warn('clearScheduledNotifications warning', error);
  }
}

export async function scheduleNotifications(config) {
  await ensurePermission();
  await clearScheduledNotifications();

  const timestamps = buildUpcomingSchedule(config, {
    horizonDays: 14,
    maxOccurrences: 64,
  });
  let useTriggers = supportsTriggers();

  if (useTriggers) {
    try {
      const registration = await navigator.serviceWorker.ready;

      for (const timestamp of timestamps) {
        const payload = await buildPayload(config);
        const tag = `${SCHEDULE_TAG_PREFIX}${timestamp}`;

        await registration.showNotification(payload.title, {
          body: payload.body,
          tag,
          // @ts-ignore - experimental
          showTrigger: new TimestampTrigger(timestamp),
          data: { hash: payload.hash, timestamp },
        });
      }
    } catch (error) {
      console.warn(
        'showNotification(showTrigger) failed; falling back to in-app timers',
        error
      );
      useTriggers = false;
    }
  }

  if (!useTriggers) {
    for (const timestamp of timestamps) {
      const delay = Math.max(0, timestamp - Date.now());
      const timerId = setTimeout(async () => {
        try {
          const payload = await buildPayload(config);

          new Notification(payload.title, {
            body: payload.body,
            tag: `${SCHEDULE_TAG_PREFIX}${timestamp}`,
          });
        } catch {
          // A failed occurrence should not stop later scheduled reminders.
        }
      }, delay);

      inAppTimers.push(timerId);
    }
  }
}

// ---------- ICS export ----------
function pad(value) {
  return value < 10 ? `0${value}` : String(value);
}

function toICSDateUTC(date) {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

function nextOccurrenceForInterval(config) {
  let intervalMinutes = Number.parseInt(
    config?.intervalMinutes || 60,
    10
  );

  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5) {
    intervalMinutes = 5;
  }

  const next = new Date(Date.now() + intervalMinutes * MIN);
  next.setSeconds(0, 0);
  return next;
}

function byDayList(daysOfWeek) {
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length !== 7) return null;

  const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const selectedDays = [];

  for (let index = 0; index < 7; index += 1) {
    if (daysOfWeek[index]) selectedDays.push(dayNames[index]);
  }

  return selectedDays.length && selectedDays.length < 7
    ? selectedDays
    : null;
}

export function buildICS(config, horizonDays = 60) {
  const scheduleType = config?.scheduleType || 'fixed-times';

  if (scheduleType === 'interval') {
    let intervalMinutes = Number.parseInt(
      config?.intervalMinutes || 60,
      10
    );

    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5) {
      intervalMinutes = 5;
    }

    const selectedDays = byDayList(config?.daysOfWeek);
    const frequency =
      intervalMinutes % 60 === 0 ? 'HOURLY' : 'MINUTELY';
    const intervalValue =
      frequency === 'HOURLY'
        ? Math.max(1, Math.floor(intervalMinutes / 60))
        : intervalMinutes;
    const start = nextOccurrenceForInterval(config);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ClosetPrayer//Notifications//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${SCHEDULE_TAG_PREFIX}interval@closetprayer.com`,
      `DTSTAMP:${toICSDateUTC(new Date())}`,
      `DTSTART:${toICSDateUTC(start)}`,
      'SUMMARY:Pray',
      'DESCRIPTION:Open Closet Prayer to see details or pick a request.',
      `RRULE:FREQ=${frequency};INTERVAL=${intervalValue}${
        selectedDays ? `;BYDAY=${selectedDays.join(',')}` : ''
      }`,
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    return lines.join('\r\n');
  }

  const timestamps = buildUpcomingSchedule(config, {
    horizonDays,
    maxOccurrences: 256,
  });
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ClosetPrayer//Notifications//EN',
    'CALSCALE:GREGORIAN',
  ];
  const summary =
    config.mode === 'simple'
      ? 'Remember to pray'
      : config.mode === 'random'
        ? 'Pray (random request)'
        : config.mode === 'ordered-category'
          ? 'Pray (focused category)'
          : config.mode === 'ordered-requestor'
            ? 'Pray (focused requestor)'
            : 'Pray';

  for (const timestamp of timestamps) {
    const date = new Date(timestamp);
    const uid = `${SCHEDULE_TAG_PREFIX}${timestamp}@closetprayer.com`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${toICSDateUTC(new Date())}`);
    lines.push(`DTSTART:${toICSDateUTC(date)}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(
      'DESCRIPTION:Open Closet Prayer to see details or pick a request.'
    );
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(
  icsText,
  fileName = 'closet-prayer-reminders.ics'
) {
  const blob = new Blob([icsText], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 0);
}
