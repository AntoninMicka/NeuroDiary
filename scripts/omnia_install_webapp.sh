#!/bin/sh
set -eu

: "${REMOTE_DIR:?}" "${LXC_NAME:?}"
SOURCE_DIR="$REMOTE_DIR/source/deploy/turris"
LXC_IP="${LXC_IP:-$(lxc-info -n "$LXC_NAME" -iH 2>/dev/null | awk 'index($0, ":") == 0 { print; exit }')}"
case "$LXC_IP" in
  ''|*[!0-9.]*) echo "Nelze zjistit platnou IPv4 adresu LXC $LXC_NAME." >&2; exit 1 ;;
esac

for path in \
  "$SOURCE_DIR/40_neurodiary.json" \
  "$SOURCE_DIR/neurodiary.svg" \
  "$SOURCE_DIR/80-neurodiary.conf.in" \
  /etc/lighttpd/lighttpd.conf \
  /etc/lighttpd/conf.d/80-syncthing.conf; do
  [ -f "$path" ] || { echo "Chybí požadovaný vzor nebo soubor: $path" >&2; exit 1; }
done
command -v lighttpd >/dev/null || { echo "Chybí lighttpd." >&2; exit 1; }
curl -fsS --max-time 10 "http://$LXC_IP:8080/readyz" >/dev/null

STAGE="$(mktemp -d /tmp/neurodiary-webapp.XXXXXX)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT INT TERM
sed "s/@LXC_IP@/$LXC_IP/g" "$SOURCE_DIR/80-neurodiary.conf.in" >"$STAGE/80-neurodiary.conf"
cp "$SOURCE_DIR/40_neurodiary.json" "$STAGE/40_neurodiary.json"
cp "$SOURCE_DIR/neurodiary.svg" "$STAGE/neurodiary.svg"

mkdir -p /usr/share/turris-webapps /www/webapps-icons /etc/lighttpd/conf.d
for target in \
  /usr/share/turris-webapps/40_neurodiary.json \
  /www/webapps-icons/neurodiary.svg \
  /etc/lighttpd/conf.d/80-neurodiary.conf; do
  [ ! -e "$target" ] || cp -p "$target" "$STAGE/$(basename "$target").previous"
done
cp "$STAGE/40_neurodiary.json" /usr/share/turris-webapps/40_neurodiary.json
cp "$STAGE/neurodiary.svg" /www/webapps-icons/neurodiary.svg
cp "$STAGE/80-neurodiary.conf" /etc/lighttpd/conf.d/80-neurodiary.conf
chmod 0644 \
  /usr/share/turris-webapps/40_neurodiary.json \
  /www/webapps-icons/neurodiary.svg \
  /etc/lighttpd/conf.d/80-neurodiary.conf

if ! lighttpd -tt -f /etc/lighttpd/lighttpd.conf; then
  for target in \
    /usr/share/turris-webapps/40_neurodiary.json \
    /www/webapps-icons/neurodiary.svg \
    /etc/lighttpd/conf.d/80-neurodiary.conf; do
    previous="$STAGE/$(basename "$target").previous"
    if [ -e "$previous" ]; then cp -p "$previous" "$target"; else rm -f "$target"; fi
  done
  echo "Konfigurace lighttpd není validní; změny byly vráceny." >&2
  exit 1
fi

/etc/init.d/lighttpd reload
sleep 1
curl -kfsS --max-time 10 -o /dev/null "https://127.0.0.1/neurodiary/"
curl -kfsS --max-time 10 -o /dev/null "https://127.0.0.1/icons/neurodiary.svg"
grep -q '"id": "NeuroDiary"' /usr/share/turris-webapps/40_neurodiary.json
echo "Turris WebApps: NeuroDiary je dostupné přes /neurodiary/ (LXC $LXC_IP:8080)."
