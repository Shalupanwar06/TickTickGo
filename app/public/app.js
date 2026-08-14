/* TickTickGo SPA — hash routing: #/ cluster list, #/cluster/:id detail. */

const app = document.getElementById("app");
const state = { clusters: null, ungrouped: [], tickets: new Map(), fixtureNote: false };

/* ---------- data ---------- */

async function load() {
  try {
    const [c, t] = await Promise.all([
      fetch("/api/clusters").then((r) => r.json()),
      fetch("/api/tickets").then((r) => r.json()),
    ]);
    state.clusters = [...c.clusters].sort((a, b) => b.score - a.score);
    state.ungrouped = c.ungrouped_ids || [];
    for (const tk of t.tickets || []) state.tickets.set(tk.id, tk);
  } catch (err) {
    console.error("API failed:", err);
    state.clusters = [];
    state.fixtureNote = true;
  }
  render();
}

/* ---------- helpers ---------- */

function relTime(iso, now = newestTicketTime()) {
  const ms = now - new Date(iso).getTime();
  const h = Math.round(ms / 3.6e6);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// The demo corpus is frozen in time, so "now" is the newest ticket in the
// batch, not the wall clock — keeps relative times stable on stage.
function newestTicketTime() {
  let max = 0;
  for (const t of state.tickets.values()) max = Math.max(max, new Date(t.created_at).getTime());
  return max || Date.now();
}

// Rising = at least half of the cluster's known tickets arrived within 24h
// of the newest ticket in the batch. UI-side heuristic until the pipeline
// emits a trend field in the contract (needs agreement with Raushan).
function isRising(cluster) {
  const known = cluster.ticket_ids.map((id) => state.tickets.get(id)).filter(Boolean);
  if (known.length < 2) return false;
  const cutoff = newestTicketTime() - 24 * 3.6e6;
  const recent = known.filter((t) => new Date(t.created_at).getTime() >= cutoff);
  return recent.length >= known.length / 2;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/* ---------- screens ---------- */

function renderList() {
  const total =
    state.clusters.reduce((n, c) => n + c.ticket_ids.length, 0) + state.ungrouped.length;
  document.getElementById("batch-summary").textContent =
    `${total} tickets · ${state.clusters.length} issues`;

  const rows = state.clusters
    .map(
      (c) => `
    <button class="cluster-row" data-id="${esc(c.id)}">
      <span class="cluster-name">${esc(c.name)}${isRising(c) ? '<span class="badge badge-rising">Rising</span>' : ""}</span>
      <span class="stat stat-customers"><span class="num">${c.customer_count}</span><span class="lbl">customers</span></span>
      <span class="stat stat-tickets"><span class="num">${c.ticket_ids.length}</span><span class="lbl">tickets</span></span>
      <span class="stat stat-seen"><span class="num">${relTime(c.first_seen)}</span><span class="lbl">first seen</span></span>
    </button>`
    )
    .join("");

  app.innerHTML = `
    <h1 class="screen-title">Issues by customer impact</h1>
    ${rows || '<p class="note error-note">No clusters — API unreachable and no fixture fallback.</p>'}
    ${state.ungrouped.length ? `<div class="ungrouped">${state.ungrouped.length} tickets didn't match any group</div>` : ""}
    ${state.fixtureNote ? '<p class="note">Showing fixture data.</p>' : ""}
  `;

  app.querySelectorAll(".cluster-row").forEach((el) =>
    el.addEventListener("click", () => (location.hash = `#/cluster/${el.dataset.id}`))
  );
}

function renderDetail(id) {
  const c = state.clusters.find((x) => x.id === id);
  app.innerHTML = `
    <a class="back-link" href="#/">&larr; All issues</a>
    <div class="stub">
      <strong>${c ? esc(c.name) : "Unknown cluster"}</strong>
      <p>Detail view lands next (H+2.5&ndash;H+4): member tickets, streaming investigation trace, cited analysis, packet &amp; drafts.</p>
    </div>`;
}

function render() {
  if (state.clusters === null) {
    app.innerHTML = `<h1 class="screen-title">Issues by customer impact</h1>` +
      '<div class="skeleton-row"></div>'.repeat(4);
    return;
  }
  const m = location.hash.match(/^#\/cluster\/([\w-]+)/);
  if (m) renderDetail(m[1]);
  else renderList();
}

window.addEventListener("hashchange", render);
render();
load();
