import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTutorialDatabase } from '../src/utils/tutorialDatabase.js';
import { coachPosition, spotlightRect } from '../src/utils/tutorialLayout.js';

test('practice saves and deletes remain in an isolated memory session and reads cannot mutate it', async () => {
  const writes = [], practice = createTutorialDatabase(event => writes.push(event)), other = createTutorialDatabase();
  const records = await practice.requestors.toArray(); records[0].name = 'Changed outside the database';
  assert.equal((await practice.requestors.get(1)).name, 'Alex');
  const id = await practice.prayers.add({ requestorId: 1, name: 'Practice save' });
  await practice.prayers.update(id, { description: 'An update' });
  assert.equal((await practice.prayers.get(id)).description, 'An update');
  assert.equal(await other.prayers.count(), 1);
  assert.equal((await practice.prayers.where('requestorId').equals(1).toArray()).length, 2);
  await practice.transaction('rw', practice.prayers, async () => practice.prayers.where('requestorId').equals(1).delete());
  assert.equal(await practice.prayers.count(), 0);
  assert.equal(await other.prayers.count(), 1);
  assert.deepEqual(writes.map(event => event.operation), ['add', 'update', 'delete']);
  assert.equal(practice.groups, undefined);
});

test('spotlights clip to small and keyboard-sized viewports without creating negative masks', () => {
  const view = { left: 0, top: 0, width: 320, height: 400 };
  assert.deepEqual(spotlightRect({ left: -10, top: -40, right: 350, bottom: 800, width: 360, height: 840 }, view), { left: 0, top: 0, right: 320, bottom: 400, width: 320, height: 400 });
  assert.equal(spotlightRect({ left: 0, top: 500, right: 50, bottom: 550, width: 50, height: 50 }, view), null);
  const button = { left: 270, top: 340, right: 315, bottom: 390 };
  for (const height of [150, 300]) {
    const coach = coachPosition(button, view, height);
    assert.ok(coach.left >= 12 && coach.left + coach.width <= 308);
    assert.ok(coach.top >= 12 && coach.top + height <= 388);
    assert.ok(coach.top + height < button.top);
  }
});
