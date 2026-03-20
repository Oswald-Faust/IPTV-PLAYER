#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

PORT="${PORT:-3333}"
LOG_DIR="${DIR}/.runtime"
NODE_LOG="${LOG_DIR}/node.log"
NGROK_LOG="${LOG_DIR}/ngrok.log"
URL_FILE="${LOG_DIR}/public-url.txt"

mkdir -p "$LOG_DIR"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Commande introuvable: $1"
    exit 1
  fi
}

require node
require curl
require python3
require ngrok

if [ ! -d node_modules ]; then
  npm install
fi

if ! lsof -i ":$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  nohup node server.js >"$NODE_LOG" 2>&1 &
  echo $! > "${LOG_DIR}/node.pid"
  sleep 2
fi

pkill -f "ngrok.*${PORT}" >/dev/null 2>&1 || true
nohup ngrok http "$PORT" --log stdout --log-format json >"$NGROK_LOG" 2>&1 &
echo $! > "${LOG_DIR}/ngrok.pid"

PUBLIC_URL=""
for _ in $(seq 1 15); do
  PUBLIC_URL=$(
    curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((t['public_url'] for t in d.get('tunnels', []) if t.get('proto') == 'https'), ''))" 2>/dev/null || true
  )
  if [ -n "$PUBLIC_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$PUBLIC_URL" ]; then
  echo "Tunnel ngrok lancé, mais URL publique introuvable. Consulte $NGROK_LOG"
  exit 1
fi

printf '%s\n' "$PUBLIC_URL" > "$URL_FILE"
echo "$PUBLIC_URL"
