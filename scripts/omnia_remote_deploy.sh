#!/usr/bin/env bash
set -euo pipefail
: "${REMOTE_DIR:?}" "${LAN_IP:?}" "${APP_PORT:?}" "${CONTAINER_RUNTIME:?}" "${IMAGE_NAME:?}" "${CONTAINER_NAME:?}"
command -v "${CONTAINER_RUNTIME}" >/dev/null || { echo "Chybí runtime ${CONTAINER_RUNTIME}."; exit 1; }
mkdir -p "${REMOTE_DIR}/data" "${REMOTE_DIR}/config"
chmod 700 "${REMOTE_DIR}/data" "${REMOTE_DIR}/config"
USERS_FILE="${REMOTE_DIR}/config/users.json"
SECRET_FILE="${REMOTE_DIR}/config/session-secret"
[[ -f "${USERS_FILE}" ]] || { echo "Chybí ${USERS_FILE}. Nejdřív vytvořte účet příkazem z dokumentace."; exit 1; }
if [[ ! -f "${SECRET_FILE}" ]]; then
  umask 077
  head -c 48 /dev/urandom | base64 > "${SECRET_FILE}"
fi
SESSION_SECRET="$(tr -d '\r\n' < "${SECRET_FILE}")"

"${CONTAINER_RUNTIME}" build -t "${IMAGE_NAME}" "${REMOTE_DIR}/source"
if "${CONTAINER_RUNTIME}" container exists "${CONTAINER_NAME}" 2>/dev/null || "${CONTAINER_RUNTIME}" inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  "${CONTAINER_RUNTIME}" rm -f "${CONTAINER_NAME}"
fi
PORT_ARGS=(-p "${LAN_IP}:${APP_PORT}:8080")
if [[ -n "${ZEROTIER_IP:-}" && "${ZEROTIER_IP}" != "${LAN_IP}" ]]; then
  PORT_ARGS+=(-p "${ZEROTIER_IP}:${APP_PORT}:8080")
fi
"${CONTAINER_RUNTIME}" run -d --name "${CONTAINER_NAME}" --restart=unless-stopped \
  "${PORT_ARGS[@]}" \
  -v "${REMOTE_DIR}/data:/data" \
  -v "${USERS_FILE}:/run/secrets/neurodiary-users.json" \
  -e NEURODIARY_LOCAL_USERS_FILE=/run/secrets/neurodiary-users.json \
  -e NEURODIARY_SESSION_SECRET="${SESSION_SECRET}" \
  -e NEURODIARY_CORS_ORIGINS="http://${LAN_IP}:${APP_PORT}${ZEROTIER_IP:+,http://${ZEROTIER_IP}:${APP_PORT}}" \
  "${IMAGE_NAME}"
sleep 2
"${CONTAINER_RUNTIME}" exec "${CONTAINER_NAME}" python -c \
  'import urllib.request; print(urllib.request.urlopen("http://127.0.0.1:8080/readyz").read().decode())'
echo "NeuroDiary: http://${LAN_IP}:${APP_PORT}"
[[ -n "${ZEROTIER_IP:-}" ]] && echo "ZeroTier: http://${ZEROTIER_IP}:${APP_PORT}"
