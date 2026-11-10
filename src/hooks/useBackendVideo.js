/**
 * useBackendVideo - Connect to backend WebSocket for processed video stream
 * Receives video frames with YOLOv8m detection boxes from backend
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getPersistedIp, discoverRaspberryPi, isSecureOrigin } from '../services/piAutoDiscovery';

const HEARTBEAT_MS = 30_000;

export function useBackendVideo({ autoConnect = true } = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [passengerCount, setPassengerCount] = useState(0);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const wsRef = useRef(null);
  const videoRef = useRef(null);
  const heartbeatTimer = useRef(null);
  const deadRef = useRef(false);

  // Skip all Pi connections when running on HTTPS — local IPs are blocked (Mixed Content)
  const piDisabled = isSecureOrigin();

  // Auto-detect backend URL from Pi discovery
  const [backendUrl, setBackendUrl] = useState(() => {
    if (piDisabled) return null;
    const piIp = getPersistedIp();
    return piIp ? `http://${piIp}:5000` : null;
  });
  
  const wsUrl = backendUrl
    ? backendUrl.replace(/^http/, 'ws') + '/ws'
    : null;

  // Auto-discover Pi if no IP is persisted (local network only)
  useEffect(() => {
    if (piDisabled) {
      console.log('[Backend Video] Skipping Pi discovery — running on HTTPS');
      return;
    }
    if (!getPersistedIp()) {
      console.log('[Backend Video] No persisted IP, starting discovery...');
      discoverRaspberryPi().then(ip => {
        console.log('[Backend Video] Discovery result:', ip);
        if (ip) {
          setBackendUrl(`http://${ip}:5000`);
        }
      });
    } else {
      console.log('[Backend Video] Using persisted IP:', getPersistedIp());
    }
  }, []);

  function clearTimers() {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }

  function closeSocket(ws) {
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    if (ws.readyState < WebSocket.CLOSING) ws.close();
  }

  const connect = useCallback(() => {
    if (deadRef.current) return;

    if (!backendUrl) {
      console.log('[Backend Video] No backend URL configured');
      setConnectionStatus('not configured');
      setIsStreaming(false);
      setError(null);
      return;
    }

    console.log('[Backend Video] Connecting to:', backendUrl);
    closeSocket(wsRef.current);
    wsRef.current = null;
    clearTimers();

    setConnectionStatus('connecting');
    setError(null);
    setIsStreaming(false);

    try {
      const currentWsUrl = backendUrl.replace(/^http/, 'ws') + '/ws';
      console.log('[Backend Video] WebSocket URL:', currentWsUrl);
      const ws = new WebSocket(currentWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (deadRef.current || wsRef.current !== ws) {
          closeSocket(ws);
          return;
        }

        setConnectionStatus('connected');
        setIsStreaming(true);
        setError(null);

        // Start heartbeat
        heartbeatTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          } else {
            clearTimers();
          }
        }, HEARTBEAT_MS);
      };

      ws.onmessage = (event) => {
        if (deadRef.current) return;

        try {
          const data = JSON.parse(event.data);

          // Handle Pi server format: {'video_frame': frame_base64}
          if (data.video_frame && videoRef.current) {
            videoRef.current.src = `data:image/jpeg;base64,${data.video_frame}`;
            setIsStreaming(true);
          }

          // Handle passenger count from separate message
          if (data.count !== undefined) {
            setPassengerCount(data.count);
          }

          // Handle combined format (backward compatibility)
          if (data.type === 'video_frame' && data.frame && videoRef.current) {
            videoRef.current.src = `data:image/jpeg;base64,${data.frame}`;
            setIsStreaming(true);
          }
        } catch (err) {
          console.error('[Backend Video] Error parsing message:', err);
        }
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        clearTimers();

        if (!deadRef.current) {
          setConnectionStatus('disconnected');
          setIsStreaming(false);
          setError('Connection closed');
        }
      };

      ws.onerror = (err) => {
        console.error('[Backend Video] WebSocket error:', err);
        if (!deadRef.current) {
          setError('Connection error');
        }
      };
    } catch (err) {
      console.error('[Backend Video] Connection error:', err);
      setError('Failed to connect');
      setConnectionStatus('error');
    }
  }, [backendUrl]);

  const disconnect = useCallback(() => {
    clearTimers();
    closeSocket(wsRef.current);
    wsRef.current = null;
    setIsStreaming(false);
    setConnectionStatus('disconnected');
  }, []);

  const refresh = useCallback(() => {
    disconnect();
    setTimeout(connect, 300);
  }, [disconnect, connect]);

  useEffect(() => {
    deadRef.current = false;

    console.log('[Backend Video] useEffect triggered', { autoConnect, backendUrl });
    if (autoConnect && backendUrl) {
      console.log('[Backend Video] Calling connect()');
      connect();
    } else {
      console.log('[Backend Video] Not connecting - autoConnect:', autoConnect, 'backendUrl:', backendUrl);
    }

    return () => {
      deadRef.current = true;
      clearTimers();
      closeSocket(wsRef.current);
      wsRef.current = null;
    };
  }, [autoConnect, connect, disconnect, backendUrl]);

  return {
    isStreaming,
    passengerCount,
    error,
    connectionStatus,
    videoRef,
    connect,
    disconnect,
    refresh,
  };
}
