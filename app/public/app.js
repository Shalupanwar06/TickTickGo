/* TickTickGo SPA — hash routing: #/ cluster list, #/cluster/:id detail. */

const app = document.getElementById("app");
const state = { clusters: null, ungrouped: [], tickets: new Map(), fixtureNote: false };

/* ---------- data ---------- */

async function load() {
  try {
    const [c, t, meta] = await Promise.all([
      fetch("/api/clusters").then((r) => r.json()),
      fetch("/api/tickets").then((r) => r.json()),
      fetch("/api/meta").then((r) => r.json()).catch(() => ({ source: "fixtures" })),
    ]);
    state.source = meta.source;
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
    `${total} tickets · ${state.clusters.length} issues` +
    (state.source === "pipeline" ? "" : " · fixture data");

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

/* ---------- detail screen ---------- */

function chips(ids) {
  return (ids || [])
    .map((id) => {
      const t = state.tickets.get(id);
      return `<span class="chip" title="${t ? esc(t.subject) : "ticket not in frontend fixture"}">${esc(id)}</span>`;
    })
    .join("");
}

// Hard rule 2: bullets without a ticket citation or a named tool result are
// dropped by the renderer, not displayed. Do not relax this.
function bullets(items) {
  return (items || [])
    .filter((b) => {
      const ok = (b.cites && b.cites.length) || b.tool;
      if (!ok) console.warn("Dropped uncited bullet:", b.text);
      return ok;
    })
    .map(
      (b) => `<li>${esc(b.text)} ${chips(b.cites)}${b.tool ? `<span class="chip chip-tool">${esc(b.tool)}</span>` : ""}</li>`
    )
    .join("");
}

function stepPanel(s) {
  return `
    <div class="step-panel">
      <div class="step-head"><span class="step-n">${s.n}</span><code>${esc(s.tool)}</code><span class="step-input">${esc(JSON.stringify(s.input))}</span></div>
      <div class="step-result">${esc(s.result_summary)}</div>
    </div>`;
}

function analysisCard(a) {
  const hyps = (a.hypotheses || [])
    .map(
      (h) => `
      <div class="hypothesis">
        <div class="hyp-head"><span class="badge badge-unconfirmed">Unconfirmed hypothesis</span></div>
        <p>${esc(h.text)} ${chips(h.cites)}${h.tool ? `<span class="chip chip-tool">${esc(h.tool)}</span>` : ""}</p>
        <p class="not-examined"><strong>Not examined:</strong> ${esc(h.not_examined)}</p>
      </div>`
    )
    .join("");
  return `
    <section class="card analysis">
      <h2>Analysis</h2>
      <h3>Common to every report</h3><ul>${bullets(a.common)}</ul>
      <h3>What varies</h3><ul>${bullets(a.varies)}</ul>
      <h3>Already ruled out</h3><ul>${bullets(a.ruled_out)}</ul>
      ${hyps}
    </section>`;
}

// Minimal markdown for the pipeline's packet_*.md: headers, bold, lists,
// inline code, paragraphs. Escapes first — good enough for a one-page report.
function mdToHtml(md) {
  const lines = esc(md).split("\n");
  let html = "", inList = false;
  for (const line of lines) {
    const h = line.match(/^(#{1,3}) (.*)/);
    const li = line.match(/^[-*] (.*)/);
    if (inList && !li) { html += "</ul>"; inList = false; }
    if (h) html += `<h${h[1].length + 2}>${h[2]}</h${h[1].length + 2}>`;
    else if (li) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${li[1]}</li>`; }
    else if (line.trim() === "---") html += "<hr>";
    else if (line.trim()) html += `<p>${line}</p>`;
  }
  if (inList) html += "</ul>";
  return html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\b(t\d{3}|d\d+)\b/g, '<span class="chip">$1</span>');
}

function packetCard(p) {
  if (p.markdown) {
    return `<section class="card packet-md"><h2>Escalation packet</h2>${mdToHtml(p.markdown)}</section>`;
  }
  return `
    <section class="card">
      <h2>Escalation packet</h2>
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.impact)}</p>
      <ul>${bullets(p.evidence)}</ul>
      <p><strong>Suggested repro:</strong> ${esc(p.suggested_repro)}</p>
      <p class="not-examined"><strong>Not examined:</strong> ${esc(p.not_examined)}</p>
      <p class="merged-note">${esc(p.merged_note)}</p>
    </section>`;
}

function draftsCard(d) {
  const items = (d.drafts || [])
    .map(
      (dr) => `
      <div class="draft">
        <div class="draft-head">To customer <code>${esc(dr.customer_id)}</code> re ${chips([dr.ticket_id])}
          <span class="badge badge-pending">${esc(dr.status)}</span></div>
        <p>${esc(dr.body)}</p>
      </div>`
    )
    .join("");
  return `
    <section class="card">
      <h2>Customer drafts</h2>
      <p class="note">Queued for approval — nothing sends from this tool.</p>
      ${items}
    </section>`;
}

function renderDetail(id) {
  const c = state.clusters.find((x) => x.id === id);
  if (!c) {
    app.innerHTML = `<a class="back-link" href="#/">&larr; All issues</a><div class="stub">Unknown cluster.</div>`;
    return;
  }
  const known = c.ticket_ids.map((tid) => state.tickets.get(tid)).filter(Boolean);
  app.innerHTML = `
    <a class="back-link" href="#/">&larr; All issues</a>
    <header class="detail-head">
      <h1>${esc(c.name)}${isRising(c) ? '<span class="badge badge-rising">Rising</span>' : ""}</h1>
      <p class="detail-meta"><strong>${c.customer_count}</strong> customers · ${c.ticket_ids.length} tickets · first seen ${relTime(c.first_seen)}</p>
    </header>
    <section class="card">
      <h2>Tickets in this group</h2>
      ${known
        .map(
          (t) => `<div class="ticket-line">${chips([t.id])}<span class="ticket-subject">${esc(t.subject)}</span><span class="ticket-meta">${esc(t.customer_id)} · ${relTime(t.created_at)}</span></div>`
        )
        .join("")}
      ${c.ticket_ids.length > known.length ? `<p class="note">+ ${c.ticket_ids.length - known.length} more: ${chips(c.ticket_ids.filter((tid) => !state.tickets.get(tid)))}</p>` : ""}
    </section>
    <section class="card">
      <h2>Investigation</h2>
      <div id="trace"></div>
      <button id="investigate" class="btn btn-primary">Investigate this cluster</button>
    </section>
    <div id="analysis-slot"></div>
    <div id="actions" class="actions" hidden>
      <button id="show-packet" class="btn">Escalation packet</button>
      <button id="show-drafts" class="btn">Customer drafts</button>
      <button id="build-fix" class="btn">Build a fix</button>
      <button id="test-devices" class="btn" hidden>Test on devices</button>
      <button id="pm-approval" class="btn" hidden>PM approval</button>
    </div>
    <div id="packet-slot"></div>
    <div id="drafts-slot"></div>
    <div id="fix-slot"></div>
    <div id="devices-slot"></div>
    <div id="approval-slot"></div>`;

  document.getElementById("investigate").addEventListener("click", () => investigate(id));
  document.getElementById("show-packet").addEventListener("click", async (e) => {
    e.target.disabled = true;
    const d = await fetch(`/api/clusters/${id}/packet`).then((r) => r.json());
    document.getElementById("packet-slot").innerHTML = packetCard(d.packet);
  });
  document.getElementById("show-drafts").addEventListener("click", async (e) => {
    e.target.disabled = true;
    const d = await fetch(`/api/clusters/${id}/drafts`).then((r) => r.json());
    document.getElementById("drafts-slot").innerHTML = draftsCard(d);
  });
  document.getElementById("build-fix").addEventListener("click", () => buildFix(id));
  document.getElementById("test-devices").addEventListener("click", (e) => {
    e.target.disabled = true;
    ensureSelftestListener();
    document.getElementById("devices-slot").innerHTML = devicesCard();
  });
  document.getElementById("pm-approval").addEventListener("click", (e) => {
    e.target.disabled = true;
    approvalCard(id);
  });
}

const MAX_STEPS = 4; // hard rule 3 — the cap lives upstream, the UI never renders more

function investigate(id) {
  const btn = document.getElementById("investigate");
  const trace = document.getElementById("trace");
  btn.disabled = true;
  btn.textContent = "Investigating…";
  let steps = 0;

  const es = new EventSource(`/api/clusters/${id}/investigation/stream`);
  es.addEventListener("step", (ev) => {
    if (steps >= MAX_STEPS) return;
    steps++;
    trace.insertAdjacentHTML("beforeend", stepPanel(JSON.parse(ev.data)));
  });
  es.addEventListener("analysis", (ev) => {
    document.getElementById("analysis-slot").innerHTML = analysisCard(JSON.parse(ev.data));
  });
  es.addEventListener("done", () => {
    es.close();
    btn.remove();
    document.getElementById("actions").hidden = false;
  });
  es.onerror = async () => {
    // SSE failed — fall back to the persisted investigation in one shot.
    es.close();
    const inv = await fetch(`/api/clusters/${id}/investigation`).then((r) => r.json());
    trace.innerHTML = inv.steps.slice(0, MAX_STEPS).map(stepPanel).join("");
    document.getElementById("analysis-slot").innerHTML = analysisCard(inv.analysis);
    btn.remove();
    document.getElementById("actions").hidden = false;
  };
}

/* ---------- fix agent ---------- */

function buildFix(id) {
  const btn = document.getElementById("build-fix");
  const slot = document.getElementById("fix-slot");
  btn.disabled = true;
  btn.textContent = "Building fix…";
  slot.innerHTML = `
    <section class="card">
      <h2>Fix agent</h2>
      <div id="fix-trace"></div>
      <div id="patch-slot"></div>
    </section>`;
  const trace = document.getElementById("fix-trace");
  const reveal = () => {
    btn.remove();
    document.getElementById("test-devices").hidden = false;
    document.getElementById("pm-approval").hidden = false;
  };

  const es = new EventSource(`/api/clusters/${id}/fix/stream`);
  es.addEventListener("step", (ev) => {
    trace.insertAdjacentHTML("beforeend", stepPanel(JSON.parse(ev.data)));
  });
  es.addEventListener("patch", (ev) => {
    document.getElementById("patch-slot").innerHTML = fixCard(JSON.parse(ev.data));
  });
  es.addEventListener("done", () => {
    es.close();
    reveal();
  });
  es.onerror = async () => {
    // SSE failed — fall back to the persisted fix in one shot.
    es.close();
    const fix = await fetch(`/api/clusters/${id}/fix`).then((r) => r.json());
    trace.innerHTML = (fix.steps || []).map(stepPanel).join("");
    document.getElementById("patch-slot").innerHTML = fixCard(fix);
    reveal();
  };
}

function diffHtml(diff) {
  return String(diff || "")
    .split("\n")
    .map((line) => {
      let cls = "";
      if (line.startsWith("+++") || line.startsWith("---")) cls = "";
      else if (line.startsWith("+")) cls = "diff-add";
      else if (line.startsWith("-")) cls = "diff-del";
      else if (line.startsWith("@@")) cls = "diff-hunk";
      return `<span${cls ? ` class="${cls}"` : ""}>${esc(line)}</span>`;
    })
    .join("\n");
}

function fixCard(patch) {
  const check = patch.check || { passed: false, cases: [] };
  const cases = check.cases || [];
  const passed = cases.filter((c) => c.pass).length;
  const summaryBadge = `<span class="badge ${check.passed ? "badge-pass" : "badge-fail"}">${passed}/${cases.length} checks passed</span>`;
  const caseBadges = cases
    .map((c) => `<span class="badge ${c.pass ? "badge-pass" : "badge-fail"}">${c.pass ? "✓" : "✗"} ${esc(c.name)}</span>`)
    .join(" ");
  return `
    <section class="card">
      <h2>Proposed fix</h2>
      <p>${esc(patch.summary)}</p>
      <div class="check-row">${summaryBadge} ${caseBadges}</div>
      <pre class="diff">${diffHtml(patch.diff)}</pre>
      <div class="actions">
        <a class="btn btn-primary" href="/storefront.html?fixed=1" target="_blank">View fixed storefront</a>
        <a class="btn" href="/storefront.html" target="_blank">View broken original</a>
      </div>
    </section>`;
}

/* ---------- device verification ---------- */

const DEVICES = [
  { key: "phone", label: "Phone 375×667", w: 375, h: 667, scale: 0.42 },
  { key: "tablet", label: "Tablet 768×1024", w: 768, h: 1024, scale: 0.26 },
  { key: "desktop", label: "Desktop 1280×800", w: 1280, h: 800, scale: 0.2 },
];

function devicesCard() {
  const frames = DEVICES.map((d) => {
    const sw = Math.round(d.w * d.scale);
    const sh = Math.round(d.h * d.scale);
    return `
      <div class="device">
        <div class="device-label">${esc(d.label)}</div>
        <div class="device-frame" style="width:${sw}px;height:${sh}px">
          <iframe src="/storefront.html?fixed=1&amp;selftest=1&amp;device=${esc(d.key)}" width="${d.w}" height="${d.h}" style="transform:scale(${d.scale})" title="${esc(d.label)}"></iframe>
        </div>
        <div class="device-results" id="devres-${esc(d.key)}">running…</div>
      </div>`;
  }).join("");
  return `
    <section class="card">
      <h2>Device verification — patched build</h2>
      <div class="device-row">${frames}</div>
    </section>`;
}

// Attached at most once for the page's lifetime; results rows are looked up
// per message so re-renders of the devices card keep working.
let selftestListenerAdded = false;
function ensureSelftestListener() {
  if (selftestListenerAdded) return;
  selftestListenerAdded = true;
  window.addEventListener("message", (e) => {
    if (!e.data || e.data.ttg !== "selftest") return;
    const row = document.getElementById(`devres-${e.data.device}`);
    if (!row) return;
    row.innerHTML = (e.data.results || [])
      .map((r) => `<span class="badge ${r.pass ? "badge-pass" : "badge-fail"}">${r.pass ? "✓" : "✗"} ${esc(r.name)}</span>`)
      .join(" ");
  });
}

/* ---------- PM approval ---------- */

async function approvalCard(id) {
  const slot = document.getElementById("approval-slot");
  slot.innerHTML = `<section class="card"><h2>PM sign-off</h2><p class="note">Loading…</p></section>`;
  let cur = { decision: "pending" };
  try {
    cur = await fetch(`/api/clusters/${id}/approval`).then((r) => r.json());
  } catch (err) {
    console.error("Approval fetch failed:", err);
  }
  if (cur.decision && cur.decision !== "pending") {
    approvalOutcome(cur);
    return;
  }
  slot.innerHTML = `
    <section class="card">
      <h2>PM sign-off</h2>
      <input id="approval-note" class="approval-note" type="text" placeholder="Optional note">
      <div class="actions">
        <button id="approve-fix" class="btn btn-primary">Approve fix</button>
        <button id="return-fix" class="btn">Return to devs</button>
      </div>
    </section>`;
  const decide = async (decision) => {
    document.getElementById("approve-fix").disabled = true;
    document.getElementById("return-fix").disabled = true;
    const note = document.getElementById("approval-note").value.trim();
    const res = await fetch(`/api/clusters/${id}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note ? { decision, note } : { decision }),
    }).then((r) => r.json());
    approvalOutcome(res);
  };
  document.getElementById("approve-fix").addEventListener("click", () => decide("approved"));
  document.getElementById("return-fix").addEventListener("click", () => decide("returned"));
}

function approvalOutcome(a) {
  const slot = document.getElementById("approval-slot");
  const at = a.at ? `<span class="approval-at">${esc(new Date(a.at).toLocaleString())}</span>` : "";
  if (a.decision === "approved") {
    slot.innerHTML = `
      <section class="card">
        <h2>PM sign-off</h2>
        <p><span class="badge badge-approved">Approved</span> ${at}</p>
      </section>`;
    // Display-only text swap on any rendered drafts — no send affordance,
    // nothing sends, no data mutation.
    document.querySelectorAll("#drafts-slot .badge-pending").forEach((b) => {
      b.textContent = "released for send review";
    });
  } else {
    slot.innerHTML = `
      <section class="card">
        <h2>PM sign-off</h2>
        <p><span class="badge badge-returned">Returned to devs</span> ${at}</p>
        ${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}
      </section>`;
  }
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
