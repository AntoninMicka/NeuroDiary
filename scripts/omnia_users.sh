#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ENV_FILE="${NEURODIARY_OMNIA_ENV:-$SCRIPT_DIR/omnia.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Chybí $ENV_FILE; vytvořte jej podle scripts/omnia.env.example." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${OMNIA_HOST:?V omnia.env chybí OMNIA_HOST}"
: "${REMOTE_DIR:=/srv/neurodiary}"
if [[ $# -lt 1 ]]; then
  echo "Použití: $0 {list|add|passwd|roles|delete} [argumenty...]" >&2
  exit 2
fi

REMOTE_TOOL="/tmp/neurodiary-local-user.py"
scp "$SCRIPT_DIR/local_user.py" "$OMNIA_HOST:$REMOTE_TOOL"
printf -v REMOTE_ARGS ' %q' "$@"
ssh -t "$OMNIA_HOST" "python3 '$REMOTE_TOOL' '$REMOTE_DIR/config/users.json'$REMOTE_ARGS"
