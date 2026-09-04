#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${1:-$SCRIPT_DIR/omnia.env}"
[[ -f "$ENV_FILE" ]] || { echo "Chybí $ENV_FILE." >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${LXC_IP:?V omnia.env chybí LXC_IP pro LAN}"
: "${LXC_ZEROTIER_IP:?V omnia.env chybí LXC_ZEROTIER_IP}"
: "${LAN_IP:?V omnia.env chybí LAN_IP routeru}"
: "${ZEROTIER_IP:?V omnia.env chybí ZEROTIER_IP routeru}"
command -v openssl >/dev/null || { echo "Lokálně chybí openssl." >&2; exit 1; }

TLS_DIR="$REPO_ROOT/secrets/tls"
CA_KEY="$TLS_DIR/neurodiary-ca.key"
CA_CERT="$TLS_DIR/neurodiary-ca.crt"
SERVER_KEY="$TLS_DIR/neurodiary-server.key"
SERVER_CERT="$TLS_DIR/neurodiary-server.crt"
mkdir -p "$TLS_DIR"
chmod 700 "$REPO_ROOT/secrets" "$TLS_DIR"

if [[ ! -s "$CA_CERT" ]]; then
  [[ ! -e "$CA_KEY" ]] || { echo "Existuje CA klíč, ale chybí $CA_CERT." >&2; exit 1; }
  echo "Vytvářím šifrovaný privátní klíč lokální certifikační autority."
  openssl genrsa -aes256 -out "$CA_KEY" 4096
  chmod 600 "$CA_KEY"
  openssl req -x509 -new -sha256 -days 3650 -key "$CA_KEY" -out "$CA_CERT" \
    -subj "/CN=NeuroDiary Local CA/O=NeuroDiary/" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash"
fi

openssl x509 -in "$CA_CERT" -noout >/dev/null
required_ips=("$LXC_IP" "$LXC_ZEROTIER_IP" "$LAN_IP" "$ZEROTIER_IP")
IFS=',' read -r -a configured_dns_names <<<"${TLS_DNS_NAMES:-}"
required_dns_names=()
for dns_name in "${configured_dns_names[@]}"; do
  dns_name="${dns_name//[[:space:]]/}"
  [[ -n "$dns_name" ]] && required_dns_names+=("$dns_name")
done

certificate_is_current() {
  [[ -s "$SERVER_CERT" && -s "$SERVER_KEY" ]] || return 1
  openssl verify -CAfile "$CA_CERT" "$SERVER_CERT" >/dev/null 2>&1 || return 1
  openssl x509 -checkend 2592000 -noout -in "$SERVER_CERT" >/dev/null 2>&1 || return 1
  for ip_address in "${required_ips[@]}"; do
    openssl x509 -checkip "$ip_address" -noout -in "$SERVER_CERT" >/dev/null 2>&1 || return 1
  done
  for dns_name in "${required_dns_names[@]}"; do
    openssl x509 -checkhost "$dns_name" -noout -in "$SERVER_CERT" >/dev/null 2>&1 || return 1
  done
  local cert_public_key server_public_key
  cert_public_key="$(openssl x509 -in "$SERVER_CERT" -pubkey -noout | openssl sha256)"
  server_public_key="$(openssl pkey -in "$SERVER_KEY" -pubout | openssl sha256)" || return 1
  [[ "$cert_public_key" == "$server_public_key" ]]
}

if certificate_is_current; then
  echo "Serverový certifikát je platný, odpovídá klíči a obsahuje všechny požadované SAN."
else
  [[ -s "$CA_KEY" ]] || {
    echo "Serverový certifikát chybí nebo nemá správné SAN. Pro jeho vystavení vložte CA klíč do $CA_KEY." >&2
    exit 1
  }
  echo "Vystavuji nový serverový certifikát z existující lokální autority."
  NEW_SERVER_KEY="$TLS_DIR/neurodiary-server.key.new"
  NEW_SERVER_CERT="$TLS_DIR/neurodiary-server.crt.new"
  CSR="$TLS_DIR/neurodiary-server.csr"
  EXT="$TLS_DIR/neurodiary-server.ext"
  cleanup_issue_files() { rm -f "$NEW_SERVER_KEY" "$NEW_SERVER_CERT" "$CSR" "$EXT" "$TLS_DIR/neurodiary-ca.srl"; }
  trap cleanup_issue_files EXIT
  openssl genrsa -out "$NEW_SERVER_KEY" 3072
  chmod 600 "$NEW_SERVER_KEY"
  openssl req -new -sha256 -key "$NEW_SERVER_KEY" -out "$CSR" -subj "/CN=$ZEROTIER_IP/O=NeuroDiary/"
  san_entries=("IP:$LXC_IP" "IP:$LXC_ZEROTIER_IP" "IP:$LAN_IP" "IP:$ZEROTIER_IP")
  for dns_name in "${required_dns_names[@]}"; do
    san_entries+=("DNS:$dns_name")
  done
  san_value="$(IFS=,; echo "${san_entries[*]}")"
printf '%s\n' \
  "basicConstraints=critical,CA:FALSE" \
  "keyUsage=critical,digitalSignature,keyEncipherment" \
  "extendedKeyUsage=serverAuth" \
    "subjectAltName=$san_value" \
  "subjectKeyIdentifier=hash" \
  "authorityKeyIdentifier=keyid,issuer" >"$EXT"
  openssl x509 -req -sha256 -days 397 -in "$CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" \
    -CAcreateserial -out "$NEW_SERVER_CERT" -extfile "$EXT"
  openssl verify -CAfile "$CA_CERT" "$NEW_SERVER_CERT"
  mv "$NEW_SERVER_KEY" "$SERVER_KEY"
  mv "$NEW_SERVER_CERT" "$SERVER_CERT"
  cleanup_issue_files
  trap - EXIT
fi
chmod 644 "$CA_CERT" "$SERVER_CERT"

openssl verify -CAfile "$CA_CERT" "$SERVER_CERT"
for ip_address in "${required_ips[@]}"; do
  openssl x509 -checkip "$ip_address" -noout -in "$SERVER_CERT"
done
for dns_name in "${required_dns_names[@]}"; do
  openssl x509 -checkhost "$dns_name" -noout -in "$SERVER_CERT"
done
echo "SHA-256 otisk CA pro kontrolu při instalaci:"
openssl x509 -in "$CA_CERT" -noout -fingerprint -sha256
echo
echo "TLS materiály jsou připravené v $TLS_DIR."
echo "Do klientů nainstalujte jako důvěryhodnou autoritu: $CA_CERT"
echo "Privátní klíč CA ponechte pouze zde a bezpečně jej zazálohujte: $CA_KEY"
