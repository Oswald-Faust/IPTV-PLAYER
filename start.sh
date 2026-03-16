#!/bin/bash
# ─────────────────────────────────────────────────────────
#  Démarrage IPTV Player + Tunnel ngrok permanent
#  Usage : ./start.sh
# ─────────────────────────────────────────────────────────

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "══════════════════════════════════════"
echo "  StreamPlayer IPTV — Démarrage"
echo "══════════════════════════════════════"
echo ""

# ── 1. Charger les variables d'environnement ──────────────
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi
PORT="${PORT:-3000}"

# ── 2. Vérifier les outils ────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "❌ Node.js introuvable → https://nodejs.org"
  exit 1
fi
if ! command -v ngrok &> /dev/null; then
  echo "❌ ngrok introuvable → https://ngrok.com/download"
  exit 1
fi

# ── 3. Démarrer le serveur Node.js ────────────────────────
if lsof -i ":$PORT" -sTCP:LISTEN -t &>/dev/null; then
  echo "ℹ️  Serveur déjà actif sur le port $PORT"
else
  echo "▶ Démarrage du serveur Node.js (port $PORT)…"
  node server.js &
  NODE_PID=$!
  echo "  PID serveur : $NODE_PID"
  sleep 2
fi

# ── 4. Démarrer le tunnel ngrok ───────────────────────────
echo "▶ Démarrage du tunnel ngrok…"
ngrok start iptv --config "$DIR/ngrok.yml" --log stdout --log-format json > /tmp/ngrok-iptv.log 2>&1 &
NGROK_PID=$!
sleep 4

# ── 5. Récupérer l'URL publique ───────────────────────────
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(t['public_url']) for t in d.get('tunnels',[]) if t.get('proto')=='https']" 2>/dev/null)

echo ""
echo "══════════════════════════════════════"
if [ -n "$PUBLIC_URL" ]; then
  echo "  ✅ StreamPlayer accessible ici :"
  echo ""
  echo "     $PUBLIC_URL"
  echo ""
  echo "  Partage ce lien avec ton client !"
else
  echo "  ⚠️  Impossible de récupérer l'URL automatiquement."
  echo "  → Ouvre http://localhost:4040 pour la voir"
fi
echo "══════════════════════════════════════"
echo ""
echo "  Ctrl+C pour tout arrêter"
echo ""

# ── 6. Nettoyage à l'arrêt ────────────────────────────────
trap "echo ''; echo 'Arrêt en cours…'; kill $NGROK_PID 2>/dev/null; [ -n \"$NODE_PID\" ] && kill $NODE_PID 2>/dev/null; exit 0" INT TERM
wait $NGROK_PID
