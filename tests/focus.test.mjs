import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusPrayers } from '../src/utils/focusPrayers.js';
const categories = [{ id: 1, name: 'Family', showSingle: 1 }, { id: 2, name: 'Church', showSingle: 0 }];
const requestors = [{ id: 1, name: 'Alex', categoryId: 1 }, { id: 2, name: 'Sam', categoryId: 2 }, { id: 3, categoryId: 1, archived: 1 }];
test('Focus resolves each prayer to its requestor and category without mutating saved records', () => {
  const prayer = { id: 1, requestorId: 1, name: 'Recovery', status: 'requested' };
  assert.deepEqual(focusPrayers(categories, requestors, [prayer])[0], { ...prayer, requestorName: 'Alex', categoryName: 'Family' });
  assert.equal(prayer.requestorName, undefined);
  const moved = [{ ...requestors[0], categoryId: 2 }];
  assert.equal(focusPrayers(categories, moved, [prayer]).length, 0);
  assert.equal(focusPrayers([{ ...categories[1], showSingle: 1 }], moved, [prayer])[0].categoryName, 'Church');
  assert.equal(focusPrayers(categories, [{ ...requestors[0], name: 'Renamed' }], [prayer])[0].requestorName, 'Renamed');
});
test('Focus preserves archived, answered, missing relation, and legacy eligibility rules', () => {
  const prayers = [{ id: 1, requestorId: 1, status: 'requested', answeredAt: '2026-01-01' },
    { id: 2, requestorId: 1, status: 'answered' }, { id: 3, requestorId: 2, status: 'requested' },
    { id: 4, requestorId: 3, status: 'requested' }, { id: 5, requestorId: 50, status: 'requested' },
    { id: 6, requestorId: 1 }, { id: 7, requestorId: 1, answeredAt: '2026-01-01' }];
  assert.deepEqual(focusPrayers(categories, requestors, prayers).map(prayer => prayer.id), [1, 6]);
  assert.deepEqual(focusPrayers([], requestors, prayers), []);
});
