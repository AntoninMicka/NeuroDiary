#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/omnia.env}"
[[ -f "${ENV_FILE}" ]] || { echo "Chybí ${ENV_FILE}; zkopírujte omnia.env.example."; exit 1; }
# shellcheck disable=SC1090
source "${ENV_FILE}"
: "${OMNIA_HOST:?}" "${REMOTE_DIR:?}" "${LAN_IP:?}" "${APP_PORT:?}"

SSH_CONTROL_DIR="$(mktemp -d)"
SSH_CONTROL_PATH="${SSH_CONTROL_DIR}/socket"
cleanup_ssh() {
  ssh -S "${SSH_CONTROL_PATH}" -O exit "${OMNIA_HOST}" >/dev/null 2>&1 || true
  rm -rf "${SSH_CONTROL_DIR}"
}
trap cleanup_ssh EXIT
echo "Navazuji sdílené SSH spojení (heslo bude vyžádáno nejvýše jednou)..."
ssh -M -S "${SSH_CONTROL_PATH}" -o ControlPersist=10m -o ConnectTimeout=10 -fN "${OMNIA_HOST}"
SSH_REMOTE=(ssh -S "${SSH_CONTROL_PATH}" "${OMNIA_HOST}")
RSYNC_SSH="ssh -S ${SSH_CONTROL_PATH}"

"${SSH_REMOTE[@]}" "mkdir -p '${REMOTE_DIR}/source' '${REMOTE_DIR}/data' '${REMOTE_DIR}/config'"
rsync -e "${RSYNC_SSH}" -az --delete \
  --exclude='.git' --exclude='node_modules' --exclude='backend/data' --exclude='scripts/*.env' \
  "${REPO_ROOT}/" "${OMNIA_HOST}:${REMOTE_DIR}/source/"
"${SSH_REMOTE[@]}" env \
  REMOTE_DIR="${REMOTE_DIR}" LAN_IP="${LAN_IP}" ZEROTIER_IP="${ZEROTIER_IP:-}" \
  APP_PORT="${APP_PORT}" CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-podman}" \
  IMAGE_NAME="${IMAGE_NAME:-neurodiary:local}" CONTAINER_NAME="${CONTAINER_NAME:-neurodiary}" \
  bash "${REMOTE_DIR}/source/scripts/omnia_remote_deploy.sh"
