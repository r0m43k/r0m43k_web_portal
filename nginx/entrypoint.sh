#!/bin/sh
set -eu

DOMAIN="r0m43k.live"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
CONF_DST="/etc/nginx/conf.d/default.conf"

if [ -f "$CERT" ]; then
  echo "[gateway] cert found -> https config"
  cp -f /etc/nginx/confs/default.https.conf "$CONF_DST"
else
  echo "[gateway] cert not found -> http config"
  cp -f /etc/nginx/confs/default.http.conf "$CONF_DST"
fi

exec nginx -g "daemon off;"
