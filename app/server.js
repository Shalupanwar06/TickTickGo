// TickTickGo app server — no dependencies, port 3000.
// Serves the SPA from public/ and the data API.
//
// Data source: if pipeline output (out/clusters.json) exists, serve the real
// pipeline; otherwise serve the frontend fixtures. FIXTURES=1 (env) or
// ?source=fixtures forces the fixture path — the demo-day fallback toggle.
// Pipeline shapes are mapped to the UI shapes HERE so the UI never changes.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

// Repo layout keeps fixtures in ../fixtures; the Daytona build context
// flattens them next to server.js. Support both.
const FIXTURES = [path.join(__dirname, "..", "fixtures"), __dirname].find(
  (d) => fs.existsSync(path.join(d, "clusters.json"))
);
// Same story for pipeline output and corpus (deploy.sh syncs them to
// /workspace/out and /workspace/pipeline-data on the sandbox).
const OUT = [path.join(__dirname, "..", "out"), path.join(__dirname, "out")].find(fs.existsSync);
const CORPUS = [
  path.join(__dirname, "..", "pipeline", "data", "tickets.json"),
  path.join(__dirname, "pipeline-data", "tickets.json"),
].find(fs.existsSync);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain" };

// Next.js UI static export (web/out locally; /workspace/ui on the sandbox).
const UI_DIR = [path.join(__dirname, "..", "web", "out"), path.join(__dirname, "ui")].find(fs.existsSync);

