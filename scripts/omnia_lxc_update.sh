#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${1:-$SCRIPT_DIR/omnia.env}"
[[ -f "$ENV_FILE" ]] || { echo "Chybí $ENV_FILE."; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${OMNIA_HOST:?}" "${REMOTE_DIR:?}" "${LXC_NAME:?}"
[[ "${CONTAINER_RUNTIME:-}" == lxc ]] || { echo "Rychlý update je určený pro LXC."; exit 1; }
command -v npm >/dev/null || { echo "Lokálně chybí npm."; exit 1; }
: "${LXC_ZEROTIER_IP:?V omnia.env chybí LXC_ZEROTIER_IP}"
TLS_DIR="$REPO_ROOT/secrets/tls"
bash "$SCRIPT_DIR/generate_local_ca.sh" "$ENV_FILE"

OWNS_SSH_SESSION=false
if [[ -z "${SSH_CONTROL_PATH:-}" || ! -S "$SSH_CONTROL_PATH" ]]; then
  SSH_CONTROL_DIR="$(mktemp -d)"; SSH_CONTROL_PATH="$SSH_CONTROL_DIR/socket"; OWNS_SSH_SESSION=true
  echo "Připojuji se k Omnii..."
  ssh -M -S "$SSH_CONTROL_PATH" -o ControlPersist=10m -o ConnectTimeout=10 -fN "$OMNIA_HOST"
fi
cleanup() {
  if [[ "$OWNS_SSH_SESSION" == true ]]; then
    ssh -S "$SSH_CONTROL_PATH" -O exit "$OMNIA_HOST" >/dev/null 2>&1 || true
    rm -rf "$SSH_CONTROL_DIR"
  fi
}
trap cleanup EXIT
REMOTE=(ssh -S "$SSH_CONTROL_PATH" "$OMNIA_HOST")
RSYNC_SSH="ssh -S $SSH_CONTROL_PATH"

echo "Sestavuji frontend..."
NEURODIARY_BASE_PATH=/neurodiary/ NEURODIARY_CA_CERT_URL=/neurodiary/ca.crt npm --prefix "$REPO_ROOT" run build
"${REMOTE[@]}" "mkdir -p '$REMOTE_DIR/lxc-update-bundle/backend' '$REMOTE_DIR/lxc-update-bundle/frontend-dist' '$REMOTE_DIR/source/scripts'"
rsync -e "$RSYNC_SSH" -az --delete --exclude='__pycache__' --exclude='*.pyc' \
  "$REPO_ROOT/backend/" "$OMNIA_HOST:$REMOTE_DIR/lxc-update-bundle/backend/"
rsync -e "$RSYNC_SSH" -az --delete "$REPO_ROOT/dist/" \
  "$OMNIA_HOST:$REMOTE_DIR/lxc-update-bundle/frontend-dist/"
rsync -e "$RSYNC_SSH" -az "$SCRIPT_DIR/omnia_lxc_update_remote.sh" \
  "$OMNIA_HOST:$REMOTE_DIR/source/scripts/"
rsync -e "$RSYNC_SSH" -az "$REPO_ROOT/deploy/" "$OMNIA_HOST:$REMOTE_DIR/source/deploy/"
rsync -e "$RSYNC_SSH" -az "$SCRIPT_DIR/omnia_install_webapp.sh" \
  "$OMNIA_HOST:$REMOTE_DIR/source/scripts/"
rsync -e "$RSYNC_SSH" -az "$SCRIPT_DIR/omnia_install_lxc_https.sh" \
  "$OMNIA_HOST:$REMOTE_DIR/source/scripts/"
"${REMOTE[@]}" "rm -rf '$REMOTE_DIR/tls-stage' && mkdir -p '$REMOTE_DIR/tls-stage' && chmod 700 '$REMOTE_DIR/tls-stage'"
rsync -e "$RSYNC_SSH" -az "$TLS_DIR/neurodiary-ca.crt" "$TLS_DIR/neurodiary-server.crt" "$TLS_DIR/neurodiary-server.key" \
  "$OMNIA_HOST:$REMOTE_DIR/tls-stage/"
"${REMOTE[@]}" env REMOTE_DIR="$REMOTE_DIR" LXC_NAME="$LXC_NAME" \
  bash "$REMOTE_DIR/source/scripts/omnia_lxc_update_remote.sh"
"${REMOTE[@]}" env REMOTE_DIR="$REMOTE_DIR" LXC_NAME="$LXC_NAME" LXC_IP="$LXC_IP" LXC_ZEROTIER_IP="$LXC_ZEROTIER_IP" ZEROTIER_IP="$ZEROTIER_IP" \
  bash "$REMOTE_DIR/source/scripts/omnia_install_lxc_https.sh"
"${REMOTE[@]}" env REMOTE_DIR="$REMOTE_DIR" LXC_NAME="$LXC_NAME" LXC_IP="${LXC_IP:-}" \
  sh "$REMOTE_DIR/source/scripts/omnia_install_webapp.sh"

SSH_CONTROL_PATH="$SSH_CONTROL_PATH" bash "$SCRIPT_DIR/omnia_status.sh" "$ENV_FILE"
