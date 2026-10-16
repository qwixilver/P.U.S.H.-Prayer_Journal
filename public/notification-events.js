// Only same-origin app views may be opened by a reminder.
self.addEventListener('notificationclick', event => {
  const hash = ['#daily', '#single', '#settings'].includes(event.notification.data?.hash)
    ? event.notification.data.hash : '#daily';
  const target = new URL(hash, self.registration.scope);
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find(client => {
      const url = new URL(client.url);
      return url.origin === target.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
    });
    if (existing) {
      try { const navigated = await existing.navigate(target.href); if (navigated) { await navigated.focus(); return; } }
      catch { /* A closing window can disappear between matching and focusing. */ }
    }
    await self.clients.openWindow(target.href);
  })());
});
