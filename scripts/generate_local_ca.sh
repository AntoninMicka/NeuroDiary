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
command -v openssl >/dev/null || { echo "Lokálně chybí openssl." >&2; exit 1; }

TLS_DIR="$REPO_ROOT/secrets/tls"
CA_KEY="$TLS_DIR/neurodiary-ca.key"
CA_CERT="$TLS_DIR/neurodiary-ca.crt"
SERVER_KEY="$TLS_DIR/neurodiary-server.key"
SERVER_CERT="$TLS_DIR/neurodiary-server.crt"
mkdir -p "$TLS_DIR"
chmod 700 "$REPO_ROOT/secrets" "$TLS_DIR"

if [[ -e "$CA_KEY" || -e "$CA_CERT" || -e "$SERVER_KEY" || -e "$SERVER_CERT" ]]; then
  echo "TLS soubory už existují v $TLS_DIR; kvůli ochraně CA je nepřepisuji." >&2
  exit 1
fi

echo "Vytvářím šifrovaný privátní klíč lokální certifikační autority."
openssl genrsa -aes256 -out "$CA_KEY" 4096
chmod 600 "$CA_KEY"
openssl req -x509 -new -sha256 -days 3650 -key "$CA_KEY" -out "$CA_CERT" \
  -subj "/CN=NeuroDiary Local CA/O=NeuroDiary/" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "subjectKeyIdentifier=hash"

openssl genrsa -out "$SERVER_KEY" 3072
chmod 600 "$SERVER_KEY"
CSR="$TLS_DIR/neurodiary-server.csr"
EXT="$TLS_DIR/neurodiary-server.ext"
openssl req -new -sha256 -key "$SERVER_KEY" -out "$CSR" -subj "/CN=$LXC_ZEROTIER_IP/O=NeuroDiary/"
printf '%s\n' \
  "basicConstraints=critical,CA:FALSE" \
  "keyUsage=critical,digitalSignature,keyEncipherment" \
  "extendedKeyUsage=serverAuth" \
  "subjectAltName=IP:$LXC_ZEROTIER_IP,IP:$LXC_IP" \
  "subjectKeyIdentifier=hash" \
  "authorityKeyIdentifier=keyid,issuer" >"$EXT"
openssl x509 -req -sha256 -days 825 -in "$CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" \
  -CAcreateserial -out "$SERVER_CERT" -extfile "$EXT"
rm -f "$CSR" "$EXT" "$TLS_DIR/neurodiary-ca.srl"
chmod 644 "$CA_CERT" "$SERVER_CERT"

openssl verify -CAfile "$CA_CERT" "$SERVER_CERT"
echo
echo "CA a serverový certifikát byly vytvořeny v $TLS_DIR."
echo "Do klientů nainstalujte jako důvěryhodnou autoritu: $CA_CERT"
echo "Privátní klíč CA ponechte pouze zde a bezpečně jej zazálohujte: $CA_KEY"
