/**
 * useBackendVideo - Connect to backend WebSocket for processed video stream
 * Receives video frames with YOLOv8 detection boxes from backend
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const HEARTBEAT_MS    = 25_000;
const RECONNECT_BASE  = 3_000;   // first retry after 3 s
const RECONNECT_MAX   = 30_000;  // cap at 30 s

export function useBackendVideo({ autoConnect = true } = {}) {
  const [isStreaming,      setIsStreaming]      = useState(false);
  const [passengerCount,   setPassengerCount]   = useState(0);
  const [error,            setError]            = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const wsRef           = useRef(null);
  const videoRef        = useRef(null);
  const heartbeatTimer  = useRef(null);
  const reconnectTimer  = useRef(null);
  const attemptsRef     = useRef(0);
  const deadRef         = useRef(false);
  const autoConnectRef  = useRef(autoConnect);
  autoConnectRef.current = autoConnect;

  // Stable — read once at mount so the ref never changes identity
  const backendUrl = useRef(
    import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
  ).current;

  // ── helpers ───────────────────────────────────────────────────────────────
  function clearTimers() {
    clearInterval(heartbeatTimer.current);
    clearTimeout(reconnectTimer.current);
    heartbeatTimer.current = null;
    reconnectTimer.current = null;
  }

  function closeSocket(ws) {
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    if (ws.readyState < WebSocket.CLOSING) ws.close();
  }

  // ── open one WebSocket ────────────────────────────────────────────────────
  function openSocket() {
    if (deadRef.current || !autoConnectRef.current) return;
    if (!backendUrl) {
      setConnectionStatus('not configured');
      return;
    }

    closeSocket(wsRef.current);
    wsRef.current = null;
    clearTimers();

    setConnectionStatus('connecting');
    setError(null);

    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/video-feed';
    console.log('[Backend Video] Connecting →', wsUrl);

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('[Backend Video] Failed to create WebSocket:', e);
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (deadRef.current || wsRef.current !== ws) { closeSocket(ws); return; }
      console.log('[Backend Video] Connected');
      attemptsRef.current = 0;
      setConnectionStatus('connected');
      setError(null);

      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(heartbeatTimer.current);
        }
      }, HEARTBEAT_MS);
    };

    ws.onmessage = (event) => {
      if (deadRef.current) return;
      try {
        const data = JSON.parse(event.data);

        // Backend sends: { type:'video_frame', frame:'<base64>', count: N }
        if (data.type === 'video_frame' && data.frame && videoRef.current) {
          videoRef.current.src = `data:image/jpeg;base64,${data.frame}`;
          setIsStreaming(true);
        }

        // Also handle flat format from Pi direct: { video_frame:'<base64>' }
        if (data.video_frame && videoRef.current) {
          videoRef.current.src = `data:image/jpeg;base64,${data.video_frame}`;
          setIsStreaming(true);
        }

        if (data.count !== undefined) {
          setPassengerCount(data.count);
        }
      } catch (e) {
        console.error('[Backend Video] Message parse error:', e);
      }
    };

    ws.onclose = (evt) => {
      if (wsRef.current !== ws) return;
      clearInterval(heartbeatTimer.current);
      if (deadRef.current) return;

      console.log('[Backend Video] Closed', evt.code, evt.reason);
      setConnectionStatus('disconnected');
      setIsStreaming(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onerror always fires before onclose — just log, let onclose reconnect
      if (!deadRef.current) setError('WebSocket error');
    };
  }

  function scheduleReconnect() {
    if (deadRef.current || !autoConnectRef.current) return;
    const delay = Math.min(
      RECONNECT_BASE * 1.5 ** attemptsRef.current,
      RECONNECT_MAX
    );
    attemptsRef.current += 1;
    console.log(`[Backend Video] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${attemptsRef.current})`);
    reconnectTimer.current = setTimeout(openSocket, delay);
  }

  // ── public API ────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    attemptsRef.current = 0;
    openSocket();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = useCallback(() => {
    deadRef.current = true;   // prevent reconnect
    clearTimers();
    closeSocket(wsRef.current);
    wsRef.current = null;
    setIsStreaming(false);
    setConnectionStatus('disconnected');
  }, []);

  const refresh = useCallback(() => {
    attemptsRef.current = 0;
    deadRef.current = false;
    clearTimers();
    closeSocket(wsRef.current);
    wsRef.current = null;
    setTimeout(openSocket, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    deadRef.current = false;
    console.log('[Backend Video] mount — autoConnect:', autoConnect, 'url:', backendUrl);
    if (autoConnect && backendUrl) openSocket();

    return () => {
      deadRef.current = true;
      clearTimers();
      closeSocket(wsRef.current);
      wsRef.current = null;
    };
  // Run once on mount only — openSocket reads refs, no deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
