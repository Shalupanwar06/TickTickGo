// Same-origin API (served by app/server.js). The UI is exported statically and
// mounted at /ui by the same server, so bare /api/* paths always resolve.
export const API = "";

export async function fetchJSON(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

export function relTime(iso, now) {
  const t = new Date(iso).getTime();
  const ref = now ? new Date(now).getTime() : Date.now();
  const m = Math.round((ref - t) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Rising heuristic mirrored from the vanilla app: half the cluster's tickets
// within 24h of the batch's newest ticket.
export function isRising(cluster, ticketsById, newest) {
  const known = cluster.ticket_ids.map((id) => ticketsById.get(id)).filter(Boolean);
  if (known.length < 2) return false;
  const cutoff = new Date(newest).getTime() - 24 * 3600 * 1000;
  const recent = known.filter((t) => new Date(t.created_at).getTime() >= cutoff);
  return recent.length * 2 >= known.length;
}
