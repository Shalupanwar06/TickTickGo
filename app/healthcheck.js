// Used by scripts/deploy.sh — avoids inline JS quoting through daytona exec.
fetch("http://localhost:3000/api/health")
  .then((r) => r.text())
  .then((t) => console.log("server up:", t))
  .catch((e) => {
    console.error("server DOWN:", e.message);
    process.exit(1);
  });
