#!/usr/bin/env bash
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/omnia.env}"
[[ -f "$ENV_FILE" ]] || { echo "Chybí $ENV_FILE." >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${OMNIA_HOST:?}" "${CONTAINER_RUNTIME:?}"

OWNS_SSH_SESSION=false
if [[ -z "${SSH_CONTROL_PATH:-}" || ! -S "$SSH_CONTROL_PATH" ]]; then
  SSH_CONTROL_DIR="$(mktemp -d)"; SSH_CONTROL_PATH="$SSH_CONTROL_DIR/socket"; OWNS_SSH_SESSION=true
  echo "Připojuji se k Omnii..."
  ssh -M -S "$SSH_CONTROL_PATH" -o ControlPersist=5m -o ConnectTimeout=10 -fN "$OMNIA_HOST" || exit 1
fi
cleanup() {
  if [[ "$OWNS_SSH_SESSION" == true ]]; then
    ssh -S "$SSH_CONTROL_PATH" -O exit "$OMNIA_HOST" >/dev/null 2>&1 || true
    rm -rf "$SSH_CONTROL_DIR"
  fi
}
trap cleanup EXIT
REMOTE=(ssh -S "$SSH_CONTROL_PATH" "$OMNIA_HOST")

echo
echo "=== NeuroDiary: stav a diagnostika ==="
"${REMOTE[@]}" 'echo "Router: $(hostname)"; echo "Čas: $(date -Iseconds 2>/dev/null || date)"; uptime; echo; echo "IPv4 rozhraní:"; ip -4 -o addr show scope global 2>/dev/null; echo; echo "Disk routeru:"; df -h / 2>/dev/null'

if [[ "$CONTAINER_RUNTIME" == lxc ]]; then
  : "${LXC_NAME:?}"
  echo
  echo "--- LXC $LXC_NAME ---"
  "${REMOTE[@]}" "lxc-info -n '$LXC_NAME'" || { echo "LXC nebyl nalezen."; exit 1; }
  if ! "${REMOTE[@]}" "lxc-info -n '$LXC_NAME' -sH" | grep -qx RUNNING; then
    echo "Diagnostiku služby nelze provést: LXC neběží."
    exit 1
  fi
  "${REMOTE[@]}" "lxc-attach -n '$LXC_NAME' -- sh -c 'echo; echo \"Služba:\"; systemctl --no-pager --full status neurodiary.service 2>&1 | sed -n \"1,18p\"; echo; echo \"Healthcheck:\"; curl -fsS --max-time 5 http://127.0.0.1:8080/healthz || true; echo; echo; echo \"Paměť a disk LXC:\"; free -h 2>/dev/null || true; df -h / /var/lib/neurodiary 2>/dev/null | awk \"NR == 1 || !seen[\\\$1]++\"; echo; echo \"Poslední varování služby:\"; journalctl -u neurodiary.service -p warning -n 15 --no-pager 2>/dev/null || true'"
else
  : "${CONTAINER_NAME:?}"
  echo
  echo "--- $CONTAINER_RUNTIME kontejner $CONTAINER_NAME ---"
  "${REMOTE[@]}" "$CONTAINER_RUNTIME ps -a --filter name='$CONTAINER_NAME'; echo; $CONTAINER_RUNTIME logs --tail 20 '$CONTAINER_NAME' 2>&1 || true; echo; $CONTAINER_RUNTIME exec '$CONTAINER_NAME' python -c 'import urllib.request; print(urllib.request.urlopen(\"http://127.0.0.1:8080/healthz\", timeout=5).read().decode())' 2>&1 || true"
fi
