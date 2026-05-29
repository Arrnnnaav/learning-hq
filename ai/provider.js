'use strict';
const fs = require('fs');

function loadEnv(envPath = '.env') {
  try {
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* ignore unreadable .env */ }
}

function getConfig(env = process.env) {
  return { baseUrl: env.AI_BASE_URL || '', apiKey: env.AI_API_KEY || '', model: env.AI_MODEL || '' };
}

function isEnabled(cfg = getConfig()) {
  return !!(cfg.baseUrl && cfg.model);
}

async function chat(messages, { json = false } = {}, cfg = getConfig(), fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const body = { model: cfg.model, messages, temperature: 0.2 };
    if (json) body.response_format = { type: 'json_object' };
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
  } catch (e) {
    throw new Error(`AI request failed: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { loadEnv, getConfig, isEnabled, chat };
