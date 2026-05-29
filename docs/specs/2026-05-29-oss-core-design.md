# Learning HQ — Open-Source Core (v1) — Design Spec

**Date:** 2026-05-29
**Status:** Approved (design), pending spec review
**Scope:** Sub-project #1 of 4 (Generalize the core app). Projects #2 agent plugin, #3 no-agent AI fallback, #4 distribution follow in their own cycles.

---

## Hard Constraints

- **`D:\tracker` (the author's private, working tracker) is never modified or exposed.** All work happens in a new sibling folder `D:\learning-hq` with its **own fresh git history** — no link to `D:\tracker`'s repo or commits (so no personal data leaks through history).
- v1 is **fully local, free, no API key, no agent.** AI features are out of scope (they are project #2/#3).

---

## Problem

The author built a personal AI/ML learning tracker (`D:\tracker`): an Express + vanilla-JS web app that tracks a curriculum of phases and resource links, with progress, a "Read Next" banner, search, and a phase Overview modal. It is tightly coupled to (a) the author's personal data (`arnav-learning-plan.json` profile + links) and (b) an automation layer that runs inside the author's Claude Code session (doc generation, smart phase assignment). The app code itself uses **no AI and no API key** — only the automation does.

## Goal

Produce a clean, open-source, general-purpose version of the **tracker app** that anyone can clone and run locally for free, with no agent and no key. Ship it with an empty template plus an anonymized AI/ML starter curriculum so a new user gets immediate value.

## Non-Goals (deferred to later sub-projects)

- Study-doc generation, smart auto-sorting, link enrichment beyond meta tags (project #2: agent plugin).
- BYO-key / Ollama AI fallback (project #3).
- Marketplace listing, marketing, demo assets beyond a README screenshot (project #4).
- The `link-tracker` CLI, `queue-watcher.js`, `md_to_docx.py`, `.docx` study docs, graphify, `.claude/commands`, `CLAUDE.md` session-start automation — all excluded from the OSS repo.

---

## Derivation (how `D:\learning-hq` is created)

1. New folder `D:\learning-hq`, **fresh `git init`** (no history from `D:\tracker`).
2. Copy and generalize only the reusable web app: `frontend/server.js`, `frontend/public/{index.html,app.js,style.css}`, `frontend/package.json`. Keep the Observatory theme + accessibility work already done.
3. Build `plans/plan.template.json` (empty skeleton) and `plans/starter-ai-ml.json` (the author's phases + 78 links with the `profile` and any personal fields **stripped**).
4. Add `README.md`, `LICENSE` (MIT), `.gitignore`, server tests.
5. The author reviews before any push to GitHub. **No `gh repo create` / push in this sub-project** unless explicitly requested.

---

## Architecture

Three units, each independently understandable.

### Unit 1 — Data model: a single `plan.json`

The one source of truth. Hand-editable, git-friendly.

```jsonc
{
  "meta": { "title": "My Learning Plan", "version": 1 },
  "phases": [
    { "id": "inbox", "name": "Inbox", "summary": "", "goal": "", "milestone": "", "concepts": [] },
    { "id": "phase1", "name": "Foundations", "summary": "…", "goal": "…", "milestone": "…", "concepts": ["…"] }
  ],
  "links": [
    { "id": "L1", "url": "https://…", "title": "…", "description": "…", "category": "blog",
      "phase": "phase1", "priority": "Now", "done": false, "order": 0 }
  ]
}
```

Rules:
- Phase metadata (`summary`/`goal`/`milestone`/`concepts`) is **inline** on the phase — the Overview modal reads it directly. No separate `_summary.md` files.
- Link ordering within a phase = ascending `order` (integer). Replaces the old `steps[]` mechanism.
- `done` is a boolean **on the link** — no separate done-status store.
- `priority` ∈ `{"Now","Soon","Someday"}`. `category` is a free string with known styles (`github,paper,blog,youtube_video,huggingface,tool,model,docs,pdf,default`).
- An `inbox` phase with `id:"inbox"` is always present; newly added links land there.
- IDs: `L<n>`, where new `<n>` = max existing numeric suffix + 1.

### Unit 2 — Server (`server.js`)

Express, single responsibility = read/write `plan.json` + serve static. Pure helpers kept separate (`lib/plan.js`) so they're unit-testable without HTTP.

`lib/plan.js` (pure, no Express):
- `readPlan(path)` → object (with `{meta:{},phases:[],links:[]}` fallback on missing/corrupt).
- `writePlan(path, plan)` → writes pretty JSON.
- `nextLinkId(plan)` → `"L<max+1>"`.
- `enrichUrl(url)` → `{title, description, category}` from meta tags (ported from current server; no AI).
- `buildPhasesView(plan)` → phases each with their links sorted by `order`, plus `total`/`done` counts (the shape the frontend renders).

`server.js` routes:
| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/plan` | `{ phases: buildPhasesView(plan) }` |
| POST | `/api/links` `{url}` | enrich → append link `{phase:"inbox",priority:"Soon",done:false,order:<next in inbox>}` → write. 409 on duplicate URL. |
| PATCH | `/api/links/:id` `{phase?,priority?,done?,order?,title?,description?,category?}` | validate fields → update → write |
| DELETE | `/api/links/:id` | remove → write |
| GET | `/api/search?q=` | filter links by title/desc/category/priority |

Config: `PLAN_FILE` env (default `./plan.json`). On startup, if `PLAN_FILE` does not exist, copy `plans/starter-ai-ml.json` to it (so first run is populated, per onboarding decision) and log a note. App exported via `module.exports` + `require.main` guard (testable).

### Unit 3 — Frontend (`public/`)

Reuse the existing Observatory theme + accessibility (focus rings, `prefers-reduced-motion`, dialog ARIA + focus trap, status-as-text). Changes from the current app:

- **Inbox** appears as the first phase in the sidebar.
- **Link card** gains inline controls: a **phase `<select>`**, a **priority `<select>`**, the existing **Done** toggle, and a **delete (✕)** button. Each change calls `PATCH`/`DELETE` then re-renders. The selects are real, labelled form controls (keyboard + screen-reader friendly).
- **Overview modal** reads `phase.summary/goal/milestone/concepts` straight from the plan (no fetch of `_summary.md`).
- Remove all code paths tied to the dual store, `doc-queue.json`, and `link-tracker/links.json` (done status now on the link).
- Keep: search overlay, add-URL bar, "Read Next" banner (first not-done link in the active phase, ignoring `inbox`).

---

## Data Flow

```
plan.json ──readPlan──► buildPhasesView ──GET /api/plan──► app.js renderKanban/renderLinkList
   ▲                                                            │
   └──writePlan◄── POST/PATCH/DELETE ◄── add URL / change phase / priority / done / delete
```

## Error Handling

- Missing/corrupt `plan.json` → safe empty plan (never crash); first-run copy from starter.
- `PATCH`/`DELETE` unknown `id` → 404.
- `POST` duplicate URL → 409 with the existing link.
- Invalid enum (`priority`/`phase` not in plan) → 400.
- All file writes wrapped; failures return 500 with a message, never a half-written file (write to temp then rename).

## Testing (`node:test`, no new deps)

- `lib/plan.js` units: `nextLinkId`, `buildPhasesView` ordering + counts, `readPlan` fallback on missing/corrupt, `enrichUrl` parsing (fixture HTML).
- API integration (`app.listen(0)`): `GET /api/plan` shape; `POST` adds to inbox + 409 on dup; `PATCH` changes phase/priority/done and persists; `DELETE` removes; invalid enum → 400; unknown id → 404.
- Manual: clone-fresh run → starter loads → add a URL → it lands in Inbox → reassign phase/priority → mark done → delete → Overview modal shows inline phase info → keyboard + focus behavior intact.

## Files (new repo `D:\learning-hq`)

| Path | Responsibility |
|------|----------------|
| `server.js` | Express wiring + routes (thin) |
| `lib/plan.js` | pure plan read/write/enrich/view helpers |
| `public/index.html` | markup incl. per-card selects + delete |
| `public/app.js` | render + PATCH/DELETE/POST wiring, modal focus mgmt |
| `public/style.css` | Observatory theme + a11y + new select/delete styles |
| `plans/plan.template.json` | empty skeleton (Inbox + 1 sample phase) |
| `plans/starter-ai-ml.json` | anonymized AI/ML curriculum (phases + 78 links, no profile) |
| `test/plan.test.js` | unit tests for `lib/plan.js` |
| `test/api.test.js` | integration tests |
| `README.md`, `LICENSE`, `.gitignore` | repo hygiene (MIT; ignore `node_modules`, `plan.json`) |

## Open defaults (adjustable, not blocking)

- Name: **Learning HQ**. License: **MIT**. CLI: **omitted** from v1 (web app only).
