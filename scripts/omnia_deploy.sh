#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/omnia.env}"
[[ -f "${ENV_FILE}" ]] || { echo "Chybí ${ENV_FILE}; zkopírujte omnia.env.example."; exit 1; }
# shellcheck disable=SC1090
source "${ENV_FILE}"
: "${OMNIA_HOST:?}" "${REMOTE_DIR:?}" "${LAN_IP:?}" "${APP_PORT:?}"

ssh "${OMNIA_HOST}" "mkdir -p '${REMOTE_DIR}/source' '${REMOTE_DIR}/data' '${REMOTE_DIR}/config'"
rsync -az --delete \
  --exclude='.git' --exclude='node_modules' --exclude='backend/data' --exclude='scripts/*.env' \
  "${REPO_ROOT}/" "${OMNIA_HOST}:${REMOTE_DIR}/source/"
ssh "${OMNIA_HOST}" env \
  REMOTE_DIR="${REMOTE_DIR}" LAN_IP="${LAN_IP}" ZEROTIER_IP="${ZEROTIER_IP:-}" \
  APP_PORT="${APP_PORT}" CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-podman}" \
  IMAGE_NAME="${IMAGE_NAME:-neurodiary:local}" CONTAINER_NAME="${CONTAINER_NAME:-neurodiary}" \
  bash "${REMOTE_DIR}/source/scripts/omnia_remote_deploy.sh"
