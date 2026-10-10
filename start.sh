#!/usr/bin/env bash
# Start Pixel Workroom on macOS / Linux (start.bat does the same on Windows)
set -e
cd "$(dirname "$0")"
PORT="${PORT:-3333}"
export PORT

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install it from https://nodejs.org" >&2
  exit 1
fi
[ -d node_modules ] || { echo "Installing dependencies..."; npm install; }
command -v claude >/dev/null 2>&1 || echo 'Note: the "claude" CLI was not found. The Build button needs Claude Code (npm i -g @anthropic-ai/claude-code).'

echo "Pixel Workroom: http://localhost:$PORT  (Ctrl+C to stop)"
exec node src/server.mjs
