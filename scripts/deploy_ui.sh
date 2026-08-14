#!/usr/bin/env bash
# Deploy the Next.js UI export (web/out) to the Daytona sandbox at /workspace/ui.
# The export contains subdirectories, which deploy.sh's flat sync can't carry, so
# this ships one gzipped tarball in argv-safe base64 chunks and untars remotely.
# Usage: scripts/deploy_ui.sh [sandbox-name]   (default: ticktickgo)
set -euo pipefail
cd "$(dirname "$0")/.."
SANDBOX="${1:-ticktickgo}"

[ -d web/out ] || { echo "web/out missing — run: cd web && npx next build"; exit 1; }

TMP=$(mktemp)
tar -czf "$TMP" -C web/out .
B64=$(base64 < "$TMP" | tr -d '\n')
rm -f "$TMP"
echo "ui tarball: $(( ${#B64} / 1024 )) KB base64"

daytona exec "$SANDBOX" -- "rm -f /tmp/ui.b64 && rm -rf /workspace/ui && mkdir -p /workspace/ui"

CHUNK=120000
for ((i = 0; i < ${#B64}; i += CHUNK)); do
  daytona exec "$SANDBOX" -- "printf %s ${B64:i:CHUNK} >> /tmp/ui.b64"
  echo "  chunk $((i / CHUNK + 1))/$(( (${#B64} + CHUNK - 1) / CHUNK ))"
done

daytona exec "$SANDBOX" -- "base64 -d /tmp/ui.b64 | tar -xzf - -C /workspace/ui && rm /tmp/ui.b64 && ls /workspace/ui | head -5"
echo "ui deployed — restart the server with scripts/deploy.sh (or it picks it up live: static reads per request)"
