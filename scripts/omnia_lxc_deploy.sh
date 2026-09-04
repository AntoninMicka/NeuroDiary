#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/omnia.env}"
[[ -f "${ENV_FILE}" ]] || { echo "Chybí ${ENV_FILE}."; exit 1; }
# shellcheck disable=SC1090
source "${ENV_FILE}"
: "${OMNIA_HOST:?}" "${REMOTE_DIR:?}" "${LXC_NAME:?}"
command -v npm >/dev/null || { echo "Lokálně chybí npm."; exit 1; }

# Jedna sdílená SSH relace zabrání opakovanému dotazu na heslo pro každý rsync/ssh krok.
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

npm --prefix "${REPO_ROOT}" run build
"${SSH_REMOTE[@]}" "mkdir -p '${REMOTE_DIR}/source/scripts' '${REMOTE_DIR}/lxc-bundle/backend' '${REMOTE_DIR}/lxc-bundle/frontend-dist'"
rsync -e "${RSYNC_SSH}" -az --delete "${REPO_ROOT}/backend/" "${OMNIA_HOST}:${REMOTE_DIR}/lxc-bundle/backend/"
rsync -e "${RSYNC_SSH}" -az --delete "${REPO_ROOT}/dist/" "${OMNIA_HOST}:${REMOTE_DIR}/lxc-bundle/frontend-dist/"
rsync -e "${RSYNC_SSH}" -az "${REPO_ROOT}/deploy/" "${OMNIA_HOST}:${REMOTE_DIR}/source/deploy/"
rsync -e "${RSYNC_SSH}" -az "${SCRIPT_DIR}/omnia_lxc_remote_deploy.sh" "${OMNIA_HOST}:${REMOTE_DIR}/source/scripts/"
"${SSH_REMOTE[@]}" env REMOTE_DIR="${REMOTE_DIR}" LXC_NAME="${LXC_NAME}" \
  bash "${REMOTE_DIR}/source/scripts/omnia_lxc_remote_deploy.sh"
