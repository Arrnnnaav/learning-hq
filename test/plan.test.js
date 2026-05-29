'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { nextLinkId, buildPhasesView, guessCategory, enrichUrl } = require('../lib/plan');

test('nextLinkId returns L<max+1>', () => {
  assert.strictEqual(nextLinkId({ links: [{ id: 'L1' }, { id: 'L7' }, { id: 'L3' }] }), 'L8');
  assert.strictEqual(nextLinkId({ links: [] }), 'L1');
});

test('guessCategory maps known hosts', () => {
  assert.strictEqual(guessCategory('https://github.com/x/y'), 'github');
  assert.strictEqual(guessCategory('https://arxiv.org/abs/1'), 'paper');
  assert.strictEqual(guessCategory('https://youtube.com/watch?v=1'), 'youtube_video');
  assert.strictEqual(guessCategory('https://example.com'), 'blog');
});

test('buildPhasesView sorts links by order and counts done', () => {
  const plan = {
    phases: [{ id: 'p1', name: 'One', summary: 's', goal: 'g', milestone: 'm', concepts: ['c'] }],
    links: [
      { id: 'L2', phase: 'p1', order: 1, done: true },
      { id: 'L1', phase: 'p1', order: 0, done: false },
      { id: 'L9', phase: 'other', order: 0, done: true },
    ],
  };
  const view = buildPhasesView(plan);
  assert.strictEqual(view.length, 1);
  assert.deepStrictEqual(view[0].links.map(l => l.id), ['L1', 'L2']);
  assert.strictEqual(view[0].total, 2);
  assert.strictEqual(view[0].done, 1);
  assert.deepStrictEqual(view[0].concepts, ['c']);
  assert.strictEqual(view[0].goal, 'g');
});

test('enrichUrl parses title and description from injected fetch', async () => {
  const fakeFetch = async () => ({
    text: async () => '<html><head><title>My Title</title>'
      + '<meta name="description" content="My Desc"></head></html>',
  });
  const r = await enrichUrl('https://github.com/a/b', fakeFetch);
  assert.strictEqual(r.title, 'My Title');
  assert.strictEqual(r.description, 'My Desc');
  assert.strictEqual(r.category, 'github');
});

test('enrichUrl falls back to url on fetch failure', async () => {
  const r = await enrichUrl('https://x.com', async () => { throw new Error('net'); });
  assert.strictEqual(r.title, 'https://x.com');
  assert.strictEqual(r.description, '');
});
