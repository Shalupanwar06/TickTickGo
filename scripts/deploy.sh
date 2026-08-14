#!/usr/bin/env bash
# Sync app/ and fixtures/ into the running Daytona sandbox and restart the
# server. Fast iteration path — no image rebuild, preview URL stays stable.
# Usage: scripts/deploy.sh [sandbox-name]  (default: ticktickgo)
set -euo pipefail
cd "$(dirname "$0")/.."
SANDBOX="${1:-ticktickgo}"

# The sandbox uses the flattened layout: app/* and fixtures/* both at /workspace.
sync_file() { # local_path remote_path
  local b64 rdir
  b64=$(base64 < "$1" | tr -d '\n')
  rdir=$(dirname "$2")
  # daytona exec re-joins argv and the remote bash re-parses it, so pass the
  # shell line directly — no sh -c wrapper (it would get word-split).
  daytona exec "$SANDBOX" -- "mkdir -p $rdir && echo $b64 | base64 -d > $2"
  echo "  synced $1 -> $2"
}

for f in app/server.js app/healthcheck.js; do
  sync_file "$f" "/workspace/$(basename "$f")"
done
for f in app/public/*; do
  sync_file "$f" "/workspace/public/$(basename "$f")"
done
for f in fixtures/*.json; do
  sync_file "$f" "/workspace/$(basename "$f")"
done
# Pipeline output + corpus, when they exist (post-integration).
if [ -d out ]; then
  for f in out/*; do
    sync_file "$f" "/workspace/out/$(basename "$f")"
  done
fi
if [ -f pipeline/data/tickets.json ]; then
  sync_file pipeline/data/tickets.json /workspace/pipeline-data/tickets.json
fi

# node:20-slim has no pkill/ps, so track the server with a PID file.
daytona exec "$SANDBOX" -- 'kill $(cat /tmp/app.pid 2>/dev/null) 2>/dev/null; sleep 0.3; cd /workspace && (nohup node server.js > /tmp/app.log 2>&1 & echo $! > /tmp/app.pid) && sleep 1 && node /workspace/healthcheck.js && grep -c listening /tmp/app.log'
