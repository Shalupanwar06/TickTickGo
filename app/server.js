// TickTickGo app server — no dependencies, port 3000.
// Serves the SPA from public/ and the fixture-backed API.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
// Repo layout keeps fixtures in ../fixtures; the Daytona build context
// flattens them next to server.js. Support both.
const FIXTURES = [path.join(__dirname, "..", "fixtures"), __dirname].find(
  (d) => fs.existsSync(path.join(d, "clusters.json"))
);
const PUBLIC = path.join(__dirname, "public");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

function json(res, obj, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name + ".json"), "utf8"));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (p === "/api/health") return json(res, { ok: true, app: "ticktickgo" });
    if (p === "/api/clusters") return json(res, fixture("clusters"));
    if (p === "/api/tickets") return json(res, fixture("tickets"));

    let m = p.match(/^\/api\/clusters\/([\w-]+)\/investigation\/stream$/);
    if (m) {
      // SSE replay of the persisted investigation: one step at a time,
      // then the analysis, so the UI streams the same way live or fixture.
      const inv = fixture("investigation");
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      let i = 0;
      const timer = setInterval(() => {
        if (i < inv.steps.length) {
          res.write(`event: step\ndata: ${JSON.stringify(inv.steps[i++])}\n\n`);
        } else {
          res.write(`event: analysis\ndata: ${JSON.stringify(inv.analysis)}\n\n`);
          res.write("event: done\ndata: {}\n\n");
          clearInterval(timer);
          res.end();
        }
      }, 900);
      req.on("close", () => clearInterval(timer));
      return;
    }

    m = p.match(/^\/api\/clusters\/([\w-]+)\/investigation$/);
    if (m) return json(res, fixture("investigation"));

    m = p.match(/^\/api\/clusters\/([\w-]+)\/drafts$/);
    if (m) return json(res, fixture("drafts"));

    m = p.match(/^\/api\/clusters\/([\w-]+)\/packet$/);
    if (m) return json(res, fixture("packet"));

    if (p.startsWith("/api/")) return json(res, { error: "not found" }, 404);

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
