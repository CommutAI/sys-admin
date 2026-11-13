#!/bin/bash
# Install/start Cloudflare Quick Tunnel → local :8080
set -e
cd ~/raspberry-pi-server

echo "=== cloudflared binary ==="
if ! command -v cloudflared >/dev/null 2>&1; then
  ARCH=$(uname -m)
  case "$ARCH" in
    aarch64|arm64) CF_ARCH=arm64 ;;
    armv7l)        CF_ARCH=arm ;;
    x86_64)        CF_ARCH=amd64 ;;
    *) echo "Unsupported arch: $ARCH"; exit 1 ;;
  esac
  echo "Installing cloudflared ($CF_ARCH)..."
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" -o /tmp/cloudflared
  chmod +x /tmp/cloudflared
  sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
fi
cloudflared --version

echo "=== ensure Pi video server is up ==="
curl -sf -m 3 http://127.0.0.1:8080/health >/dev/null || {
  echo "Port 8080 not healthy — starting commutai-pi-service"
  sudo systemctl start commutai-pi-service
  sleep 8
  curl -sf -m 5 http://127.0.0.1:8080/health || { echo "Pi service still down"; exit 1; }
}

echo "=== install systemd unit ==="
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/cloudflared-tunnel.service" ]; then
  sed -i 's/\r$//' "$SCRIPT_DIR/cloudflared-tunnel.service"
  sudo cp "$SCRIPT_DIR/cloudflared-tunnel.service" /etc/systemd/system/cloudflared-tunnel.service
else
  sudo tee /etc/systemd/system/cloudflared-tunnel.service >/dev/null <<'EOF'
[Unit]
Description=Cloudflare Quick Tunnel for CommutAI Pi (port 8080)
After=network-online.target commutai-pi-service.service
Wants=network-online.target

[Service]
Type=simple
User=chichi
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8080
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
fi

sudo systemctl daemon-reload
sudo systemctl enable cloudflared-tunnel
sudo systemctl restart cloudflared-tunnel

echo "=== waiting for trycloudflare.com URL (up to 45s) ==="
URL=""
for i in $(seq 1 45); do
  URL=$(sudo journalctl -u cloudflared-tunnel -n 80 --no-pager 2>/dev/null | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  if [ -n "$URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "Tunnel started but URL not found yet. Check:"
  echo "  sudo journalctl -u cloudflared-tunnel -n 50 --no-pager"
  exit 1
fi

echo ""
echo "=========================================="
echo " TUNNEL URL: $URL"
echo "=========================================="
echo ""
echo "Test:  curl -s $URL/health"
curl -s -m 10 "$URL/health" || echo "(health via tunnel not ready yet — wait a few seconds)"
echo ""
echo "On Windows, set in .env then restart Vite:"
echo "  VITE_RASPBERRY_PI_URL=$URL"
