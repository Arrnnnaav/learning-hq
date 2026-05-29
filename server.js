'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const { readPlan, writePlan, nextLinkId, enrichUrl, buildPhasesView } = require('./lib/plan');

const app = express();
const PORT = process.env.PORT || 3000;
const PLAN_FILE = process.env.PLAN_FILE || path.join(__dirname, 'plan.json');
const STARTER = path.join(__dirname, 'plans', 'starter-ai-ml.json');
const VALID_PRIORITY = new Set(['Now', 'Soon', 'Someday']);

if (!fs.existsSync(PLAN_FILE) && fs.existsSync(STARTER)) {
  fs.copyFileSync(STARTER, PLAN_FILE);
  console.log(`No plan found — seeded ${PLAN_FILE} from starter-ai-ml.json`);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/plan', (req, res) => {
  res.json({ phases: buildPhasesView(readPlan(PLAN_FILE)) });
});

app.post('/api/links', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  if (!String(url).startsWith('http')) return res.status(400).json({ error: 'url must start with http' });
  const plan = readPlan(PLAN_FILE);
  if (plan.links.find(l => l.url === url)) return res.status(409).json({ error: 'duplicate' });
  const enriched = await enrichUrl(url);
  const inboxOrders = plan.links.filter(l => l.phase === 'inbox').map(l => l.order ?? 0);
  const order = inboxOrders.length ? Math.max(...inboxOrders) + 1 : 0;
  const link = {
    id: nextLinkId(plan), url,
    title: enriched.title, description: enriched.description, category: enriched.category,
    phase: 'inbox', priority: 'Soon', done: false, order,
  };
  plan.links.push(link);
  writePlan(PLAN_FILE, plan);
  res.json({ ok: true, link });
});

app.patch('/api/links/:id', (req, res) => {
  const plan = readPlan(PLAN_FILE);
  const link = plan.links.find(l => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: 'not found' });
  const { phase, priority, done, order, title, description, category } = req.body || {};
  if (priority !== undefined && !VALID_PRIORITY.has(priority)) return res.status(400).json({ error: 'bad priority' });
  if (phase !== undefined && !plan.phases.find(p => p.id === phase)) return res.status(400).json({ error: 'bad phase' });
  if (phase !== undefined) link.phase = phase;
  if (priority !== undefined) link.priority = priority;
  if (done !== undefined) link.done = !!done;
  if (order !== undefined) link.order = order;
  if (title !== undefined) link.title = title;
  if (description !== undefined) link.description = description;
  if (category !== undefined) link.category = category;
  writePlan(PLAN_FILE, plan);
  res.json({ ok: true, link });
});

app.delete('/api/links/:id', (req, res) => {
  const plan = readPlan(PLAN_FILE);
  const i = plan.links.findIndex(l => l.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'not found' });
  const [removed] = plan.links.splice(i, 1);
  writePlan(PLAN_FILE, plan);
  res.json({ ok: true, removed });
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);
  const plan = readPlan(PLAN_FILE);
  res.json(plan.links.filter(l =>
    (l.title || '').toLowerCase().includes(q) ||
    (l.description || '').toLowerCase().includes(q) ||
    (l.category || '').toLowerCase().includes(q) ||
    (l.priority || '').toLowerCase().includes(q)
  ).slice(0, 20));
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Learning HQ running at http://localhost:${PORT}`));
}
module.exports = app;
