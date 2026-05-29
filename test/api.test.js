'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

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

let llm;
function startLLM(content) {
  return new Promise(resolve => {
    llm = http.createServer((req, res) => {
      let b = '';
      req.on('data', c => (b += c));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    });
    llm.listen(0, () => resolve(llm.address().port));
  });
}

test('GET /api/ai/status is disabled without config', async () => {
  delete process.env.AI_BASE_URL; delete process.env.AI_MODEL;
  const d = await (await api('GET', '/api/ai/status')).json();
  assert.strictEqual(d.enabled, false);
});

test('POST /api/ai/sort 503 when disabled', async () => {
  delete process.env.AI_BASE_URL; delete process.env.AI_MODEL;
  assert.strictEqual((await api('POST', '/api/ai/sort')).status, 503);
});

test('POST /api/ai/sort assigns inbox links when enabled', async () => {
  const plan = JSON.parse(fs.readFileSync(TMP, 'utf8'));
  plan.links.push({ id: 'L9', url: 'u', title: 't', description: '', category: 'blog', phase: 'inbox', priority: 'Soon', done: false, order: 0 });
  fs.writeFileSync(TMP, JSON.stringify(plan));
  const port = await startLLM(JSON.stringify({ assignments: [{ id: 'L9', phase: 'p1', priority: 'Now' }] }));
  process.env.AI_BASE_URL = `http://localhost:${port}/v1`;
  process.env.AI_MODEL = 'test';
  const r = await api('POST', '/api/ai/sort');
  assert.strictEqual(r.status, 200);
  const after = JSON.parse(fs.readFileSync(TMP, 'utf8'));
  assert.strictEqual(after.links.find(l => l.id === 'L9').phase, 'p1');
  assert.strictEqual(after.links.find(l => l.id === 'L9').priority, 'Now');
  llm.close();
  delete process.env.AI_BASE_URL; delete process.env.AI_MODEL;
});

test('POST /api/ai/enrich/:id updates a link when enabled', async () => {
  const port = await startLLM(JSON.stringify({ title: 'Better', description: 'Better desc', category: 'github' }));
  process.env.AI_BASE_URL = `http://localhost:${port}/v1`;
  process.env.AI_MODEL = 'test';
  const r = await api('POST', '/api/ai/enrich/L1');
  assert.strictEqual(r.status, 200);
  const after = JSON.parse(fs.readFileSync(TMP, 'utf8'));
  assert.strictEqual(after.links.find(l => l.id === 'L1').title, 'Better');
  llm.close();
  delete process.env.AI_BASE_URL; delete process.env.AI_MODEL;
});