function json(res, obj, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fixture(name) {
  return readJson(path.join(FIXTURES, name + ".json"));
}

function usePipeline(url) {
  if (process.env.FIXTURES === "1") return false;
  if (url.searchParams.get("source") === "fixtures") return false;
  return Boolean(OUT && fs.existsSync(path.join(OUT, "clusters.json")));
}

function outJson(name) {
  const f = path.join(OUT, name);
  return fs.existsSync(f) ? readJson(f) : null;
}

/* ---- pipeline → UI shape mapping ---- */

function mapSteps(steps) {
  return (steps || []).map((s) => ({
    n: s.step,
    tool: s.tool,
    input: s.input,
    result_summary: s.result_summary,
  }));
}

function mapAnalysis(a) {
  if (!a) return null;
  return {
    common: a.common_factors,
    varies: a.variations,
    ruled_out: a.ruled_out,
    hypotheses: (a.hypotheses || []).map((h) => ({ ...h, status: "unconfirmed" })),
  };
}

function pipelineInvestigation(id) {
  const all = outJson("investigations.json");
  const inv = all && all[id];
  if (!inv) return null;
  return { steps: mapSteps(inv.steps), analysis: mapAnalysis(outJson(`analysis_${id}.json`)) };
}

function pipelineFix(id) {
  const f = outJson(`fix_${id}.json`);
  if (!f) return null;
  // Pipeline steps use "step" and carry extra keys (result, patched_content,
  // tool_calls_used); map into the seam shape the UI expects.
  return {
    cluster_id: f.cluster_id || id,
    steps: mapSteps(f.steps),
    summary: f.summary,
    diff: f.diff,
    check: f.check,
  };
}

/* ---- PM approval (in-memory; resets on restart, intentional for demo re-runs) ---- */

const approvals = {};

/* ---- server ---- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const live = usePipeline(url);

  try {
    if (p === "/api/health") return json(res, { ok: true, app: "ticktickgo" });
    if (p === "/api/meta") return json(res, { source: live ? "pipeline" : "fixtures" });
    if (p === "/api/clusters") return json(res, live ? outJson("clusters.json") : fixture("clusters"));
    if (p === "/api/tickets") {
      if (live && CORPUS) return json(res, readJson(CORPUS));
      return json(res, fixture("tickets"));
    }

    let m = p.match(/^\/api\/clusters\/([\w-]+)\/investigation\/stream$/);
    if (m) {
      // SSE replay: one step at a time, then the analysis, so the UI streams
      // the same way whether the data is live pipeline output or fixture.
      const inv = (live && pipelineInvestigation(m[1])) || fixture("investigation");
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      let i = 0;
      const timer = setInterval(() => {
        if (i < inv.steps.length) {
          res.write(`event: step\ndata: ${JSON.stringify(inv.steps[i++])}\n\n`);
        } else {
          if (inv.analysis) res.write(`event: analysis\ndata: ${JSON.stringify(inv.analysis)}\n\n`);
          res.write("event: done\ndata: {}\n\n");
          clearInterval(timer);
          res.end();
        }
      }, 900);
      req.on("close", () => clearInterval(timer));
      return;
    }

    m = p.match(/^\/api\/clusters\/([\w-]+)\/investigation$/);
    if (m) return json(res, (live && pipelineInvestigation(m[1])) || fixture("investigation"));

    m = p.match(/^\/api\/clusters\/([\w-]+)\/drafts$/);
    if (m) {
      const d = live && outJson(`drafts_${m[1]}.json`);
      return json(res, d || fixture("drafts"));
    }

    m = p.match(/^\/api\/clusters\/([\w-]+)\/packet$/);
    if (m) {
      if (live) {
        // Analysis emits a structured packet object; prefer it, fall back to
        // the markdown file, then to the fixture.
        const a = outJson(`analysis_${m[1]}.json`);
        if (a && a.packet) return json(res, { packet: a.packet });
        const f = path.join(OUT, `packet_${m[1]}.md`);
        if (fs.existsSync(f)) return json(res, { packet: { markdown: fs.readFileSync(f, "utf8") } });
      }
      return json(res, fixture("packet"));
    }

    m = p.match(/^\/api\/clusters\/([\w-]+)\/fix\/stream$/);
    if (m) {
      // SSE replay: one step at a time, then the patch, so the UI streams
      // the same way whether the data is live pipeline output or fixture.
      const fix =
        (live && pipelineFix(m[1])) ||
        (fs.existsSync(path.join(FIXTURES, "fix.json")) && fixture("fix"));
      if (!fix) return json(res, { error: "not found" }, 404);
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      let i = 0;
      const timer = setInterval(() => {
        if (i < fix.steps.length) {
          res.write(`event: step\ndata: ${JSON.stringify(fix.steps[i++])}\n\n`);
        } else {
          res.write(`event: patch\ndata: ${JSON.stringify({ summary: fix.summary, diff: fix.diff, check: fix.check })}\n\n`);
          res.write("event: done\ndata: {}\n\n");
          clearInterval(timer);
          res.end();
        }
      }, 900);
      req.on("close", () => clearInterval(timer));
      return;
    }

    m = p.match(/^\/api\/clusters\/([\w-]+)\/fix$/);
    if (m) {
      const fix =
        (live && pipelineFix(m[1])) ||
        (fs.existsSync(path.join(FIXTURES, "fix.json")) && fixture("fix"));
      return fix ? json(res, fix) : json(res, { error: "not found" }, 404);
    }

    m = p.match(/^\/api\/clusters\/([\w-]+)\/approval$/);
    if (m) {
      const id = m[1];
      if (req.method === "GET") return json(res, approvals[id] || { decision: "pending" });
      if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            return json(res, { error: "invalid json" }, 400);
          }
          const { decision, note } = parsed || {};
          if (decision !== "approved" && decision !== "returned") return json(res, { error: "bad decision" }, 400);
          approvals[id] = { decision, note: String(note || ""), at: new Date().toISOString() };
          return json(res, approvals[id]);
        });
        return;
      }
      return json(res, { error: "method not allowed" }, 405);
    }

    if (p.startsWith("/api/")) return json(res, { error: "not found" }, 404);

    // Next.js UI export mounted at /ui (basePath-built, trailingSlash layout).
    if (UI_DIR && (p === "/ui" || p.startsWith("/ui/"))) {
      let rel = decodeURIComponent(p.slice(3) || "/"); // Next chunk paths contain literal [id]
      let uiFile = path.normalize(path.join(UI_DIR, rel === "/" ? "index.html" : rel));
      if (uiFile.startsWith(UI_DIR)) {
        if (fs.existsSync(uiFile) && fs.statSync(uiFile).isDirectory()) uiFile = path.join(uiFile, "index.html");
        if (!fs.existsSync(uiFile)) uiFile = path.join(UI_DIR, "404.html");
        if (fs.existsSync(uiFile)) {
          res.writeHead(200, { "Content-Type": MIME[path.extname(uiFile)] || "application/octet-stream" });
          return res.end(fs.readFileSync(uiFile));
        }
      }
    }

    // Static files; SPA fallback to index.html.
    let file = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : p));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) file = path.join(PUBLIC, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "text/plain" });
    res.end(fs.readFileSync(file));
  } catch (err) {
    console.error(err);
    json(res, { error: String(err) }, 500);
  }
});

server.listen(PORT, () => console.log(`ticktickgo listening on :${PORT}`));
