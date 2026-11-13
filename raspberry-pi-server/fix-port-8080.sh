#!/bin/bash
set -e
echo "=== stop services ==="
sudo systemctl stop commutai-pi-service 2>/dev/null || true
sudo systemctl stop video-server.service 2>/dev/null || true
sudo systemctl disable video-server.service 2>/dev/null || true

echo "=== who had 8080 ==="
sudo ss -tlnp | grep 8080 || echo none
sudo lsof -iTCP:8080 -sTCP:LISTEN 2>/dev/null || true
sudo fuser -v 8080/tcp 2>/dev/null || true

echo "=== kill 8080 holders ==="
sudo fuser -k 8080/tcp 2>/dev/null || true
sudo pkill -f 'video_server_fastapi.py' 2>/dev/null || true
rm -f /tmp/commutai-pi-server.lock
sleep 2

echo "=== after kill ==="
sudo ss -tlnp | grep 8080 || echo '8080 free'

echo "=== start commutai-pi-service ==="
sudo systemctl reset-failed commutai-pi-service
sudo systemctl start commutai-pi-service
# ONNX load can take 15-30s on Pi
sleep 20

echo "=== listening ==="
sudo ss -tlnp | grep 8080 || echo 'NOT listening'
echo "=== status ==="
systemctl is-active commutai-pi-service || true
sudo journalctl -u commutai-pi-service -n 40 --no-pager
echo "=== health ==="
curl -s -m 3 http://127.0.0.1:8080/health || echo 'health failed'
