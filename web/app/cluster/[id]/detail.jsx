"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJSON, relTime } from "../../../lib/api";

const MAX_STEPS = 4; // hard rule 3 — upstream cap is 4; UI never renders more

export default function Detail({ id }) {
  const [cluster, setCluster] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [err, setErr] = useState(null);

  // investigation
  const [steps, setSteps] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [investigating, setInvestigating] = useState(false);
  const [invDone, setInvDone] = useState(false);

  // downstream panels
  const [packet, setPacket] = useState(null);
  const [drafts, setDrafts] = useState(null);
  const [fixSteps, setFixSteps] = useState([]);
  const [patch, setPatch] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [approval, setApproval] = useState(null);

  const esRef = useRef(null);

  useEffect(() => {
    Promise.all([fetchJSON("/api/clusters"), fetchJSON("/api/tickets")])
      .then(([c, t]) => {
        const found = (c.clusters || []).find((x) => x.id === id);
        if (!found) throw new Error(`no cluster ${id}`);
        setCluster(found);
        setTickets(t.tickets || []);
      })
      .catch((e) => setErr(String(e.message || e)));
    return () => esRef.current?.close();
  }, [id]);

  const ticketsById = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const newest = useMemo(
    () => tickets.reduce((m, t) => (t.created_at > m ? t.created_at : m), "1970-01-01"),
    [tickets],
  );

  function investigate() {
    setInvestigating(true);
    setSteps([]);
    const es = new EventSource(`/api/clusters/${id}/investigation/stream`);
    esRef.current = es;
    es.addEventListener("step", (e) => {
      const s = JSON.parse(e.data);
      setSteps((prev) => (prev.length >= MAX_STEPS ? prev : [...prev, s]));
    });
    es.addEventListener("analysis", (e) => setAnalysis(JSON.parse(e.data)));
    es.addEventListener("done", () => {
      es.close();
      setInvestigating(false);
      setInvDone(true);
    });
    es.onerror = async () => {
      es.close();
      try {
        const inv = await fetchJSON(`/api/clusters/${id}/investigation`);
        setSteps((inv.steps || []).slice(0, MAX_STEPS));
        setAnalysis(inv.analysis || null);
        setInvDone(true);
      } catch (e2) {
        setErr(String(e2.message || e2));
      }
      setInvestigating(false);
    };
  }

  function buildFix() {
    setFixing(true);
    setFixSteps([]);
    const es = new EventSource(`/api/clusters/${id}/fix/stream`);
    esRef.current = es;
    es.addEventListener("step", (e) => setFixSteps((p) => [...p, JSON.parse(e.data)]));
    es.addEventListener("patch", (e) => setPatch(JSON.parse(e.data)));
    es.addEventListener("done", () => {
      es.close();
      setFixing(false);
    });
    es.onerror = async () => {
      es.close();
      try {
        const fix = await fetchJSON(`/api/clusters/${id}/fix`);
        setFixSteps(fix.steps || []);
        setPatch(fix);
      } catch (e2) {
        setErr(String(e2.message || e2));
      }
      setFixing(false);
    };
  }

  async function loadPacket() {
    setPacket(await fetchJSON(`/api/clusters/${id}/packet`));
  }
  async function loadDrafts() {
    setDrafts(await fetchJSON(`/api/clusters/${id}/drafts`));
  }
  async function openApproval() {
    setApproval(await fetchJSON(`/api/clusters/${id}/approval`));
  }
  async function decide(decision, note) {
    const res = await fetch(`/api/clusters/${id}/approval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    setApproval(await res.json());
  }

  if (err) return <p className="error-note" style={{ marginTop: 40 }}>{err}</p>;
  if (!cluster)
    return (
      <div className="spinner-row" style={{ marginTop: 60 }}>
        <span className="spinner" /> Loading cluster…
      </div>
    );

  const members = cluster.ticket_ids.map((tid) => ticketsById.get(tid)).filter(Boolean);
  const released = approval?.decision === "approved";

  return (
    <main>
      <div className="detail-head">
        <a className="backlink" href="/ui/">← All clusters</a>
        <h1>{cluster.name}</h1>
        <div className="statrow" style={{ margin: "6px 0 0" }}>
          <Stat n={cluster.customer_count} l="customers" />
          <Stat n={cluster.ticket_ids.length} l="tickets" />
          <Stat n={relTime(cluster.first_seen, newest)} l="first seen" />
          <Stat n={cluster.score} l="impact score" />
        </div>
      </div>

      <section className="section">
        <p className="sec-label">member tickets</p>
        <div className="ticket-strip">
          {members.map((t) => (
            <div className="ticket-mini" key={t.id}>
              <span className="tid">{t.id}</span>
              <div className="subj">{t.subject}</div>
              <div className="who">
                {t.customer_id} · {relTime(t.created_at, newest)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <p className="sec-label">investigation · agent, 4-call hard cap</p>
        {steps.length === 0 && !investigating && (
          <button className="btn btn-primary" onClick={investigate}>
            ▸ Run investigation
          </button>
        )}
        <div className="trace">
          {steps.map((s) => (
            <StepPanel key={s.n} s={s} />
          ))}
          {investigating && (
            <div className="spinner-row">
              <span className="spinner" /> agent working…
            </div>
          )}
        </div>
        {analysis && <AnalysisCard a={analysis} />}
      </section>

      {invDone && (
        <div className="actionbar">
          {!packet && <button className="btn" onClick={loadPacket}>Escalation packet</button>}
          {!drafts && <button className="btn" onClick={loadDrafts}>Customer drafts</button>}
          {fixSteps.length === 0 && !fixing && (
            <button className="btn btn-primary" onClick={buildFix}>⚡ Build a fix</button>
          )}
        </div>
      )}

      {packet && <PacketCard p={packet} />}

      {(fixSteps.length > 0 || fixing) && (
        <section className="section">
          <p className="sec-label">fix agent · writes only the sample app, allowlisted</p>
          <div className="trace">
            {fixSteps.map((s) => (
              <StepPanel key={s.n} s={s} />
            ))}
            {fixing && !patch && (
              <div className="spinner-row">
                <span className="spinner" /> patching storefront-fraud.js…
              </div>
            )}
          </div>
          {patch && <FixCard patch={patch} />}
        </section>
      )}

      {patch && (
        <div className="actionbar">
          {!showDevices && (
            <button className="btn" onClick={() => setShowDevices(true)}>Test on devices</button>
          )}
          {!approval && (
            <button className="btn btn-primary" onClick={openApproval}>PM approval</button>
          )}
        </div>
      )}

      {showDevices && <DevicesCard />}
      {approval && <ApprovalCard approval={approval} onDecide={decide} />}

      {drafts && <DraftsCard drafts={drafts} released={released} />}
    </main>
  );
}

/* ── components ────────────────────────────────────────────────────────── */

function Stat({ n, l }) {
  return (
    <div className="stat">
      <div className="n" style={{ fontSize: 20 }}>{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}

function StepPanel({ s }) {
  return (
    <div className="step-panel">
      <div className="step-head">
        <span className="num">#{s.n}</span>
        <span className="tool">{s.tool}</span>
        <span className="args">{JSON.stringify(s.input)}</span>
      </div>
      <div className="step-body">{s.result_summary}</div>
    </div>
  );
}

function Chips({ cites = [], tool }) {
  return (
    <>
      {" "}
      {cites.map((c) => (
        <span className="chip" key={c}>{c}</span>
      ))}
      {tool && <span className="chip chip-tool">{tool}</span>}
    </>
  );
}

// Hard rule 2: bullets without a citation or named tool result are dropped.
const cited = (items = []) => items.filter((i) => (i.cites && i.cites.length) || i.tool);

function AnalysisCard({ a }) {
  const secs = [
    ["Common to every report", cited(a.common)],
    ["What varies", cited(a.varies)],
    ["Already ruled out", cited(a.ruled_out)],
  ];
  const hypos = cited(a.hypotheses);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="analysis-grid">
        {secs.map(([title, items]) => (
          <div className="analysis-sec" key={title}>
            <h4>{title}</h4>
            <ul>
              {items.map((i, k) => (
                <li key={k}>
                  {i.text}
                  <Chips cites={i.cites} tool={i.tool} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="analysis-sec hypo-box">
          <h4>Hypotheses <span className="badge badge-warn">Unconfirmed</span></h4>
          <ul>
            {hypos.map((h, k) => (
              <li key={k}>
                {h.text}
                <Chips cites={h.cites} tool={h.tool} />
                {h.not_examined && <div className="notex">Not examined: {h.not_examined}</div>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function PacketCard({ p }) {
  const pk = p.packet;
  if (!pk) return null;
  const ev = cited(pk.evidence);
  return (
    <section className="section">
      <p className="sec-label">escalation packet · merged across the whole cluster</p>
      <div className="card packet">
        <h3>{pk.title}</h3>
        <p className="impact">{pk.impact}</p>
        <div className="analysis-sec">
          <h4>Evidence</h4>
          <ul>
            {ev.map((i, k) => (
              <li key={k}>
                {i.text}
                <Chips cites={i.cites} tool={i.tool} />
              </li>
            ))}
          </ul>
        </div>
        <div className="merged">
          <b>Visible in no single ticket</b>
          {pk.merged_note}
        </div>
        <p className="kv"><b>Suggested repro:</b> {pk.suggested_repro}</p>
        <p className="kv"><b>Not examined:</b> {pk.not_examined}</p>
      </div>
    </section>
  );
}

function FixCard({ patch }) {
  const check = patch.check || {};
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`badge ${check.passed ? "badge-ok" : "badge-fail"}`}>
          {(check.cases || []).filter((c) => c.pass).length}/{(check.cases || []).length} checks passed
        </span>
        {(check.cases || []).map((c) => (
          <span key={c.name} className={`badge ${c.pass ? "badge-ok" : "badge-fail"}`}>
            {c.pass ? "✓" : "✗"} {c.name}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 14, color: "var(--dim)", margin: "12px 0 0" }}>{patch.summary}</p>
      <Diff text={patch.diff} />
      <div className="actionbar" style={{ marginTop: 4 }}>
        <a className="btn btn-primary" href="/storefront.html?fixed=1" target="_blank" rel="noreferrer">
          View fixed storefront ↗
        </a>
        <a className="btn" href="/storefront.html" target="_blank" rel="noreferrer">
          Broken original ↗
        </a>
      </div>
    </div>
  );
}

function Diff({ text = "" }) {
  return (
    <pre className="diff">
      {text.split("\n").map((ln, i) => {
        let cls = "ln";
        if (ln.startsWith("@@")) cls += " hunk";
        else if (ln.startsWith("+") && !ln.startsWith("+++")) cls += " add";
        else if (ln.startsWith("-") && !ln.startsWith("---")) cls += " del";
        return (
          <span className={cls} key={i}>
            {ln || " "}
          </span>
        );
      })}
    </pre>
  );
}

const DEVICES = [
  { key: "phone", label: "Phone · 375×667", w: 375, h: 667, scale: 0.5 },
  { key: "tablet", label: "Tablet · 768×1024", w: 768, h: 1024, scale: 0.32 },
  { key: "desktop", label: "Desktop · 1280×800", w: 1280, h: 800, scale: 0.26 },
];

function DevicesCard() {
  const [results, setResults] = useState({});
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data && e.data.ttg === "selftest") {
        setResults((r) => ({ ...r, [e.data.device]: e.data.results }));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  return (
    <section className="section">
      <p className="sec-label">device verification · patched build, live self-tests</p>
      <div className="device-row">
        {DEVICES.map((d) => (
          <div className="device" key={d.key}>
            <div className="dlabel">
              <span>{d.label}</span>
              {results[d.key] ? (
                <span className={`badge ${results[d.key].every((r) => r.pass) ? "badge-ok" : "badge-fail"}`}>
                  {results[d.key].filter((r) => r.pass).length}/{results[d.key].length}
                </span>
              ) : (
                <span className="badge badge-muted">running…</span>
              )}
            </div>
            <div className="shell" style={{ width: d.w * d.scale, height: d.h * d.scale }}>
              <iframe
                title={d.key}
                src={`/storefront.html?fixed=1&selftest=1&device=${d.key}`}
                width={d.w}
                height={d.h}
                style={{ transform: `scale(${d.scale})` }}
              />
            </div>
            <div className="dresults">
              {(results[d.key] || []).map((r) => (
                <span key={r.name} className={`badge ${r.pass ? "badge-ok" : "badge-fail"}`}>
                  {r.pass ? "✓" : "✗"} {r.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApprovalCard({ approval, onDecide }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (d) => {
    setBusy(true);
    await onDecide(d, note);
    setBusy(false);
  };
  return (
    <section className="section">
      <p className="sec-label">pm sign-off · a human decides, always</p>
      <div className="card approve-card">
        {approval.decision === "pending" ? (
          <>
            <p style={{ margin: 0, fontSize: 14, color: "var(--dim)" }}>
              The fix passed its checks on every device. Ship the patch and release the customer
              updates for send review — or return it to engineering.
            </p>
            <input
              className="approve-note"
              placeholder="Optional note for the record"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="actionbar" style={{ margin: 0 }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => act("approved")}>
                ✓ Approve fix
              </button>
              <button className="btn btn-danger-soft" disabled={busy} onClick={() => act("returned")}>
                Return to devs
              </button>
            </div>
          </>
        ) : approval.decision === "approved" ? (
          <div className="outcome">
            <span className="badge badge-ok">Approved</span>
            <span className="note mono">{new Date(approval.at).toLocaleTimeString()}</span>
            {approval.note && <span className="note">“{approval.note}”</span>}
            <span className="note">Customer drafts released for send review. Nothing sends automatically.</span>
          </div>
        ) : (
          <div className="outcome">
            <span className="badge badge-fail">Returned to devs</span>
            {approval.note && <span className="note">“{approval.note}”</span>}
          </div>
        )}
      </div>
    </section>
  );
}

function DraftsCard({ drafts, released }) {
  return (
    <section className="section">
      <p className="sec-label">customer drafts · one per affected customer</p>
      <div className="draft-grid">
        {(drafts.drafts || []).map((d) => (
          <div className="draft" key={d.customer_id}>
            <div className="dhead">
              <span className="dwho">
                {d.customer_id} · <span style={{ color: "var(--faint)" }}>{d.ticket_id}</span>
              </span>
              <span className={`badge ${released ? "badge-ok" : "badge-warn"}`}>
                {released ? "released for send review" : "pending approval"}
              </span>
            </div>
            <p>{d.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
