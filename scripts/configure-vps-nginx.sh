#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Exécute ce script en root sur le VPS."
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: $0 <tunnel_url_https> [server_name]"
  exit 1
fi

TUNNEL_URL="$1"
SERVER_NAME="${2:-_}"
TUNNEL_HOST="$(printf '%s' "$TUNNEL_URL" | sed -E 's#^https?://([^/]+)/?.*$#\1#')"
CONF_PATH="/etc/nginx/sites-available/iptv-player"
ENABLED_PATH="/etc/nginx/sites-enabled/iptv-player"

if ! command -v nginx >/dev/null 2>&1; then
  apt-get update
  apt-get install -y nginx
fi

cat > "$CONF_PATH" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    location / {
        proxy_pass ${TUNNEL_URL};
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_set_header Host ${TUNNEL_HOST};
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
EOF

ln -sf "$CONF_PATH" "$ENABLED_PATH"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx || systemctl restart nginx

echo "Nginx configuré pour proxy_pass vers ${TUNNEL_URL}"
