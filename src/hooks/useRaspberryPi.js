/**
 * useRaspberryPi
 *
 * - Auto-discovers the Pi URL from Supabase (pi_devices table) on every connect.
 * - Survives React 18 StrictMode double-invoke: the cleanup flag prevents the
 *   zombie socket opened during the first (thrown-away) mount from being used.
 * - Reconnects automatically with exponential back-off; no hard attempt cap.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  invalidatePiUrl,
  subscribePiDeviceChanges,
  getPiHealth,
  getPiLocation,
  getPiHardwareStatus,
  getPiEmergencyStatus,
  getPiBaseUrl,
} from '../services/raspberryPiApi';
import { supabaseAdmin } from '../lib/supabase';

const RECONNECT_BASE     = 3_000;
const RECONNECT_MAX      = 30_000;
const CONNECT_TIMEOUT_MS = 12_000;
const HEARTBEAT_MS       = 30_000;

export function useRaspberryPi(options = {}) {
  const {
    autoConnect       = true,
    enableLocation    = false,
  } = options;

  // ── UI state ──────────────────────────────────────────────────────────────
  const [online,            setOnline]            = useState(false);
  const [connectionStatus,  setConnectionStatus]  = useState('connecting');
  const [isStreaming,       setIsStreaming]        = useState(false);
  const [passengerCount,    setPassengerCount]     = useState(0);
  const [averageCount,      setAverageCount]       = useState(0);
  const [lastUpdate,        setLastUpdate]         = useState(null);
  const [cameraActive,      setCameraActive]       = useState(false);
  const [currentTripId,     setCurrentTripId]      = useState(null);
  const [connectedClients,  setConnectedClients]   = useState(0);
  const [assignedBus,       setAssignedBus]        = useState({ busId: null, busNumber: null, busPlate: null });
  const [activeTripId,      setActiveTripId]       = useState(null);
  const [hardwareStatus,    setHardwareStatus]     = useState({ camera:'unknown', gps:'unknown', sms:'unknown', emergency_button:'unknown', last_updated:null });
  const [emergencyStatus,   setEmergencyStatus]    = useState({ emergency_active:false, last_triggered:null, resolved:false });
  const [location,          setLocation]           = useState({ latitude:null, longitude:null, address:null, timestamp:null, speed:null, heading:null });
  const [error,             setError]              = useState(null);
  const [piReachable,       setPiReachable]        = useState(null); // null=checking, true=online, false=offline
  const [currentPiUrl,      setCurrentPiUrl]       = useState(getPiBaseUrl());

  // ── Refs (never stale inside plain functions) ─────────────────────────────
  const wsRef             = useRef(null);
  const videoRef          = useRef(null);
  const reconnectTimer    = useRef(null);
  const heartbeatTimer    = useRef(null);
  const connectTimer      = useRef(null);
  const attemptsRef       = useRef(0);
  const deadRef           = useRef(false);   // true after component unmounts

  // ── Helpers ───────────────────────────────────────────────────────────────
  function safeSet(setter, value) {
    if (!deadRef.current) setter(value);
  }

  function clearAllTimers() {
    clearTimeout(reconnectTimer.current);
    clearTimeout(connectTimer.current);
    clearInterval(heartbeatTimer.current);
  }

  function closeSocket(ws) {
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    if (ws.readyState < WebSocket.CLOSING) ws.close();
  }

  function scheduleReconnect() {
    if (deadRef.current) return;
    clearTimeout(reconnectTimer.current);
    const delay = Math.min(RECONNECT_BASE * 1.5 ** attemptsRef.current, RECONNECT_MAX);
    attemptsRef.current += 1;
    reconnectTimer.current = setTimeout(openSocket, delay);
  }

  // ── Main connect logic ────────────────────────────────────────────────────
  async function openSocket() {
    if (deadRef.current) return;

    // Close any existing socket cleanly
    closeSocket(wsRef.current);
    wsRef.current = null;
    clearAllTimers();

    safeSet(setConnectionStatus, 'connecting');
    safeSet(setOnline, false);
    safeSet(setIsStreaming, false);
    safeSet(setPiReachable, null);

    // Resolve URL from Supabase pi_devices (auto-discovery)
    let wsUrl, httpBase;
    try {
      const { resolvePiUrl } = await import('../services/raspberryPiApi');
      httpBase = await resolvePiUrl();
      wsUrl = httpBase.replace(/^http/, 'ws').replace(/\/?$/, '/ws');
      safeSet(setCurrentPiUrl, httpBase);
    } catch {
      scheduleReconnect();
      return;
    }

    if (deadRef.current) return;

    // Quick HTTP ping to tell the user whether the Pi is reachable at all
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${httpBase}/`, { signal: ctrl.signal });
      clearTimeout(t);
      safeSet(setPiReachable, res.ok);
    } catch {
      safeSet(setPiReachable, false);
      // Pi not reachable — no point opening WebSocket; just retry later
      scheduleReconnect();
      return;
    }

    if (deadRef.current) return;

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    wsRef.current = ws;

    // Hard timeout — abort if socket hasn't opened in time
    connectTimer.current = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        closeSocket(ws);
        if (wsRef.current === ws) wsRef.current = null;
        scheduleReconnect();
      }
    }, CONNECT_TIMEOUT_MS);

    // ── onopen ──────────────────────────────────────────────────────────────
    ws.onopen = async () => {
      if (deadRef.current || wsRef.current !== ws) { closeSocket(ws); return; }

      clearTimeout(connectTimer.current);
      attemptsRef.current = 0;

      safeSet(setOnline, true);
      safeSet(setConnectionStatus, 'connected');
      safeSet(setError, null);

      // Heartbeat
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heartbeat' }));
        else clearInterval(heartbeatTimer.current);
      }, HEARTBEAT_MS);

      // Start stream immediately
      ws.send(JSON.stringify({ action: 'start_stream' }));
      safeSet(setIsStreaming, true);

      // Fetch health / bus assignment
      try {
        const health = await getPiHealth();
        if (deadRef.current) return;

        safeSet(setCameraActive,     health.camera_active);
        safeSet(setPassengerCount,   health.passenger_count);
        safeSet(setCurrentTripId,    health.current_trip_id);
        safeSet(setConnectedClients, health.connected_clients);

        if (health.bus_id) {
          safeSet(setAssignedBus, { busId: health.bus_id, busNumber: health.bus_number, busPlate: health.bus_plate });

          try {
            const { data } = await supabaseAdmin
              .from('trips')
              .select('id')
              .eq('bus_id', health.bus_id)
              .eq('status', 'in_progress')
              .order('started_at', { ascending: false })
              .limit(1)
              .single();

            if (data?.id) {
              safeSet(setActiveTripId, data.id);
              if (ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ action: 'set_trip', trip_id: data.id }));
            }
          } catch { /* no active trip */ }
        }

        const hw = await getPiHardwareStatus();
        safeSet(setHardwareStatus, hw);

        const em = await getPiEmergencyStatus();
        safeSet(setEmergencyStatus, em);

        if (enableLocation) {
          try {
            const loc = await getPiLocation();
            safeSet(setLocation, loc);
          } catch { /* GPS not connected */ }
        }
      } catch { /* health fetch failed — stream still active */ }
    };

    // ── onmessage ────────────────────────────────────────────────────────────
    ws.onmessage = (event) => {
      if (deadRef.current) return;
      try {
        const data = JSON.parse(event.data);

        if (data.video_frame && videoRef.current) {
          videoRef.current.src = `data:image/jpeg;base64,${data.video_frame}`;
          safeSet(setIsStreaming, true);
        }
        if (data.count !== undefined) {
          safeSet(setPassengerCount, data.count);
          safeSet(setAverageCount,   data.average_count != null ? Number(data.average_count).toFixed(1) : '0');
          safeSet(setLastUpdate,     new Date().toLocaleTimeString());
        }
        if (data.camera_active !== undefined) safeSet(setCameraActive,  data.camera_active);
        if (data.current_trip_id !== undefined) safeSet(setCurrentTripId, data.current_trip_id);
      } catch { /* malformed */ }
    };

    // ── onclose ──────────────────────────────────────────────────────────────
    ws.onclose = () => {
      if (wsRef.current !== ws) return;  // stale socket — ignore
      clearAllTimers();
      if (deadRef.current) return;
      safeSet(setOnline,           false);
      safeSet(setIsStreaming,      false);
      safeSet(setConnectionStatus, 'connecting');
      scheduleReconnect();
    };

    // ── onerror ───────────────────────────────────────────────────────────────
    ws.onerror = () => {
      // onclose always fires after onerror — let it handle retry
      clearTimeout(connectTimer.current);
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    invalidatePiUrl();          // force fresh discovery on manual connect
    attemptsRef.current = 0;
    openSocket();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(() => {
    clearAllTimers();
    closeSocket(wsRef.current);
    wsRef.current = null;
    safeSet(setOnline,           false);
    safeSet(setIsStreaming,      false);
    safeSet(setConnectionStatus, 'disconnected');
    attemptsRef.current = 0;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    invalidatePiUrl();
    attemptsRef.current = 0;
    clearAllTimers();
    closeSocket(wsRef.current);
    wsRef.current = null;
    setTimeout(openSocket, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startStream = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'start_stream' }));
      safeSet(setIsStreaming, true);
    }
  }, []);

  const stopStream = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'stop_stream' }));
      safeSet(setIsStreaming, false);
    }
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    deadRef.current = false;

    // Start connecting immediately using fallback URL (env var) — no waiting
    if (autoConnect) openSocket();

    // Subscribe to Supabase Realtime for pi_devices changes.
    // When the Pi registers a new IP (new network), reconnect immediately.
    const unsubscribe = subscribePiDeviceChanges((_newUrl) => {
      if (deadRef.current) return;
      console.log('[Pi] IP changed via realtime — reconnecting…');
      invalidatePiUrl();
      attemptsRef.current = 0;
      clearAllTimers();
      closeSocket(wsRef.current);
      wsRef.current = null;
      // Small delay so the Pi's server has time to fully start
      setTimeout(openSocket, 1500);
    });

    return () => {
      deadRef.current = true;
      clearAllTimers();
      closeSocket(wsRef.current);
      wsRef.current = null;
      unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    online, connectionStatus, error,
    raspberryPiUrl: currentPiUrl,
    piReachable,
    assignedBus, activeTripId,
    cameraActive, passengerCount, averageCount,
    currentTripId, connectedClients,
    hardwareStatus, emergencyStatus, location,
    isStreaming, lastUpdate, videoRef,
    connect, disconnect, refresh, startStream, stopStream,
  };
}
