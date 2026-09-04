#!/usr/bin/env bash
set -euo pipefail
: "${REMOTE_DIR:?}" "${LXC_NAME:?}" "${LXC_IP:?}" "${LXC_ZEROTIER_IP:?}" "${ZEROTIER_IP:?}"

TLS_STAGE="$REMOTE_DIR/tls-stage"
cleanup() { rm -rf "$TLS_STAGE"; }
trap cleanup EXIT
for file in neurodiary-ca.crt neurodiary-server.crt neurodiary-server.key; do
  [[ -s "$TLS_STAGE/$file" ]] || { echo "Chybí TLS soubor $TLS_STAGE/$file." >&2; exit 1; }
done
[[ -s "$REMOTE_DIR/source/deploy/turris/neurodiary-nginx.conf" ]] || { echo "Chybí nginx konfigurace." >&2; exit 1; }
[[ -s "$REMOTE_DIR/source/deploy/turris/neurodiary.service" ]] || { echo "Chybí systemd služba." >&2; exit 1; }

lxc-attach -n "$LXC_NAME" -- sh -c '
  set -eu
  if ! command -v nginx >/dev/null || ! command -v openssl >/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y nginx-light openssl
  fi
  mkdir -p /etc/neurodiary/tls /etc/nginx/conf.d
'

tar -C "$TLS_STAGE" -cf - neurodiary-ca.crt neurodiary-server.crt neurodiary-server.key | \
  lxc-attach -n "$LXC_NAME" -- tar -C /etc/neurodiary/tls -xf -
cat "$REMOTE_DIR/source/deploy/turris/neurodiary-nginx.conf" | \
  lxc-attach -n "$LXC_NAME" -- sh -c 'cat > /etc/nginx/conf.d/neurodiary.conf'
cat "$REMOTE_DIR/source/deploy/turris/neurodiary.service" | \
  lxc-attach -n "$LXC_NAME" -- sh -c 'cat > /etc/systemd/system/neurodiary.service'
lxc-attach -n "$LXC_NAME" -- sh -c '
  set -eu
  mv /etc/neurodiary/tls/neurodiary-ca.crt /etc/neurodiary/tls/ca.crt
  mv /etc/neurodiary/tls/neurodiary-server.crt /etc/neurodiary/tls/server.crt
  mv /etc/neurodiary/tls/neurodiary-server.key /etc/neurodiary/tls/server.key
  chmod 755 /etc/neurodiary/tls
  chmod 644 /etc/neurodiary/tls/ca.crt /etc/neurodiary/tls/server.crt
  chmod 600 /etc/neurodiary/tls/server.key
  openssl x509 -in /etc/neurodiary/tls/ca.crt -noout >/dev/null
  openssl x509 -in /etc/neurodiary/tls/server.crt -noout >/dev/null
  openssl verify -CAfile /etc/neurodiary/tls/ca.crt /etc/neurodiary/tls/server.crt
  test "$(openssl x509 -in /etc/neurodiary/tls/server.crt -pubkey -noout | openssl sha256)" = "$(openssl pkey -in /etc/neurodiary/tls/server.key -pubout | openssl sha256)"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl daemon-reload
  systemctl enable nginx
  systemctl restart neurodiary.service
  systemctl restart nginx
  for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -fsS --max-time 2 http://127.0.0.1:8080/readyz >/dev/null 2>&1 && exit 0
    sleep 1
  done
  exit 1
'
lxc-attach -n "$LXC_NAME" -- curl -fsS --max-time 10 \
  --cacert /etc/neurodiary/tls/ca.crt \
  --resolve "$ZEROTIER_IP:443:127.0.0.1" \
  "https://$ZEROTIER_IP/neurodiary/readyz" >/dev/null
lxc-attach -n "$LXC_NAME" -- curl -fsS --max-time 10 \
  --cacert /etc/neurodiary/tls/ca.crt \
  --resolve "$ZEROTIER_IP:443:127.0.0.1" \
  "https://$ZEROTIER_IP/neurodiary/ca.crt" >/dev/null
echo "HTTPS NeuroDiary je dostupné na https://$ZEROTIER_IP/neurodiary/"
echo "Veřejný certifikát CA lze stáhnout z https://$ZEROTIER_IP/neurodiary/ca.crt"
echo "Pro první instalaci bez důvěryhodného TLS také z http://$LXC_IP:8080/neurodiary/ca.crt"
lxc-attach -n "$LXC_NAME" -- openssl x509 -in /etc/neurodiary/tls/ca.crt -noout -fingerprint -sha256
