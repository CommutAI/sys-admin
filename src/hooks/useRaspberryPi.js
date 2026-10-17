/**
 * useRaspberryPi - Hybrid Mode
 *
 * - Tries WebSocket connection first for video streaming
 * - Falls back to database mode if connection fails
 * - Shows video when Pi is reachable, shows database data when it's not
 * - Uses Supabase Realtime for database updates
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
import { supabase } from '../lib/supabase';

const RECONNECT_BASE     = 3_000;
const RECONNECT_MAX      = 30_000;
const CONNECT_TIMEOUT_MS = 12_000;
const HEARTBEAT_MS       = 30_000;
const BUS_NUMBER         = 1;

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
  const [piReachable,       setPiReachable]        = useState(null);
  const [currentPiUrl,      setCurrentPiUrl]       = useState(getPiBaseUrl());
  const [usingWebSocket,    setUsingWebSocket]    = useState(true); // true = WebSocket mode, false = DB mode

  // ── Refs ───────────────────────────────────────────────────────────────────
  const wsRef             = useRef(null);
  const videoRef          = useRef(null);
  const reconnectTimer    = useRef(null);
  const heartbeatTimer    = useRef(null);
  const connectTimer      = useRef(null);
  const attemptsRef       = useRef(0);
  const deadRef           = useRef(false);
  const fallbackModeRef   = useRef(false); // true if we've switched to DB mode

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
    if (deadRef.current || fallbackModeRef.current) return;
    clearTimeout(reconnectTimer.current);
    const delay = Math.min(RECONNECT_BASE * 1.5 ** attemptsRef.current, RECONNECT_MAX);
    attemptsRef.current += 1;
    reconnectTimer.current = setTimeout(openSocket, delay);
  }

  // ── Database fetch functions (fallback mode) ─────────────────────────────
  const fetchAssignedBus = async () => {
    try {
      const { data } = await supabase
        .from('pi_devices')
        .select('bus_id, bus_number')
        .eq('bus_number', BUS_NUMBER)
        .maybeSingle();

      if (data && data.bus_id) {
        const { data: busData } = await supabase
          .from('buses')
          .select('id, plate_number, bus_number')
          .eq('id', data.bus_id)
          .single();

        if (busData) {
          setAssignedBus({
            busId: busData.id,
            busNumber: busData.bus_number,
            busPlate: busData.plate_number
          });
          return busData.id;
        }
      }
      return null;
    } catch (err) {
      console.error('Error fetching assigned bus:', err);
      return null;
    }
  };

  const fetchActiveTrip = async (busId) => {
    if (!busId) return null;
    try {
      const { data } = await supabase
        .from('trips')
        .select('id')
        .eq('bus_id', busId)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.id) {
        setActiveTripId(data.id);
        setCurrentTripId(data.id);
        return data.id;
      }
      return null;
    } catch (err) {
      console.error('Error fetching active trip:', err);
      return null;
    }
  };

  const fetchLatestPassengerCount = async (tripId) => {
    if (!tripId) return;
    try {
      const { data } = await supabase
        .from('passenger_counts')
        .select('count, recorded_at')
        .eq('trip_id', tripId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setPassengerCount(data.count || 0);
        setLastUpdate(data.recorded_at ? new Date(data.recorded_at).toLocaleTimeString() : null);
      }
    } catch (err) {
      console.error('Error fetching passenger count:', err);
    }
  };

  const fetchHardwareStatus = async () => {
    try {
      const { data } = await supabase
        .from('hardware_status')
        .select('*')
        .order('last_check', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setHardwareStatus({
          camera: data.component === 'camera' ? data.status : 'unknown',
          gps: data.component === 'gps' ? data.status : 'unknown',
          sms: data.component === 'sms' ? data.status : 'unknown',
          emergency_button: data.component === 'emergency_button' ? data.status : 'unknown',
          last_updated: data.last_check
        });
        setCameraActive(data.component === 'camera' && data.status === 'active');
      }
    } catch (err) {
      console.error('Error fetching hardware status:', err);
    }
  };

  const fetchEmergencyStatus = async () => {
    try {
      const { data } = await supabase
        .from('emergency_alerts')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setEmergencyStatus({
          emergency_active: true,
          last_triggered: data.created_at,
          resolved: false
        });
      } else {
        setEmergencyStatus({
          emergency_active: false,
          last_triggered: null,
          resolved: true
        });
      }
    } catch (err) {
      console.error('Error fetching emergency status:', err);
    }
  };

  const fetchLatestLocation = async (tripId) => {
    if (!tripId || !enableLocation) return;
    try {
      const { data } = await supabase
        .from('gps_locations')
        .select('*')
        .eq('trip_id', tripId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setLocation({
          latitude: data.latitude,
          longitude: data.longitude,
          address: null,
          timestamp: data.recorded_at,
          speed: data.speed,
          heading: null
        });
      }
    } catch (err) {
      console.error('Error fetching location:', err);
    }
  };

  // ── Switch to database fallback mode ───────────────────────────────────────
  const switchToDatabaseMode = async () => {
    console.log('[Pi] Switching to database fallback mode');
    fallbackModeRef.current = true;
    setUsingWebSocket(false);
    clearAllTimers();
    closeSocket(wsRef.current);
    wsRef.current = null;

    setConnectionStatus('connected (database mode)');
    setOnline(true);
    setError(null);

    // Fetch data from database
    const busId = await fetchAssignedBus();
    if (busId) {
      const tripId = await fetchActiveTrip(busId);
      await fetchLatestPassengerCount(tripId);
      await fetchHardwareStatus();
      await fetchEmergencyStatus();
      await fetchLatestLocation(tripId);
    }
  };

  // ── WebSocket connect logic ────────────────────────────────────────────────
  async function openSocket() {
    if (deadRef.current || fallbackModeRef.current) return;

    closeSocket(wsRef.current);
    wsRef.current = null;
    clearAllTimers();

    safeSet(setConnectionStatus, 'connecting');
    safeSet(setOnline, false);
    safeSet(setIsStreaming, false);
    safeSet(setPiReachable, null);
    setUsingWebSocket(true);

    // Resolve URL from Supabase pi_devices
    let wsUrl, httpBase;
    try {
      const { resolvePiUrl } = await import('../services/raspberryPiApi');
      httpBase = await resolvePiUrl();
      wsUrl = httpBase.replace(/^http/, 'ws').replace(/\/?$/, '/ws');
      safeSet(setCurrentPiUrl, httpBase);
    } catch {
      console.log('[Pi] URL resolution failed, switching to database mode');
      switchToDatabaseMode();
      return;
    }

    if (deadRef.current) return;

    // Quick HTTP ping
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${httpBase}/`, { signal: ctrl.signal });
      clearTimeout(t);
      safeSet(setPiReachable, res.ok);
    } catch {
      console.log('[Pi] HTTP ping failed, switching to database mode');
      safeSet(setPiReachable, false);
      switchToDatabaseMode();
      return;
    }

    if (deadRef.current) return;

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      console.log('[Pi] WebSocket creation failed, switching to database mode');
      switchToDatabaseMode();
      return;
    }

    wsRef.current = ws;

    connectTimer.current = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.log('[Pi] WebSocket timeout, switching to database mode');
        closeSocket(ws);
        if (wsRef.current === ws) wsRef.current = null;
        switchToDatabaseMode();
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
      setUsingWebSocket(true);

      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heartbeat' }));
        else clearInterval(heartbeatTimer.current);
      }, HEARTBEAT_MS);

      ws.send(JSON.stringify({ action: 'start_stream' }));
      safeSet(setIsStreaming, true);

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
            const { data } = await supabase
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
      if (wsRef.current !== ws) return;
      clearAllTimers();
      if (deadRef.current) return;

      // If this is the first failure, switch to database mode
      if (attemptsRef.current < 3) {
        console.log('[Pi] WebSocket closed, switching to database mode');
        switchToDatabaseMode();
      } else {
        safeSet(setOnline,           false);
        safeSet(setIsStreaming,      false);
        safeSet(setConnectionStatus, 'connecting');
        scheduleReconnect();
      }
    };

    // ── onerror ───────────────────────────────────────────────────────────────
    ws.onerror = () => {
      clearTimeout(connectTimer.current);
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    fallbackModeRef.current = false;
    invalidatePiUrl();
    attemptsRef.current = 0;
    openSocket();
  }, []);

  const disconnect = useCallback(() => {
    clearAllTimers();
    closeSocket(wsRef.current);
    wsRef.current = null;
    fallbackModeRef.current = false;
    safeSet(setOnline,           false);
    safeSet(setIsStreaming,      false);
    safeSet(setConnectionStatus, 'disconnected');
    attemptsRef.current = 0;
  }, []);

  const refresh = useCallback(() => {
    fallbackModeRef.current = false;
    invalidatePiUrl();
    attemptsRef.current = 0;
    clearAllTimers();
    closeSocket(wsRef.current);
    wsRef.current = null;
    setTimeout(openSocket, 300);
  }, []);

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

    if (autoConnect) openSocket();

    // Subscribe to pi_devices changes for auto-reconnect on IP change
    const unsubscribe = subscribePiDeviceChanges((newUrl) => {
      if (deadRef.current) return;
      console.log('[Pi] Network changed, auto-reconnecting to:', newUrl);
      
      // Exit fallback mode and try WebSocket with new IP
      fallbackModeRef.current = false;
      invalidatePiUrl();
      attemptsRef.current = 0;
      clearAllTimers();
      closeSocket(wsRef.current);
      wsRef.current = null;
      
      // Small delay to ensure Pi is ready at new IP
      setTimeout(openSocket, 2000);
    });

    // Database realtime subscriptions (for fallback mode)
    const subscriptions = [];

    const passengerSub = supabase
      .channel('passenger-counts-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'passenger_counts'
      }, (payload) => {
        if (fallbackModeRef.current && activeTripId && payload.new?.trip_id === activeTripId) {
          setPassengerCount(payload.new.count || 0);
          setLastUpdate(payload.new.recorded_at ? new Date(payload.new.recorded_at).toLocaleTimeString() : null);
        }
      })
      .subscribe();
    subscriptions.push(passengerSub);

    const hardwareSub = supabase
      .channel('hardware-status-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'hardware_status'
      }, () => {
        if (fallbackModeRef.current) fetchHardwareStatus();
      })
      .subscribe();
    subscriptions.push(hardwareSub);

    const emergencySub = supabase
      .channel('emergency-alerts-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'emergency_alerts'
      }, () => {
        if (fallbackModeRef.current) fetchEmergencyStatus();
      })
      .subscribe();
    subscriptions.push(emergencySub);

    if (enableLocation) {
      const gpsSub = supabase
        .channel('gps-locations-changes')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'gps_locations'
        }, (payload) => {
          if (fallbackModeRef.current && activeTripId && payload.new?.trip_id === activeTripId) {
            setLocation({
              latitude: payload.new.latitude,
              longitude: payload.new.longitude,
              address: null,
              timestamp: payload.new.recorded_at,
              speed: payload.new.speed,
              heading: null
            });
          }
        })
        .subscribe();
      subscriptions.push(gpsSub);
    }

    return () => {
      deadRef.current = true;
      clearAllTimers();
      closeSocket(wsRef.current);
      wsRef.current = null;
      unsubscribe();
      subscriptions.forEach(sub => supabase.removeChannel(sub));
    };
  }, [autoConnect, activeTripId, enableLocation]);

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
    usingWebSocket,
    connect, disconnect, refresh, startStream, stopStream,
  };
}
