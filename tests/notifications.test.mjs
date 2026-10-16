import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { notificationOptions } from '../src/utils/notificationPresentation.js';

test('all notification options include a same-origin app icon and 96px transparent badge', () => {
  const options = notificationOptions({ body: 'Remember to pray', hash: '#single', timestamp: 123, tag: 'cp:notify:123' });
  assert.equal(options.icon, '/assets/icons/icon-192x192.png');
  assert.equal(options.badge, '/assets/icons/notification-badge.png');
  assert.deepEqual(options.data, { hash: '#single', timestamp: 123 });
  assert.equal(options.tag, 'cp:notify:123');
  const png = readFileSync(new URL('../public' + options.badge, import.meta.url));
  assert.equal(png.readUInt32BE(16), 96); assert.equal(png.readUInt32BE(20), 96); assert.equal(png[25], 6);
});
test('clicking a reminder focuses an app window and sanitizes unsupported destinations', async () => {
  let click;
  const calls = [];
  const self = { registration: { scope: 'https://closetprayer.com/' }, addEventListener: (type, handler) => { click = handler; },
    clients: { matchAll: async () => [{ url: 'https://unrelated.example/', navigate() { throw new Error('Wrong window'); } },
      { url: 'https://closetprayer.com/#settings', navigate: async url => { calls.push(url); return { focus: async () => calls.push('focus') }; } }],
      openWindow: async url => calls.push(url) } };
  vm.runInNewContext(readFileSync(new URL('../public/notification-events.js', import.meta.url), 'utf8'), { self, URL });
  for (const [hash, expected] of [['#single', '#single'], ['https://evil.example/', '#daily']]) {
    let pending;
    click({ notification: { data: { hash }, close: () => calls.push('close') }, waitUntil: promise => { pending = promise; } });
    await pending;
    assert.deepEqual(calls.splice(0), ['close', 'https://closetprayer.com/' + expected, 'focus']);
  }
  self.clients.matchAll = async () => [];
  let pending; click({ notification: { data: {}, close() {} }, waitUntil: promise => { pending = promise; } });
  await pending; assert.equal(calls[0], 'https://closetprayer.com/#daily');
});
