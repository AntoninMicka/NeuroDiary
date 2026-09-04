#!/usr/bin/env bash
set -euo pipefail
: "${REMOTE_DIR:?}" "${LXC_NAME:?}"
command -v lxc-attach >/dev/null || { echo "Chybí lxc-attach."; exit 1; }
[[ "$(lxc-info -n "$LXC_NAME" -sH 2>/dev/null)" == "RUNNING" ]] || {
  echo "LXC $LXC_NAME neběží."; exit 1;
}
lxc-attach -n "$LXC_NAME" -- test -x /opt/neurodiary/.venv/bin/uvicorn || {
  echo "Chybí hotová instalace NeuroDiary; nejdřív spusťte plný deploy."; exit 1;
}

STAGE=/opt/neurodiary-update
lxc-attach -n "$LXC_NAME" -- rm -rf "$STAGE"
lxc-attach -n "$LXC_NAME" -- mkdir -p "$STAGE"
tar -C "$REMOTE_DIR/lxc-update-bundle" -cf - backend frontend-dist | \
  lxc-attach -n "$LXC_NAME" -- tar -C "$STAGE" -xf -

lxc-attach -n "$LXC_NAME" -- sh -c '
  set -eu
  systemctl stop neurodiary.service
  rm -rf /opt/neurodiary/backend.previous /opt/neurodiary/frontend-dist.previous
  mv /opt/neurodiary/backend /opt/neurodiary/backend.previous
  mv /opt/neurodiary/frontend-dist /opt/neurodiary/frontend-dist.previous
  mv /opt/neurodiary-update/backend /opt/neurodiary/backend
  mv /opt/neurodiary-update/frontend-dist /opt/neurodiary/frontend-dist
  if systemctl start neurodiary.service; then
    exit 0
  fi
  rm -rf /opt/neurodiary/backend /opt/neurodiary/frontend-dist
  mv /opt/neurodiary/backend.previous /opt/neurodiary/backend
  mv /opt/neurodiary/frontend-dist.previous /opt/neurodiary/frontend-dist
  systemctl start neurodiary.service
  exit 1
'

if lxc-attach -n "$LXC_NAME" -- sh -c \
  'for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:8080/readyz && exit 0; sleep 1; done; exit 1'; then
  lxc-attach -n "$LXC_NAME" -- rm -rf \
    /opt/neurodiary/backend.previous /opt/neurodiary/frontend-dist.previous /opt/neurodiary-update
  echo
  echo "Rychlá aktualizace NeuroDiary byla dokončena."
else
  echo "Healthcheck nové verze selhal, vracím předchozí aplikaci..." >&2
  lxc-attach -n "$LXC_NAME" -- sh -c '
    systemctl stop neurodiary.service || true
    rm -rf /opt/neurodiary/backend /opt/neurodiary/frontend-dist
    mv /opt/neurodiary/backend.previous /opt/neurodiary/backend
    mv /opt/neurodiary/frontend-dist.previous /opt/neurodiary/frontend-dist
    systemctl start neurodiary.service
  '
  exit 1
fi
