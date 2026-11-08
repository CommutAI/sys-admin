/**
 * useBackendVideo - Connect to backend WebSocket for processed video stream
 * Receives video frames with YOLOv8m detection boxes from backend
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getPersistedIp, discoverRaspberryPi } from '../services/piAutoDiscovery';

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

  // Auto-detect backend URL from Pi discovery
  const [backendUrl, setBackendUrl] = useState(() => {
    const piIp = getPersistedIp();
    return piIp ? `http://${piIp}:5000` : null;
  });
  
  const wsUrl = backendUrl
    ? backendUrl.replace(/^http/, 'ws') + '/ws/video-feed'
    : null;

  // Auto-discover Pi if no IP is persisted
  useEffect(() => {
    if (!getPersistedIp()) {
      discoverRaspberryPi().then(ip => {
        if (ip) {
          setBackendUrl(`http://${ip}:5000`);
        }
      });
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
      setConnectionStatus('not configured');
      setIsStreaming(false);
      setError(null);
      return;
    }

    closeSocket(wsRef.current);
    wsRef.current = null;
    clearTimers();

    setConnectionStatus('connecting');
    setError(null);
    setIsStreaming(false);

    try {
      const currentWsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/video-feed';
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

          if (data.type === 'video_frame' && data.frame && videoRef.current) {
            videoRef.current.src = `data:image/jpeg;base64,${data.frame}`;
            setIsStreaming(true);
          }

          if (data.count !== undefined) {
            setPassengerCount(data.count);
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

    if (autoConnect && backendUrl) {
      connect();
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
