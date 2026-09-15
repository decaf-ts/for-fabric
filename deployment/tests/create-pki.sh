#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./create-pki.sh
#   ./create-pki.sh <relativePathFromScript>


# Directory where THIS SCRIPT lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Optional relative path (relative to script dir)
REL_BASE_DIR="${1:-.}"
ORG_NAME="${2:-orga}"
ORG_LABEL="${3:-Pharmaledger Association}"

TARGET_BASE="$SCRIPT_DIR/$REL_BASE_DIR"
mkdir -p "$TARGET_BASE"

# Resolve base directory relative to script location
BASE_DIR="$(cd "$TARGET_BASE" && pwd)"

mkdir -p "$BASE_DIR"

STORAGE_DIR="$BASE_DIR/storage"
EXTCA_DIR="$STORAGE_DIR/extca"
ICA_DIR="$STORAGE_DIR/ica"
TLS_ICA_DIR="$STORAGE_DIR/tls-ica"

OUT_DIR="$STORAGE_DIR/$ORG_NAME"
OUT_CA_DIR="$OUT_DIR/ca/server"
OUT_TLS_DIR="$OUT_DIR/tls"

echo "Script dir:   $SCRIPT_DIR"
echo "Base dir:     $BASE_DIR"
echo "Storage dir:  $STORAGE_DIR"
echo "Output dir:   $OUT_DIR"


mkdir -p "$EXTCA_DIR" "$ICA_DIR" "$TLS_ICA_DIR" "$OUT_CA_DIR" "$OUT_TLS_DIR"

# ------------------------------------------------------------------------------
# Root CA (storage/extca)
# ------------------------------------------------------------------------------
mkdir -p "$EXTCA_DIR/root"/{certs,crl,newcerts,private}
chmod 700 "$EXTCA_DIR/root/private"
: > "$EXTCA_DIR/root/index.txt"
echo 1000 > "$EXTCA_DIR/root/serial"

cat > "$EXTCA_DIR/root/openssl.cnf" <<EOF
[ ca ]
default_ca = CA_default

[ CA_default ]
dir               = $EXTCA_DIR/root
certs             = \$dir/certs
crl_dir           = \$dir/crl
new_certs_dir     = \$dir/newcerts
database          = \$dir/index.txt
serial            = \$dir/serial
private_key       = \$dir/private/root.key
certificate       = \$dir/certs/root.crt
default_md        = sha256
policy            = policy_loose
x509_extensions   = v3_root_ca
copy_extensions   = copy

email_in_dn        = no
rand_serial        = yes

[ policy_loose ]
commonName              = supplied
organizationName        = optional
organizationalUnitName  = optional
countryName             = optional
stateOrProvinceName     = optional
localityName            = optional
emailAddress            = optional

[ req ]
default_bits        = 4096
default_md          = sha256
prompt              = no
distinguished_name  = dn
x509_extensions     = v3_root_ca

[ dn ]
C  = PT
O  = ExternalPKI
OU = RootCA
CN = ext-root-ca

[ v3_root_ca ]
basicConstraints = critical,CA:TRUE,pathlen:1
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
EOF

openssl genrsa -out "$EXTCA_DIR/root/private/root.key" 4096
openssl req -x509 -new -nodes \
  -key "$EXTCA_DIR/root/private/root.key" \
  -days 3650 \
  -out "$EXTCA_DIR/root/certs/root.crt" \
  -config "$EXTCA_DIR/root/openssl.cnf"

# ------------------------------------------------------------------------------
# Intermediate CA (storage/ica)
# ------------------------------------------------------------------------------
openssl ecparam -name prime256v1 -genkey -noout -out "$ICA_DIR/ca.key"

openssl req -new -key "$ICA_DIR/ca.key" -out "$ICA_DIR/ca.csr" \
  -subj "/C=GB/ST=Greater London/L=London/O=$ORG_LABEL/OU=Fabric for Pharmaledger/CN=$ORG_NAME-ca"

cat > "$EXTCA_DIR/intermediate_ext.cnf" <<'EOF'
[ v3_intermediate_ca ]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
EOF

openssl ca -batch -notext \
  -config "$EXTCA_DIR/root/openssl.cnf" \
  -extensions v3_intermediate_ca \
  -extfile "$EXTCA_DIR/intermediate_ext.cnf" \
  -in "$ICA_DIR/ca.csr" \
  -out "$ICA_DIR/ca.crt" \
  -days 1825

cp "$EXTCA_DIR/root/certs/root.crt" "$ICA_DIR/root.crt"
cat "$ICA_DIR/ca.crt" "$ICA_DIR/root.crt" > "$ICA_DIR/ca-chain.pem"

echo "Checking certificate constraints (ICA)"
openssl x509 -in "$ICA_DIR/ca.crt" -noout -text | egrep -A2 "Basic Constraints|Key Usage" || true

echo "Checking certificate chain (ICA)"
openssl verify -CAfile "$ICA_DIR/root.crt" "$ICA_DIR/ca.crt"

mkdir -p "$OUT_CA_DIR"
cp "$ICA_DIR/ca.crt"       "$OUT_CA_DIR/ca.crt"
cp "$ICA_DIR/ca.key"       "$OUT_CA_DIR/ca.key"
cp "$ICA_DIR/ca-chain.pem" "$OUT_CA_DIR/ca-chain.pem"

# ------------------------------------------------------------------------------
# TLS Intermediate CA (storage/tls-ica)
# ------------------------------------------------------------------------------
openssl ecparam -name prime256v1 -genkey -noout -out "$TLS_ICA_DIR/tls-ca.key"

openssl req -new -key "$TLS_ICA_DIR/tls-ca.key" -out "$TLS_ICA_DIR/tls-ca.csr" \
  -subj "/C=GB/ST=Greater London/L=London/O=$ORG_LABEL/OU=Fabric for Pharmaledger/CN=$ORG_NAME-tls"

openssl ca -batch -notext \
  -config "$EXTCA_DIR/root/openssl.cnf" \
  -extensions v3_intermediate_ca \
  -extfile "$EXTCA_DIR/intermediate_ext.cnf" \
  -in "$TLS_ICA_DIR/tls-ca.csr" \
  -out "$TLS_ICA_DIR/tls-ca.crt" \
  -days 1825

cp "$EXTCA_DIR/root/certs/root.crt" "$TLS_ICA_DIR/root.crt"
cat "$TLS_ICA_DIR/tls-ca.crt" "$TLS_ICA_DIR/root.crt" > "$TLS_ICA_DIR/tls-ca-chain.pem"

echo "Checking certificate constraints (TLS ICA)"
openssl x509 -in "$TLS_ICA_DIR/tls-ca.crt" -noout -text | egrep -A2 "Basic Constraints|Key Usage" || true

echo "Checking certificate chain (TLS ICA)"
openssl verify -CAfile "$TLS_ICA_DIR/root.crt" "$TLS_ICA_DIR/tls-ca.crt"

mkdir -p "$OUT_TLS_DIR"
cp "$TLS_ICA_DIR/tls-ca.crt"       "$OUT_TLS_DIR/tls-ca.crt"
cp "$TLS_ICA_DIR/tls-ca.key"       "$OUT_TLS_DIR/tls-ca.key"
cp "$TLS_ICA_DIR/tls-ca-chain.pem" "$OUT_TLS_DIR/tls-ca-chain.pem"

echo
echo "Done."
echo "ICA artifacts:    $OUT_CA_DIR"
echo "TLS artifacts:   $OUT_TLS_DIR"
