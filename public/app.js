const state = { phases: [], activePhaseId: null };
const $ = id => document.getElementById(id);
let overviewLastFocus = null;

const PRIORITIES = ['Now', 'Soon', 'Someday'];

async function boot() {
  $('loading').classList.remove('hidden');
  try {
    await loadPlan();
    const current = state.phases.find(p => p.id !== 'inbox' && p.total > 0 && p.done < p.total)
      || state.phases.find(p => p.total > 0) || state.phases[0];
    if (current) selectPhase(current.id);
    wireEvents();
  } finally {
    $('loading').classList.add('hidden');
  }
}

async function loadPlan() {
  state.phases = (await fetch('/api/plan').then(r => r.json())).phases || [];
}

function wireEvents() {
  $('search-trigger').addEventListener('click', openSearch);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') { closeSearch(); closeOverview(); }
  });
  $('search-overlay').addEventListener('click', e => { if (e.target === $('search-overlay')) closeSearch(); });
  $('search-input').addEventListener('input', e => runSearch(e.target.value));
  $('add-url-btn').addEventListener('click', handleAddLink);
  $('add-url-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleAddLink(); });
  $('overview-btn').addEventListener('click', openOverview);
  $('overview-close').addEventListener('click', closeOverview);
  $('overview-overlay').addEventListener('click', e => { if (e.target === $('overview-overlay')) closeOverview(); });
  $('overview-overlay').addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = $('overview-overlay').querySelectorAll('button');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

function catClass(c) {
  const known = ['github','paper','blog','youtube_video','huggingface','tool','model','docs','pdf'];
  return known.includes(c) ? `cat-${c}` : 'cat-default';
}
function domain(url) { try { return new URL(url).hostname.replace('www.',''); } catch { return ''; } }
function calcProgress(p) { return p.total === 0 ? 0 : Math.round(p.done / p.total * 100); }
function phaseById(id) { return state.phases.find(p => p.id === id); }

function renderKanban() {
  const scroll = $('kanban-scroll'); scroll.innerHTML = '';
  state.phases.forEach(phase => {
    const pct = calcProgress(phase);
    const isDone = phase.total > 0 && phase.done === phase.total;
    const isActive = phase.id === state.activePhaseId;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `phase-card${isDone ? ' done' : ''}${isActive ? ' active' : ''}`;
    card.setAttribute('aria-pressed', isActive);
    const statusTxt = isDone ? '<span class="phase-status done">✓ Done</span>' : '';
    card.innerHTML = `
      <div class="phase-card-top"><span class="phase-card-id">${phase.name}</span>${statusTxt}</div>
      <div class="phase-progress-bar"><div class="phase-progress-fill" style="width:${pct}%"></div></div>
      <div class="phase-count">${isDone ? '✓ complete' : `${phase.done} / ${phase.total}`}</div>`;
    card.addEventListener('click', () => selectPhase(phase.id));
    scroll.appendChild(card);
  });
}

function selectPhase(id) {
  state.activePhaseId = id;
  renderKanban();
  const phase = phaseById(id);
  if (!phase) return;
  $('phase-title').textContent = phase.name;
  updateOverviewButton(phase);
  renderLinkList(phase);
}

function renderLinkList(phase) {
  const list = $('link-list'); list.innerHTML = '';

  const next = phase.id !== 'inbox' ? phase.links.find(l => !l.done) : null;
  const banner = $('read-next-banner');
  if (next) {
    banner.classList.remove('hidden');
    $('read-next-title').textContent = next.title;
    $('read-next-meta').textContent = `${domain(next.url)} · ${next.category}`;
    $('read-next-open').onclick = () => window.open(next.url, '_blank');
    $('read-next-done').onclick = () => patchLink(next.id, { done: true });
  } else {
    banner.classList.add('hidden');
  }

  const phaseOpts = state.phases.map(p =>
    `<option value="${p.id}"${p.id === phase.id ? ' selected' : ''}>${p.name}</option>`).join('');

  phase.links.forEach(link => {
    const card = document.createElement('div');
    card.className = `link-card${link.done ? ' done-card' : ''}`;
    const prioOpts = PRIORITIES.map(pr =>
      `<option value="${pr}"${pr === link.priority ? ' selected' : ''}>${pr}</option>`).join('');
    card.innerHTML = `
      <span class="link-category ${catClass(link.category)}">${link.category || 'link'}</span>
      <div class="link-body">
        <div class="link-title" title="${link.title}"><span class="link-id">${link.id}</span>${link.title}</div>
        ${link.description ? `<div class="link-desc">${link.description}</div>` : ''}
        <div class="link-meta">${domain(link.url)}</div>
      </div>
      <div class="link-actions">
        <div class="lc-controls">
          <select class="lc-select sel-phase" aria-label="Phase">${phaseOpts}</select>
          <select class="lc-select sel-prio" aria-label="Priority">${prioOpts}</select>
        </div>
        <div class="link-btns">
          <button class="btn-open">Open →</button>
          <button class="btn-done${link.done ? ' done-btn' : ''}">${link.done ? '✓ Done' : 'Done'}</button>
          <button class="btn-del" aria-label="Delete link">✕</button>
        </div>
      </div>`;
    card.querySelector('.btn-open').addEventListener('click', () => window.open(link.url, '_blank'));
    card.querySelector('.btn-done').addEventListener('click', () => patchLink(link.id, { done: !link.done }));
    card.querySelector('.btn-del').addEventListener('click', () => { if (confirm(`Delete "${link.title}"?`)) deleteLink(link.id); });
    card.querySelector('.sel-phase').addEventListener('change', e => patchLink(link.id, { phase: e.target.value }));
    card.querySelector('.sel-prio').addEventListener('change', e => patchLink(link.id, { priority: e.target.value }));
    list.appendChild(card);
  });

  if (!phase.links.length) {
    list.innerHTML = '<div class="link-meta" style="padding:20px">No links in this phase yet. Paste a URL above to add one.</div>';
  }
}

async function patchLink(id, body) {
  await fetch(`/api/links/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await refresh();
}
async function deleteLink(id) {
  await fetch(`/api/links/${id}`, { method: 'DELETE' });
  await refresh();
}
async function refresh() {
  await loadPlan();
  renderKanban();
  const phase = phaseById(state.activePhaseId) || state.phases[0];
  if (phase) { state.activePhaseId = phase.id; $('phase-title').textContent = phase.name; updateOverviewButton(phase); renderLinkList(phase); }
}

async function handleAddLink() {
  const url = $('add-url-input').value.trim();
  if (!url) return;
  if (!url.startsWith('http')) { alert('Enter a full URL starting with http'); return; }
  const res = await fetch('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  if (res.status === 409) { alert('Already in your plan.'); return; }
  if (!res.ok) { alert('Could not add that URL.'); return; }
  $('add-url-input').value = '';
  state.activePhaseId = 'inbox';
  await refresh();
}

function hasOverview(phase) {
  return !!(phase && (phase.summary || phase.goal || phase.milestone || (phase.concepts && phase.concepts.length)));
}
function updateOverviewButton(phase) {
  $('overview-btn').classList.toggle('hidden', !hasOverview(phase));
}
function openOverview() {
  const phase = phaseById(state.activePhaseId);
  if (!phase || !hasOverview(phase)) return;
  renderOverview(phase);
  overviewLastFocus = document.activeElement;
  $('overview-overlay').classList.remove('hidden');
  $('overview-close').focus();
}
function closeOverview() {
  const wasOpen = !$('overview-overlay').classList.contains('hidden');
  $('overview-overlay').classList.add('hidden');
  if (wasOpen && overviewLastFocus) overviewLastFocus.focus();
}
function renderOverview(phase) {
  $('overview-name').textContent = phase.name;
  const sum = $('overview-summary'); sum.textContent = phase.summary || ''; sum.classList.toggle('hidden', !phase.summary);
  const goal = $('overview-goal'); goal.innerHTML = phase.goal ? `🎯 <strong>Goal:</strong> ${phase.goal}` : ''; goal.classList.toggle('hidden', !phase.goal);
  const ms = $('overview-milestone'); ms.innerHTML = phase.milestone ? `🏁 <strong>Milestone:</strong> ${phase.milestone}` : ''; ms.classList.toggle('hidden', !phase.milestone);
  const wrap = $('overview-concepts-wrap'); const box = $('overview-concepts'); box.innerHTML = '';
  const concepts = phase.concepts || [];
  concepts.forEach(c => { const s = document.createElement('span'); s.className = 'concept-chip'; s.textContent = c; box.appendChild(s); });
  wrap.classList.toggle('hidden', concepts.length === 0);
}

function openSearch() { $('search-overlay').classList.remove('hidden'); $('search-input').value = ''; $('search-results').innerHTML = ''; $('search-empty').classList.add('hidden'); $('search-input').focus(); }
function closeSearch() { $('search-overlay').classList.add('hidden'); }
function runSearch(q) {
  const results = $('search-results'); const empty = $('search-empty'); results.innerHTML = '';
  if (!q.trim()) { empty.classList.add('hidden'); return; }
  const ql = q.toLowerCase();
  const all = state.phases.flatMap(p => p.links.map(l => ({ ...l, phaseName: p.name })));
  const matches = all.filter(l =>
    (l.title||'').toLowerCase().includes(ql) || (l.description||'').toLowerCase().includes(ql) ||
    (l.category||'').toLowerCase().includes(ql) || (l.priority||'').toLowerCase().includes(ql)
  ).slice(0, 15);
  if (!matches.length) {
    empty.classList.remove('hidden');
    $('search-add-btn').onclick = () => { closeSearch(); $('add-url-input').value = q; $('add-url-input').focus(); };
    return;
  }
  empty.classList.add('hidden');
  matches.forEach(link => {
    const row = document.createElement('div');
    row.className = 'search-result';
    row.innerHTML = `<span class="link-category ${catClass(link.category)}" style="font-size:9px">${link.category}</span>
      <span class="search-result-title">${link.id} — ${link.title}</span>
      <span class="search-result-phase">${link.phaseName}</span>`;
    row.addEventListener('click', () => { closeSearch(); selectPhase(link.phase); });
    results.appendChild(row);
  });
}

document.addEventListener('DOMContentLoaded', boot);
