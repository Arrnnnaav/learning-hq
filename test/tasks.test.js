'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { sortInbox, enrichLink } = require('../ai/tasks');

const plan = {
  phases: [{ id: 'inbox', name: 'Inbox' }, { id: 'p1', name: 'One', summary: '' }, { id: 'p2', name: 'Two' }],
  links: [
    { id: 'L1', phase: 'inbox', title: 'a', url: 'u1' },
    { id: 'L2', phase: 'inbox', title: 'b', url: 'u2' },
    { id: 'L3', phase: 'p1', title: 'c', url: 'u3' },
  ],
};

test('sortInbox keeps valid assignments, skips invalid', async () => {
  const chat = async () => JSON.stringify({ assignments: [
    { id: 'L1', phase: 'p1', priority: 'Now' },
    { id: 'L2', phase: 'nope', priority: 'Now' },
    { id: 'L2', phase: 'p2', priority: 'Urgent' },
  ] });
  const { assignments, skipped } = await sortInbox(plan, chat);
  assert.deepStrictEqual(assignments, [{ id: 'L1', phase: 'p1', priority: 'Now' }]);
  assert.ok(skipped.includes('L2'));
});

test('sortInbox short-circuits empty inbox without calling chat', async () => {
  const p = { phases: plan.phases, links: [{ id: 'L3', phase: 'p1' }] };
  const r = await sortInbox(p, async () => { throw new Error('should not be called'); });
  assert.deepStrictEqual(r, { assignments: [], skipped: [] });
});

test('sortInbox throws on invalid JSON', async () => {
  await assert.rejects(() => sortInbox(plan, async () => 'not json'), /invalid JSON/);
});

test('enrichLink returns parsed fields', async () => {
  const chat = async () => JSON.stringify({ title: 'New Title', description: 'New desc', category: 'github' });
  const out = await enrichLink({ id: 'L1', url: 'u', title: 'old', description: 'd', category: 'blog' }, chat);
  assert.strictEqual(out.title, 'New Title');
  assert.strictEqual(out.description, 'New desc');
  assert.strictEqual(out.category, 'github');
});

test('enrichLink falls back on bad category / missing field', async () => {
  const chat = async () => JSON.stringify({ title: 't', category: 'weird' });
  const out = await enrichLink({ id: 'L1', url: 'u', title: 'old', description: 'keep', category: 'paper' }, chat);
  assert.strictEqual(out.category, 'paper');
  assert.strictEqual(out.description, 'keep');
});
