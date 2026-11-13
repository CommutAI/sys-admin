#!/bin/bash
# Run on the Pi: bash diagnose-camera.sh
set -e
cd ~/raspberry-pi-server
echo "=== devices ==="
ls -la /dev/video* 2>&1 || echo 'no /dev/video*'
echo "=== usb ==="
lsusb 2>&1 | head -30
echo "=== v4l2 ==="
v4l2-ctl --list-devices 2>&1 || true
echo "=== opencv probe ==="
source venv/bin/activate
python - <<'PY'
import cv2
for i in range(4):
    cap = cv2.VideoCapture(i, cv2.CAP_V4L2)
    ok = cap.isOpened()
    ret, frame = (False, None)
    if ok:
        ret, frame = cap.read()
    print(f"index {i}: opened={ok} read={ret} shape={None if frame is None else frame.shape}")
    cap.release()
PY
echo "=== service ==="
systemctl is-active commutai-pi-service || true
sudo ss -tlnp | grep 8080 || echo '8080 free'
curl -s -m 3 http://127.0.0.1:8080/health || echo 'health failed'
echo "=== recent logs ==="
sudo journalctl -u commutai-pi-service -n 25 --no-pager
