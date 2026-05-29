'use strict';

const VALID_PRIORITY = new Set(['Now', 'Soon', 'Someday']);
const VALID_CATEGORY = new Set(['github','paper','blog','youtube_video','huggingface','tool','model','docs','pdf']);

function parseJSON(text) {
  try { return JSON.parse(text); }
  catch {
    const m = typeof text === 'string' && text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
    throw new Error('AI returned invalid JSON');
  }
}

async function sortInbox(plan, chat) {
  const phases = plan.phases.filter(p => p.id !== 'inbox')
    .map(p => ({ id: p.id, name: p.name, summary: p.summary || '' }));
  const inbox = plan.links.filter(l => l.phase === 'inbox')
    .map(l => ({ id: l.id, title: l.title, description: l.description || '', url: l.url }));
  if (!inbox.length) return { assignments: [], skipped: [] };

  const messages = [
    { role: 'system', content: 'You sort learning resources into phases. Reply ONLY with JSON of the form {"assignments":[{"id":"L..","phase":"phaseId","priority":"Now|Soon|Someday"}]}. Use only the provided phase ids.' },
    { role: 'user', content: `Phases:\n${JSON.stringify(phases)}\n\nInbox links to assign:\n${JSON.stringify(inbox)}` },
  ];
  const data = parseJSON(await chat(messages, { json: true }));
  const list = Array.isArray(data.assignments) ? data.assignments : [];

  const phaseIds = new Set(phases.map(p => p.id));
  const inboxIds = new Set(inbox.map(l => l.id));
  const assignments = [], skipped = [];
  for (const a of list) {
    if (a && inboxIds.has(a.id) && phaseIds.has(a.phase) && VALID_PRIORITY.has(a.priority)) {
      assignments.push({ id: a.id, phase: a.phase, priority: a.priority });
    } else if (a && a.id) {
      skipped.push(a.id);
    }
  }
  return { assignments, skipped };
}

async function enrichLink(link, chat) {
  const messages = [
    { role: 'system', content: 'Improve a learning resource\'s metadata. Reply ONLY with JSON {"title":"..","description":"..","category":".."}. category must be one of: github, paper, blog, youtube_video, huggingface, tool, model, docs, pdf.' },
    { role: 'user', content: JSON.stringify({ url: link.url, title: link.title, description: link.description || '' }) },
  ];
  const data = parseJSON(await chat(messages, { json: true }));
  return {
    title: (typeof data.title === 'string' && data.title.trim()) ? data.title.trim().slice(0, 120) : link.title,
    description: (typeof data.description === 'string') ? data.description.trim().slice(0, 300) : (link.description || ''),
    category: VALID_CATEGORY.has(data.category) ? data.category : link.category,
  };
}

module.exports = { sortInbox, enrichLink };
