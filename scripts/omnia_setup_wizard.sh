#!/usr/bin/env bash
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/omnia.env}"

say() { printf '\n%s\n' "$*"; }
fatal() { echo "Chyba: $*" >&2; exit 1; }
prompt() { local answer=""; read -r -p "$2 [$3]: " answer || exit 130; printf -v "$1" %s "${answer:-$3}"; }
confirm() { local answer=""; read -r -p "$1 [${2:-a}]: " answer || return 1; answer="${answer:-${2:-a}}"; [[ "$answer" =~ ^[AaYy]$ ]]; }
valid_ipv4() {
  local ip="$1" part; local -a parts=()
  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS=. read -r -a parts <<<"$ip"
  for part in "${parts[@]}"; do (( 10#$part <= 255 )) || return 1; done
}
shell_value() { printf %q "$1"; }
default_gateway() {
  local gateway=""
  if command -v ip >/dev/null 2>&1; then
    gateway="$(ip -4 route show default 2>/dev/null | awk '$1 == "default" && $3 != "" {print $3; exit}')"
  fi
  if [[ -z "$gateway" ]] && command -v route >/dev/null 2>&1; then
    gateway="$(route -n get default 2>/dev/null | awk '$1 == "gateway:" {print $2; exit}')"
    [[ -n "$gateway" ]] || gateway="$(route -n 2>/dev/null | awk '$1 == "0.0.0.0" {print $2; exit}')"
  fi
  valid_ipv4 "$gateway" && printf '%s' "$gateway"
}
remote_facts() {
  ssh -S "$SSH_CONTROL_PATH" -o ControlMaster=auto -o ControlPersist=15m -o ConnectTimeout=10 "$OMNIA_HOST" 'r=""; command -v podman >/dev/null && r="podman"; command -v docker >/dev/null && r="${r}${r:+,}docker"; command -v lxc-attach >/dev/null && r="${r}${r:+,}lxc"; echo "RUNTIMES=$r"; ip -4 -o addr show scope global 2>/dev/null; if command -v lxc-ls >/dev/null; then printf "LXC="; lxc-ls | tr " " ","; echo; fi'
}
ssh_omnia() { ssh -S "$SSH_CONTROL_PATH" -o ControlMaster=auto -o ControlPersist=15m "$OMNIA_HOST" "$@"; }
scp_omnia() { scp -o "ControlPath=$SSH_CONTROL_PATH" -o ControlMaster=auto -o ControlPersist=15m "$@"; }

for cmd in ssh scp rsync python3; do command -v "$cmd" >/dev/null || fatal "V počítači chybí $cmd."; done
SESSION_DIR="$(mktemp -d)" || fatal "Nelze vytvořit dočasný adresář."
SSH_CONTROL_PATH="$SESSION_DIR/ssh.socket"
cleanup() {
  [[ -n "${OMNIA_HOST:-}" ]] && ssh -S "$SSH_CONTROL_PATH" -O exit "$OMNIA_HOST" >/dev/null 2>&1 || true
  rm -rf "$SESSION_DIR"
}
trap cleanup EXIT
export SSH_CONTROL_PATH
say "NeuroDiary – průvodce instalací na Turris Omnia"
echo "Síť i runtime vždy vybíráte; průvodce sám nepoužije síť pro hosty."

GATEWAY_SUGGESTION="$(default_gateway)"
OMNIA_HOST="root@${GATEWAY_SUGGESTION:-192.168.1.1}"; REMOTE_DIR="/srv/neurodiary"; APP_PORT="8443"
IMAGE_NAME="neurodiary:local"; CONTAINER_NAME="neurodiary"
if [[ -f "$ENV_FILE" ]]; then source "$ENV_FILE"; fi

say "1/5 Připojení a prostředí"
while true; do
  prompt OMNIA_HOST "SSH adresa Omnie" "$OMNIA_HOST"
  if [[ ! "$OMNIA_HOST" =~ ^[A-Za-z0-9_.-]+@[A-Za-z0-9_.:-]+$ ]]; then echo "Příklad: root@192.168.100.1"; continue; fi
  if REMOTE_FACTS="$(remote_facts)"; then break; fi
  echo "Připojení selhalo. Zkontrolujte adresu a přihlašovací údaje."
  confirm "Zkusit znovu?" a || exit 0
done

while true; do
  AVAILABLE="$(sed -n 's/^RUNTIMES=//p' <<<"$REMOTE_FACTS" | head -n1)"
  if [[ -n "$AVAILABLE" ]]; then break; fi
  echo "Nenalezen Podman, Docker ani LXC. LXC lze doinstalovat v reForis."
  read -r -p "Po instalaci Enter = znovu ověřit, q = ukončit: " answer
  [[ "$answer" =~ ^[Qq]$ ]] && exit 0
  REMOTE_FACTS="$(remote_facts)" || true
done
IFS=, read -r -a OPTIONS <<<"$AVAILABLE"
while true; do
  echo "Dostupné způsoby nasazení:"
  for i in "${!OPTIONS[@]}"; do printf '  %d) %s\n' "$((i+1))" "${OPTIONS[i]}"; done
  echo "  0) zadat vlastní"
  read -r -p "Volba [1]: " choice; choice="${choice:-1}"
  if [[ "$choice" == 0 ]]; then prompt CONTAINER_RUNTIME "Runtime" "${CONTAINER_RUNTIME:-lxc}"
  elif [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#OPTIONS[@]} )); then CONTAINER_RUNTIME="${OPTIONS[choice-1]}"
  else echo "Neplatná volba."; continue; fi
  [[ "$CONTAINER_RUNTIME" =~ ^(podman|docker|lxc)$ ]] && break
  echo "Podporované hodnoty: podman, docker, lxc."
done

LXC_NAME="${LXC_NAME:-neurodiary}"; LXC_IP="${LXC_IP:-}"; LXC_ZEROTIER_IP="${LXC_ZEROTIER_IP:-}"
if [[ "$CONTAINER_RUNTIME" == lxc ]]; then
  LXC_LINE="$(sed -n 's/^LXC=//p' <<<"$REMOTE_FACTS" | head -n1)"; IFS=, read -r -a LXC_OPTIONS <<<"$LXC_LINE"
  while true; do
    echo "Nalezené LXC kontejnery:"; count=0
    for item in "${LXC_OPTIONS[@]}"; do [[ -z "$item" ]] && continue; count=$((count+1)); printf '  %d) %s\n' "$count" "$item"; done
    echo "  0) zadat vlastní název"
    read -r -p "Volba [${LXC_NAME}]: " choice
    if [[ "$choice" == 0 ]]; then prompt LXC_NAME "Název LXC" "$LXC_NAME"
    elif [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= count )); then
      seen=0; for item in "${LXC_OPTIONS[@]}"; do [[ -z "$item" ]] && continue; seen=$((seen+1)); [[ $seen == "$choice" ]] && LXC_NAME="$item" && break; done
    elif [[ -n "$choice" ]]; then echo "Neplatná volba."; continue; fi
    [[ "$LXC_NAME" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "Neplatný název."; continue; }
    ssh_omnia "lxc-info -n '$LXC_NAME'" >/dev/null 2>&1 && break
    echo "LXC $LXC_NAME nebyl nalezen. Vytvořte jej nebo vyberte jiný."
    confirm "Zkusit znovu?" a || exit 0
  done
fi

if [[ "$CONTAINER_RUNTIME" == lxc ]]; then
  DETECTED_LXC_IP="$(ssh_omnia "lxc-info -n '$LXC_NAME' -iH" 2>/dev/null | awk 'index($0, ":") == 0 {print; exit}')"
  while true; do prompt LXC_IP "LAN IPv4 adresa LXC" "${LXC_IP:-$DETECTED_LXC_IP}"; valid_ipv4 "$LXC_IP" && break; echo "Neplatná IPv4."; done
  while true; do prompt LXC_ZEROTIER_IP "ZeroTier IPv4 adresa LXC pro HTTPS" "$LXC_ZEROTIER_IP"; valid_ipv4 "$LXC_ZEROTIER_IP" && break; echo "Neplatná IPv4."; done
fi

mapfile -t NETWORKS < <(awk '$1~/^[0-9]+:$/ {i=$2; sub(/@.*/,"",i); print i"|"$4}' <<<"$REMOTE_FACTS")
choose_address() {
  local target="$1" purpose="$2" optional="$3" current="$4" choice iface cidr ip custom row saved_iface saved_cidr
  while true; do
    echo "Rozhraní pro $purpose:"
    for i in "${!NETWORKS[@]}"; do IFS='|' read -r iface cidr <<<"${NETWORKS[i]}"; printf '  %d) %-20s %s' "$((i+1))" "$iface" "$cidr"; [[ "$iface" == *guest* ]] && printf '  [SÍŤ PRO HOSTY]'; echo; done
    echo "  0) zadat vlastní IPv4"; [[ "$optional" == yes ]] && echo "  x) nepoužívat"
    read -r -p "Volba${current:+ [$current]}: " choice
    if [[ -z "$choice" && -n "$current" ]]; then
      ip="$current"; iface="uložená adresa"
      for row in "${NETWORKS[@]}"; do
        IFS='|' read -r saved_iface saved_cidr <<<"$row"
        [[ "${saved_cidr%%/*}" == "$ip" ]] && iface="$saved_iface" && break
      done
    elif [[ "$optional" == yes && "$choice" =~ ^[Xx]$ ]]; then printf -v "$target" ''; return
    elif [[ "$choice" == 0 ]]; then prompt custom "IPv4 adresa" "$current"; ip="$custom"; iface="vlastní"
    elif [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#NETWORKS[@]} )); then IFS='|' read -r iface cidr <<<"${NETWORKS[choice-1]}"; ip="${cidr%%/*}"
    else echo "Neplatná volba."; continue; fi
    valid_ipv4 "$ip" || { echo "Neplatná IPv4."; continue; }
    if [[ "$iface" == *guest* ]]; then confirm "Vybrána síť pro hosty ($iface). Opravdu pokračovat?" n || continue; fi
    printf -v "$target" %s "$ip"; return
  done
}
choose_address LAN_IP "LAN" no "${LAN_IP:-}"
choose_address ZEROTIER_IP "ZeroTier" yes "${ZEROTIER_IP:-}"

while true; do prompt APP_PORT "Port aplikace" "$APP_PORT"; [[ "$APP_PORT" =~ ^[0-9]+$ ]] && ((APP_PORT>=1024 && APP_PORT<=65535)) && break; echo "Rozsah je 1024–65535."; done
while true; do prompt REMOTE_DIR "Adresář na Omnii" "$REMOTE_DIR"; [[ "$REMOTE_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]] && break; echo "Příklad: /srv/neurodiary"; done

say "2/5 Uložení konfigurace"; umask 077
{
  printf 'OMNIA_HOST=%s\n' "$(shell_value "$OMNIA_HOST")"; printf 'REMOTE_DIR=%s\n' "$(shell_value "$REMOTE_DIR")"
  printf 'LAN_IP=%s\n' "$(shell_value "$LAN_IP")"; printf 'ZEROTIER_IP=%s\n' "$(shell_value "$ZEROTIER_IP")"
  printf 'APP_PORT=%s\n' "$(shell_value "$APP_PORT")"; printf 'CONTAINER_RUNTIME=%s\n' "$(shell_value "$CONTAINER_RUNTIME")"
  printf 'IMAGE_NAME=%s\n' "$(shell_value "$IMAGE_NAME")"; printf 'CONTAINER_NAME=%s\n' "$(shell_value "$CONTAINER_NAME")"
  printf 'LXC_NAME=%s\n' "$(shell_value "$LXC_NAME")"
  printf 'LXC_IP=%s\n' "$(shell_value "$LXC_IP")"; printf 'LXC_ZEROTIER_IP=%s\n' "$(shell_value "$LXC_ZEROTIER_IP")"
} >"$ENV_FILE" || fatal "Konfiguraci nelze uložit."
chmod 600 "$ENV_FILE"; echo "Uloženo: $ENV_FILE"

say "3/5 Lokální účet"
until ssh_omnia "mkdir -p '$REMOTE_DIR/config' && chmod 700 '$REMOTE_DIR/config'"; do echo "Příprava adresáře selhala."; confirm "Zkusit znovu?" a || exit 0; done
LOCAL_USERS="$SESSION_DIR/users.json"
if ssh_omnia "test -f '$REMOTE_DIR/config/users.json'"; then
  until scp_omnia "$OMNIA_HOST:$REMOTE_DIR/config/users.json" "$LOCAL_USERS"; do echo "Stažení účtů selhalo."; confirm "Zkusit znovu?" a || exit 0; done
  chmod 600 "$LOCAL_USERS"
fi
if [[ ! -f "$LOCAL_USERS" ]] || confirm "Založit nebo změnit lokální účet?" a; then
  while true; do prompt LOCAL_USERNAME "Uživatelské jméno" admin; [[ "$LOCAL_USERNAME" =~ ^[A-Za-z0-9._-]{1,64}$ ]] && break; echo "Neplatné jméno."; done
  until python3 "$SCRIPT_DIR/local_user.py" "$LOCAL_USERS" upsert "$LOCAL_USERNAME"; do echo "Vytvoření účtu selhalo."; confirm "Zkusit znovu?" a || exit 0; done
  until scp_omnia "$LOCAL_USERS" "$OMNIA_HOST:$REMOTE_DIR/config/users.json" && ssh_omnia "chmod 600 '$REMOTE_DIR/config/users.json'"; do echo "Nahrání účtu selhalo."; confirm "Zkusit znovu?" a || exit 0; done
fi

say "4/5 Rekapitulace"
echo "LAN: $LAN_IP:$APP_PORT"; [[ -n "$ZEROTIER_IP" ]] && echo "ZeroTier: $ZEROTIER_IP:$APP_PORT"
echo "Runtime: $CONTAINER_RUNTIME"; [[ "$CONTAINER_RUNTIME" == lxc ]] && echo "LXC: $LXC_NAME"
if confirm "Spustit nasazení?" a; then
  say "5/5 Nasazení"
  while true; do
    if [[ "$CONTAINER_RUNTIME" == lxc ]]; then bash "$SCRIPT_DIR/omnia_lxc_deploy.sh" "$ENV_FILE" && break; else bash "$SCRIPT_DIR/omnia_deploy.sh" "$ENV_FILE" && break; fi
    echo "Nasazení selhalo; výpis chyby zůstal výše."; confirm "Zkusit znovu?" a || break
  done
fi
say "Hotovo"
echo "Konfiguraci lze kdykoliv změnit opětovným spuštěním průvodce."
bash "$SCRIPT_DIR/omnia_status.sh" "$ENV_FILE" || true
