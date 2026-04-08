#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# gen-cert.sh — Generate a locally-trusted TLS certificate for dcorp.vn
#               using mkcert. Run once; re-run only if the cert expires or
#               you add a new hostname/IP.
#
# Usage:
#   cd frontend
#   bash scripts/gen-cert.sh
# ---------------------------------------------------------------------------

set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/certificates"
DOMAIN="dcorp.vn"

# ── 1. Check mkcert ─────────────────────────────────────────────────────────
if ! command -v mkcert &> /dev/null; then
  echo ""
  echo "  mkcert is not installed. Install it first:"
  echo ""
  echo "  macOS:   brew install mkcert"
  echo "  Linux:   sudo apt install mkcert   (Ubuntu/Debian)"
  echo "           or download from https://github.com/FiloSottile/mkcert/releases"
  echo "  Windows: choco install mkcert"
  echo ""
  exit 1
fi

# ── 2. Install the local CA into the system/browser trust stores ────────────
echo ""
echo "▶ Installing mkcert CA into system trust store (may ask for password)…"
mkcert -install
echo "  ✓ CA installed"

# ── 3. Detect local LAN IP ──────────────────────────────────────────────────
LOCAL_IP=""
if command -v ipconfig &> /dev/null; then
  # macOS
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
elif command -v hostname &> /dev/null; then
  # Linux
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
fi

echo ""
if [ -n "$LOCAL_IP" ]; then
  echo "  Detected LAN IP: $LOCAL_IP"
else
  echo "  Could not auto-detect LAN IP — cert will cover localhost + 127.0.0.1 only."
  echo "  To include your IP, edit this script and add it to the mkcert call below."
fi

# ── 4. Generate certificate ──────────────────────────────────────────────────
echo ""
echo "▶ Generating certificate for: $DOMAIN *.$DOMAIN localhost 127.0.0.1 ${LOCAL_IP:-}"
echo ""

mkdir -p "$CERT_DIR"

DOMAINS="$DOMAIN *.$DOMAIN localhost 127.0.0.1 ::1"
if [ -n "$LOCAL_IP" ]; then
  DOMAINS="$DOMAINS $LOCAL_IP"
fi

mkcert \
  -key-file  "$CERT_DIR/${DOMAIN}-key.pem" \
  -cert-file "$CERT_DIR/${DOMAIN}.pem" \
  $DOMAINS

echo ""
echo "  ✓ Certificate written to:"
echo "      $CERT_DIR/${DOMAIN}.pem"
echo "      $CERT_DIR/${DOMAIN}-key.pem"

# ── 5. Print CA location for Android / iOS sideloading ───────────────────────
CA_ROOT=$(mkcert -CAROOT)
echo ""
echo "  ✓ mkcert CA root: $CA_ROOT"
echo ""
echo "────────────────────────────────────────────────────────────────────────"
echo "  NEXT STEPS"
echo "────────────────────────────────────────────────────────────────────────"
echo ""
echo "  1. Add to /etc/hosts (Mac/Linux) or C:\Windows\System32\drivers\etc\hosts (Windows):"
echo ""
echo "       127.0.0.1  $DOMAIN"
if [ -n "$LOCAL_IP" ]; then
  echo ""
  echo "     On Android/iOS devices add the same line pointing to your LAN IP:"
  echo "       $LOCAL_IP  $DOMAIN"
  echo "     (use a router-level custom DNS or a DNS app like Adguard)"
fi
echo ""
echo "  2. Android — install the mkcert CA on the device:"
echo "       adb push \"$CA_ROOT/rootCA.pem\" /sdcard/mkcert-CA.crt"
echo "       Then: Settings → Security → Install a certificate → CA certificate"
echo ""
echo "  3. iOS — AirDrop or serve rootCA.pem via HTTP, tap to install:"
echo "       Settings → General → VPN & Device Management → trust the certificate"
echo ""
echo "  4. Start the HTTPS dev server:"
echo "       npm run dev:https"
echo ""
