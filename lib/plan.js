'use strict';
const fs = require('fs');

function readPlan(planPath) {
  try {
    const p = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    return {
      meta: p.meta || { title: 'My Learning Plan', version: 1 },
      phases: Array.isArray(p.phases) ? p.phases : [],
      links: Array.isArray(p.links) ? p.links : [],
    };
  } catch {
    return { meta: { title: 'My Learning Plan', version: 1 }, phases: [], links: [] };
  }
}

function writePlan(planPath, plan) {
  const tmp = planPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(plan, null, 2));
  fs.renameSync(tmp, planPath);
}

function nextLinkId(plan) {
  let max = 0;
  for (const l of (plan.links || [])) {
    const n = parseInt(String(l.id).replace(/^L/, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return 'L' + (max + 1);
}

function guessCategory(url) {
  if (url.includes('github.com')) return 'github';
  if (url.includes('arxiv.org')) return 'paper';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube_video';
  if (url.includes('huggingface.co')) return 'huggingface';
  return 'blog';
}

async function enrichUrl(url, fetchImpl = fetch) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LearningHQ/1.0)' },
    });
    const html = await res.text();
    clearTimeout(timer);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    return {
      title: titleMatch ? titleMatch[1].trim().slice(0, 120) : url,
      description: descMatch ? descMatch[1].trim().slice(0, 200) : '',
      category: guessCategory(url),
    };
  } catch {
    return { title: url, description: '', category: guessCategory(url) };
  }
}

function buildPhasesView(plan) {
  return (plan.phases || []).map(phase => {
    const links = (plan.links || [])
      .filter(l => l.phase === phase.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return {
      id: phase.id,
      name: phase.name || phase.id,
      summary: phase.summary || '',
      goal: phase.goal || '',
      milestone: phase.milestone || '',
      concepts: Array.isArray(phase.concepts) ? phase.concepts : [],
      links,
      total: links.length,
      done: links.filter(l => l.done).length,
    };
  });
}

module.exports = { readPlan, writePlan, nextLinkId, guessCategory, enrichUrl, buildPhasesView };
