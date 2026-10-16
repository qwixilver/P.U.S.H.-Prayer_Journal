// Shared by scheduled reminders, fallback timers, and the Settings test button.
export const NOTIFICATION_ICON = '/assets/icons/icon-192x192.png';
export const NOTIFICATION_BADGE = '/assets/icons/notification-badge.png';

export function notificationOptions({ body, hash = '#daily', timestamp = Date.now(), tag = 'cp:reminder' }) {
  return { body, icon: NOTIFICATION_ICON, badge: NOTIFICATION_BADGE, tag,
    timestamp, data: { hash, timestamp }, lang: 'en' };
}
