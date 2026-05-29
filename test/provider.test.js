'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { getConfig, isEnabled, chat, loadEnv } = require('../ai/provider');

test('isEnabled requires baseUrl + model', () => {
  assert.strictEqual(isEnabled({ baseUrl: 'x', model: 'm' }), true);
  assert.strictEqual(isEnabled({ baseUrl: '', model: 'm' }), false);
  assert.strictEqual(isEnabled({ baseUrl: 'x', model: '' }), false);
});

test('getConfig maps env', () => {
  assert.deepStrictEqual(
    getConfig({ AI_BASE_URL: 'b', AI_API_KEY: 'k', AI_MODEL: 'm' }),
    { baseUrl: 'b', apiKey: 'k', model: 'm' }
  );
});

test('getConfig strips trailing slash from baseUrl', () => {
  assert.strictEqual(getConfig({ AI_BASE_URL: 'http://h/v1/' }).baseUrl, 'http://h/v1');
  assert.strictEqual(getConfig({ AI_BASE_URL: 'http://h/v1' }).baseUrl, 'http://h/v1');
});

test('loadEnv parses file, ignores comments, does not override preset vars', () => {
  const p = path.join(__dirname, '_env_fixture');
  fs.writeFileSync(p, '# a comment\nAI_MODEL="abc"\nFOO=bar\n');
  delete process.env.AI_MODEL;
  process.env.FOO = 'preset';
  loadEnv(p);
  assert.strictEqual(process.env.AI_MODEL, 'abc');
  assert.strictEqual(process.env.FOO, 'preset');
  fs.unlinkSync(p);
  delete process.env.AI_MODEL;
  delete process.env.FOO;
});

test('chat posts to baseUrl, returns content, adds auth + json format', async () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'hi' } }] }) };
  };
  const out = await chat(
    [{ role: 'user', content: 'x' }], { json: true },
    { baseUrl: 'http://h/v1', apiKey: 'k', model: 'm' }, fakeFetch
  );
  assert.strictEqual(out, 'hi');
  assert.strictEqual(captured.url, 'http://h/v1/chat/completions');
  assert.strictEqual(captured.opts.headers.Authorization, 'Bearer k');
  assert.strictEqual(JSON.parse(captured.opts.body).response_format.type, 'json_object');
});

test('chat omits auth without key and throws on non-2xx', async () => {
  let captured;
  const okFetch = async (u, o) => { captured = { o }; return { ok: true, json: async () => ({ choices: [{ message: { content: 'y' } }] }) }; };
  await chat([{ role: 'user', content: 'x' }], {}, { baseUrl: 'http://h/v1', apiKey: '', model: 'm' }, okFetch);
  assert.strictEqual(captured.o.headers.Authorization, undefined);
  const badFetch = async () => ({ ok: false, status: 500 });
  await assert.rejects(
    () => chat([{ role: 'user', content: 'x' }], {}, { baseUrl: 'http://h/v1', model: 'm' }, badFetch),
    /AI request failed/
  );
});
