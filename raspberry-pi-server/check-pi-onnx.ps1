# Quick status check for Pi ONNX service
$Pi = "chichi@192.168.1.54"
ssh -4 -o ConnectTimeout=15 $Pi "echo '=== status ==='; systemctl is-active commutai-pi-service; echo '=== port 8080 ==='; sudo ss -tlnp | grep 8080 || echo 'NOT listening'; echo '=== recent logs ==='; sudo journalctl -u commutai-pi-service -n 25 --no-pager; echo '=== health ==='; curl -s -m 3 http://127.0.0.1:8080/health || echo 'health failed'"
