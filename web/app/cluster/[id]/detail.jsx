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

      {showDevices && <DeviceMatrix />}
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

const PROFILES = [
  { key: "iphone15", label: "iPhone 15 · iOS 17 · Safari", w: 393, h: 852, scale: 0.38, round: true },
  { key: "pixel8", label: "Pixel 8 · Android 14 · Chrome", w: 412, h: 915, scale: 0.36, round: true },
  { key: "ipad", label: "iPad Air · iPadOS · Safari", w: 820, h: 1180, scale: 0.22, round: true },
  { key: "macbook", label: "MacBook · macOS · Chrome", w: 1280, h: 800, scale: 0.24, round: false },
  { key: "windows", label: "Windows 11 · Edge", w: 1280, h: 800, scale: 0.24, round: false },
  { key: "linux", label: "Ubuntu 22.04 · Firefox", w: 1280, h: 800, scale: 0.24, round: false },
];

const SESSION_TIMEOUT_MS = 20000;
const fmtT = (ms) => `${(Math.max(0, ms || 0) / 1000).toFixed(1).padStart(4, "0")}s`;

function DeviceMatrix() {
  const [build, setBuild] = useState("patched");
  const [run, setRun] = useState(0); // global remount counter (build toggle)
  const [deviceRuns, setDeviceRuns] = useState({}); // per-device replay counters
  const [sessions, setSessions] = useState({}); // {profile: {steps, verdict, durationMs, timedOut}}
  const timersRef = useRef({});

  // single window listener; sessions only, legacy selftest messages ignored
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data;
      if (!d || d.ttg !== "session") return;
      if (!PROFILES.some((p) => p.key === d.profile)) return;
      if (d.event === "step" && d.step) {
        setSessions((s) => {
          const cur = s[d.profile] || { steps: [] };
          if (cur.verdict) return s;
          return { ...s, [d.profile]: { ...cur, steps: [...cur.steps, d.step] } };
        });
      } else if (d.event === "done" && d.verdict) {
        clearTimeout(timersRef.current[d.profile]);
        setSessions((s) => {
          const cur = s[d.profile] || { steps: [] };
          return {
            ...s,
            [d.profile]: { ...cur, verdict: d.verdict, durationMs: d.durationMs, timedOut: false },
          };
        });
      }
    };
    window.addEventListener("message", onMsg);
    return () => {
      window.removeEventListener("message", onMsg);
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  const armTimeout = (key) => {
    clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(() => {
      setSessions((s) =>
        s[key]?.verdict ? s : { ...s, [key]: { ...(s[key] || { steps: [] }), timedOut: true } },
      );
    }, SESSION_TIMEOUT_MS);
  };

  // arm all timeouts on mount and on every full remount (build toggle)
  useEffect(() => {
    PROFILES.forEach((p) => armTimeout(p.key));
  }, [build, run]);

  function switchBuild(next) {
    if (next === build) return;
    setSessions({});
    setDeviceRuns({});
    setBuild(next);
    setRun((r) => r + 1);
  }

  function replay(key) {
    setSessions((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
    setDeviceRuns((r) => ({ ...r, [key]: (r[key] || 0) + 1 }));
    armTimeout(key);
  }

  const passed = PROFILES.filter((p) => sessions[p.key]?.verdict?.pass).length;
  const failed = PROFILES.filter(
    (p) => (sessions[p.key]?.verdict && !sessions[p.key].verdict.pass) || sessions[p.key]?.timedOut,
  ).length;
  const summaryCls =
    passed === PROFILES.length ? "badge-ok" : failed > 0 ? "badge-fail" : "badge-muted";

  return (
    <section className="section">
      <div className="matrix-head">
        <div>
          <p className="sec-label" style={{ margin: 0 }}>
            device / os test matrix · live session recordings
          </p>
          <p className="matrix-note">
            Patched should pass on every device; broken reproduces the failure everywhere — that’s
            the point.
          </p>
        </div>
        <div className="seg" role="group" aria-label="build under test">
          <button className={build === "patched" ? "on" : ""} onClick={() => switchBuild("patched")}>
            Patched build
          </button>
          <button className={build === "broken" ? "on" : ""} onClick={() => switchBuild("broken")}>
            Broken build
          </button>
        </div>
      </div>

      <div className="matrix-summary">
        <span className={`badge ${summaryCls}`}>
          {passed}/{PROFILES.length} devices passed
        </span>
      </div>

      <div className="matrix-grid">
        {PROFILES.map((p) => (
          <MatrixCell
            key={`${p.key}-${build}-${run}-${deviceRuns[p.key] || 0}`}
            p={p}
            build={build}
            runId={`${run}.${deviceRuns[p.key] || 0}`}
            sess={sessions[p.key]}
            onReplay={() => replay(p.key)}
          />
        ))}
      </div>
    </section>
  );
}

function MatrixCell({ p, build, runId, sess, onReplay }) {
  const logRef = useRef(null);
  const steps = sess?.steps || [];
  const verdict = sess?.verdict;
  const timedOut = sess?.timedOut && !verdict;
  const running = !verdict && !timedOut;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [steps.length, verdict, timedOut]);

  const src =
    `/storefront.html?session=1&profile=${p.key}&device=${p.key}` +
    (build === "patched" ? "&fixed=1" : "") +
    `&run=${runId}`;

  return (
    <div className="mx-cell">
      <div className="mx-head">
        <span>{p.label}</span>
        {running ? (
          <span className="badge badge-rec">
            <span className="dot" /> recording…
          </span>
        ) : timedOut ? (
          <span className="badge badge-fail">✗ no response · timeout</span>
        ) : (
          <span className={`badge ${verdict.pass ? "badge-ok" : "badge-fail"}`}>
            {verdict.pass ? "✓ passed" : "✗ failed"} · {((sess.durationMs || 0) / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      <div
        className={`shell mx-shell${p.round ? " mx-round" : ""}`}
        style={{ width: p.w * p.scale, height: p.h * p.scale }}
      >
        <iframe
          title={p.label}
          src={src}
          width={p.w}
          height={p.h}
          style={{ transform: `scale(${p.scale})` }}
        />
        {running && (
          <span className="mx-rec">
            <span className="dot" /> REC
          </span>
        )}
      </div>
      <div className="mx-timeline" ref={logRef}>
        {steps.length === 0 && running && <div className="row wait">— waiting for session —</div>}
        {steps.map((s, i) => (
          <div className="row" key={i}>
            <span className="t">{fmtT(s.t)}</span>
            {s.label}
          </div>
        ))}
        {verdict && (
          <div className={`row ${verdict.pass ? "v-pass" : "v-fail"}`}>
            <span className="t">{fmtT(sess.durationMs)}</span>
            {verdict.pass ? "✓" : "✗"} {verdict.label}
          </div>
        )}
        {timedOut && <div className="row v-fail">✗ no response within 20s</div>}
      </div>
      <div className="mx-foot">
        <button className="btn" onClick={onReplay}>
          ↺ Replay
        </button>
      </div>
    </div>
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
