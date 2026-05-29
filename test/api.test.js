'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const FIX = path.join(__dirname, 'fixtures', 'plan.json');
const TMP = path.join(__dirname, 'fixtures', '_work.json');
process.env.PLAN_FILE = TMP;
const app = require('../server');

let server, port;
beforeEach(() => { fs.copyFileSync(FIX, TMP); });
after(() => { server && server.close(); fs.existsSync(TMP) && fs.unlinkSync(TMP); });
before(async () => { await start(); });

function start() {
  return new Promise(r => { server = app.listen(0, () => { port = server.address().port; r(); }); });
}
function api(method, p, body) {
  return fetch(`http://localhost:${port}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('GET /api/plan returns phases with links + counts', async () => {
  const data = await (await api('GET', '/api/plan')).json();
  const p1 = data.phases.find(p => p.id === 'p1');
  assert.ok(p1);
  assert.strictEqual(p1.total, 1);
  assert.strictEqual(p1.done, 0);
  assert.deepStrictEqual(p1.concepts, ['x']);
});

test('PATCH toggles done and persists', async () => {
  const res = await api('PATCH', '/api/links/L1', { done: true });
  assert.strictEqual(res.status, 200);
  const data = await (await api('GET', '/api/plan')).json();
  assert.strictEqual(data.phases.find(p => p.id === 'p1').done, 1);
});

test('PATCH rejects bad priority and bad phase', async () => {
  assert.strictEqual((await api('PATCH', '/api/links/L1', { priority: 'Urgent' })).status, 400);
  assert.strictEqual((await api('PATCH', '/api/links/L1', { phase: 'nope' })).status, 400);
});

test('PATCH unknown id is 404', async () => {
  assert.strictEqual((await api('PATCH', '/api/links/L999', { done: true })).status, 404);
});

test('DELETE removes a link', async () => {
  assert.strictEqual((await api('DELETE', '/api/links/L1')).status, 200);
  const data = await (await api('GET', '/api/plan')).json();
  assert.strictEqual(data.phases.find(p => p.id === 'p1').total, 0);
});

test('POST duplicate url is 409', async () => {
  assert.strictEqual((await api('POST', '/api/links', { url: 'https://example.com/a' })).status, 409);
});

test('GET /api/doc returns markdown when link has a doc + file exists', async () => {
  const dir = path.join(__dirname, 'fixtures', 'study');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'L1.md'), '# Hello\n\nbody');
  const plan = JSON.parse(fs.readFileSync(TMP, 'utf8'));
  plan.links.find(l => l.id === 'L1').doc = 'study/L1.md';
  fs.writeFileSync(TMP, JSON.stringify(plan));
  const r = await api('GET', '/api/doc/L1');
  assert.strictEqual(r.status, 200);
  const d = await r.json();
  assert.match(d.markdown, /# Hello/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('GET /api/doc 404 when link has no doc', async () => {
  assert.strictEqual((await api('GET', '/api/doc/L1')).status, 404);
});

test('GET /api/doc 404 for unknown id', async () => {
  assert.strictEqual((await api('GET', '/api/doc/L999')).status, 404);
});

test('GET /api/doc 400 on path traversal', async () => {
  const plan = JSON.parse(fs.readFileSync(TMP, 'utf8'));
  plan.links.find(l => l.id === 'L1').doc = '../../secret.md';
  fs.writeFileSync(TMP, JSON.stringify(plan));
  assert.strictEqual((await api('GET', '/api/doc/L1')).status, 400);
});
