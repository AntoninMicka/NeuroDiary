#!/usr/bin/env bash
set -euo pipefail
: "${REMOTE_DIR:?}" "${LXC_NAME:?}"
command -v lxc-attach >/dev/null || { echo "Chybí lxc-attach."; exit 1; }
lxc-info -n "${LXC_NAME}" >/dev/null || { echo "LXC ${LXC_NAME} neexistuje."; exit 1; }
if ! lxc-info -n "${LXC_NAME}" -sH | grep -qx RUNNING; then
  lxc-start -n "${LXC_NAME}"
fi

lxc-attach -n "${LXC_NAME}" -- mkdir -p /opt/neurodiary /var/lib/neurodiary /etc/neurodiary
tar -C "${REMOTE_DIR}/lxc-bundle" -cf - . | lxc-attach -n "${LXC_NAME}" -- tar -C /opt/neurodiary -xf -
cat "${REMOTE_DIR}/config/users.json" | lxc-attach -n "${LXC_NAME}" -- sh -c \
  'umask 077; cat > /etc/neurodiary/users.json'

lxc-attach -n "${LXC_NAME}" -- sh -c \
  'export DEBIAN_FRONTEND=noninteractive; apt-get update; apt-get install -y python3 python3-venv python3-pip ca-certificates curl libatomic1 build-essential cargo rustc pkg-config libssl-dev libffi-dev; python3 -m venv /opt/neurodiary/.venv; /opt/neurodiary/.venv/bin/pip install --upgrade pip setuptools wheel; /opt/neurodiary/.venv/bin/pip install --no-cache-dir -r /opt/neurodiary/backend/requirements.txt'

if ! lxc-attach -n "${LXC_NAME}" -- test -s /etc/neurodiary/session-secret; then
  head -c 48 /dev/urandom | base64 | lxc-attach -n "${LXC_NAME}" -- sh -c \
    'umask 077; tr -d "\r\n" > /etc/neurodiary/session-secret'
fi
cat "${REMOTE_DIR}/source/deploy/turris/neurodiary.service" | lxc-attach -n "${LXC_NAME}" -- sh -c \
  'cat > /etc/systemd/system/neurodiary.service'
lxc-attach -n "${LXC_NAME}" -- systemctl daemon-reload
lxc-attach -n "${LXC_NAME}" -- systemctl enable --now neurodiary.service
lxc-attach -n "${LXC_NAME}" -- systemctl restart neurodiary.service
lxc-attach -n "${LXC_NAME}" -- sh -c \
  'for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:8080/readyz && exit 0; sleep 1; done; journalctl -u neurodiary.service -n 30 --no-pager; exit 1'

LXC_ADDRESS="$(lxc-info -n "${LXC_NAME}" -iH | awk 'index($0, ":") == 0 {print; exit}')"
echo "NeuroDiary v LXC běží na http://${LXC_ADDRESS}:8080"
