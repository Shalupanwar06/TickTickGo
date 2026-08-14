"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJSON, relTime, isRising } from "../lib/api";

export default function Board() {
  const [data, setData] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([fetchJSON("/api/clusters"), fetchJSON("/api/tickets")])
      .then(([c, t]) => {
        setData(c);
        setTickets(t.tickets || []);
      })
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  const ticketsById = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const newest = useMemo(
    () => tickets.reduce((m, t) => (t.created_at > m ? t.created_at : m), "1970-01-01"),
    [tickets],
  );

  if (err) return <p className="error-note">API unreachable: {err}</p>;
  if (!data)
    return (
      <div className="spinner-row" style={{ marginTop: 60 }}>
        <span className="spinner" /> Loading batch…
      </div>
    );

  const clusters = data.clusters || [];
  const grouped = clusters.reduce((n, c) => n + c.ticket_ids.length, 0);
  const topCustomers = clusters[0]?.customer_count ?? 0;
  const maxScore = Math.max(...clusters.map((c) => c.score), 1);

  return (
    <main>
      <section className="hero">
        <p className="kicker">batch triage · one week of support noise</p>
        <h1>
          {tickets.length || grouped} tickets walked in.
          <br />
          <span className="fade">{clusters.length} problems walked out — ranked by who&apos;s hurting.</span>
        </h1>
        <p className="sub">
          Same bugs, different words. TickTickGo reads the whole batch together, groups reports
          that share no vocabulary, investigates the worst one, and hands engineering a fix — with
          a human signing off at the end.
        </p>
        <FlowStepper />
        <div className="statrow">
          <Stat n={tickets.length || "—"} l="tickets in" />
          <Stat n={clusters.length} l="real problems" />
          <Stat n={topCustomers} l="customers on #1" />
          <Stat n={(data.ungrouped_ids || []).length} l="one-offs" />
        </div>
      </section>

      <section className="board">
        {clusters.map((c, i) => (
          <a
            key={c.id}
            className="cluster-card"
            href={`/ui/cluster/${c.id}/`}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="rank mono">{String(i + 1).padStart(2, "0")}</div>
            <div>
              <h3>{c.name}</h3>
              <div className="meta">
                <span className="mono">{c.ticket_ids.length} tickets</span>
                <span>first seen {relTime(c.first_seen, newest)}</span>
                <span className="meter" aria-label={`score ${c.score}`}>
                  <div style={{ width: `${Math.round((c.score / maxScore) * 100)}%` }} />
                </span>
                <span className="mono" style={{ color: "var(--faint)" }}>
                  score {c.score}
                </span>
                {isRising(c, ticketsById, newest) && (
                  <span className="badge badge-rising">
                    <span className="dot" /> rising
                  </span>
                )}
              </div>
            </div>
            <div className="impact">
              <div className="n">{c.customer_count}</div>
              <div className="l">customers affected</div>
            </div>
          </a>
        ))}
        <div className="remainder">
          {(data.ungrouped_ids || []).length} tickets didn&apos;t match a pattern — feature requests,
          questions, one-offs. They wait; these don&apos;t.
        </div>
      </section>
    </main>
  );
}

const FLOW = [
  { label: "Storefront issue", href: "/storefront.html" },
  { label: "Ticket filed" },
  { label: "Triaged", href: "#" },
  { label: "Fix built" },
  { label: "Verified on devices" },
  { label: "Signed off" },
];

function FlowStepper() {
  return (
    <div className="flow-stepper" aria-label="How a report becomes a shipped fix">
      {FLOW.map((s, i) => (
        <span className="flow-node" key={s.label}>
          {i > 0 && <span className="flow-line" aria-hidden="true" />}
          <span className="fdot" aria-hidden="true" />
          {s.href ? (
            <a className="flabel" href={s.href}>{s.label}</a>
          ) : (
            <span className="flabel">{s.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function Stat({ n, l }) {
  return (
    <div className="stat">
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}
