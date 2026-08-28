/**
 * Custom hook for managing Raspberry Pi connection and state
 * Handles WebSocket connection, automatic reconnection, and state management
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  checkPiServer,
  getPiHealth,
  getPiLocation,
  getPiHardwareStatus,
  getPiEmergencyStatus,
  createPiWebSocket,
  startVideoStream,
  stopVideoStream,
  getPiBaseUrl
} from '../services/raspberryPiApi';

const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

export function useRaspberryPi(options = {}) {
  const {
    autoConnect = true,
    healthCheckInterval = HEALTH_CHECK_INTERVAL,
    enableHealthCheck = true,
    enableLocation = false // Disable location by default since GPS is not connected
  } = options;

  // Connection state
  const [online, setOnline] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected', 'connecting', 'connected', 'error'
  const [error, setError] = useState(null);

  // Raspberry Pi state
  const [cameraActive, setCameraActive] = useState(false);
  const [passengerCount, setPassengerCount] = useState(0);
  const [averageCount, setAverageCount] = useState(0);
  const [currentTripId, setCurrentTripId] = useState(null);
  const [connectedClients, setConnectedClients] = useState(0);

  // Hardware and emergency state
  const [hardwareStatus, setHardwareStatus] = useState({
    camera: 'unknown',
    gps: 'unknown',
    sms: 'unknown',
    emergency_button: 'unknown',
    last_updated: null
  });
  const [emergencyStatus, setEmergencyStatus] = useState({
    emergency_active: false,
    last_triggered: null,
    resolved: false
  });
  const [location, setLocation] = useState({
    latitude: null,
    longitude: null,
    address: null,
    timestamp: null,
    speed: null,
    heading: null
  });

  // Video streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Refs for WebSocket and timers
  const wsRef = useRef(null);
  const videoRef = useRef(null);
  const healthCheckRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  /**
   * Initialize connection to Raspberry Pi
   */
  const connect = useCallback(async () => {
    try {
      setConnectionStatus('connecting');
      setError(null);

      // First check if server is running
      const serverRunning = await checkPiServer();
      if (!serverRunning) {
        throw new Error('Raspberry Pi server is not running at ' + getPiBaseUrl());
      }

      // Get initial health status
      const health = await getPiHealth();
      setCameraActive(health.camera_active);
      setPassengerCount(health.passenger_count);
      setCurrentTripId(health.current_trip_id);
      setConnectedClients(health.connected_clients);

      // Get hardware status (optional - may fail if database not configured)
      const hwStatus = await getPiHardwareStatus();
      setHardwareStatus(hwStatus);

      // Get emergency status
      const emStatus = await getPiEmergencyStatus();
      setEmergencyStatus(emStatus);

      // Get location (optional - skip if not available or disabled)
      if (enableLocation) {
        try {
          const loc = await getPiLocation();
          setLocation(loc);
        } catch (locationError) {
          console.warn('Location service unavailable (GPS not connected):', locationError.message);
          setLocation({
            latitude: null,
            longitude: null,
            address: null,
            timestamp: null,
            speed: null,
            heading: null
          });
        }
      } else {
        // Set default location state when disabled
        setLocation({
          latitude: null,
          longitude: null,
          address: 'Location disabled',
          timestamp: null,
          speed: null,
          heading: null
        });
      }

      // Establish WebSocket connection
      wsRef.current = createPiWebSocket(
        handleWebSocketMessage,
        handleWebSocketOpen,
        handleWebSocketClose,
        handleWebSocketError
      );

      if (wsRef.current) {
        setOnline(true);
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
      } else {
        throw new Error('Failed to establish WebSocket connection');
      }

    } catch (err) {
      console.error('Failed to connect to Raspberry Pi:', err);
      setError(err.message);
      setConnectionStatus('error');
      setOnline(false);

      // Only attempt reconnection if autoConnect is enabled and we haven't exceeded max attempts
      // Also don't reconnect if the error suggests the server is permanently unavailable
      if (autoConnect && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
        console.log(`Reconnection attempt ${reconnectAttemptsRef.current} in ${delay}ms`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    }
  }, [autoConnect]);

  /**
   * Disconnect from Raspberry Pi
   */
  const disconnect = useCallback(() => {
    // Clear timers
    if (healthCheckRef.current) {
      clearInterval(healthCheckRef.current);
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Reset state
    setOnline(false);
    setConnectionStatus('disconnected');
    setIsStreaming(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  /**
   * Refresh connection
   */
  const refresh = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setTimeout(connect, 1000);
  }, [disconnect, connect]);

  /**
   * Start video stream
   */
  const startStream = useCallback(() => {
    if (wsRef.current && online) {
      const success = startVideoStream(wsRef.current);
      if (success) {
        setIsStreaming(true);
      }
    }
  }, [online]);

  /**
   * Stop video stream
   */
  const stopStream = useCallback(() => {
    if (wsRef.current && online) {
      const success = stopVideoStream(wsRef.current);
      if (success) {
        setIsStreaming(false);
      }
    }
  }, [online]);

  /**
   * Handle WebSocket open event
   */
  const handleWebSocketOpen = useCallback(() => {
    console.log('WebSocket connection established');
    setOnline(true);
    setConnectionStatus('connected');
    setError(null);
    reconnectAttemptsRef.current = 0;
    // Auto-start stream immediately after WebSocket connects
    if (wsRef.current) {
      startVideoStream(wsRef.current);
      setIsStreaming(true);
    }
  }, []);

  /**
   * Handle WebSocket message event
   */
  const handleWebSocketMessage = useCallback((data) => {
    // Handle video frame
    if (data.video_frame && videoRef.current) {
      videoRef.current.src = `data:image/jpeg;base64,${data.video_frame}`;
      setIsStreaming(true);
    }

    // Handle passenger count
    if (data.count !== undefined) {
      setPassengerCount(data.count);
      setAverageCount(data.average_count ? data.average_count.toFixed(1) : '0');
      setLastUpdate(new Date().toLocaleTimeString());
    }

    // Handle status updates
    if (data.status) {
      console.log('Server status:', data.status);
    }

    // Handle errors
    if (data.error) {
      setError(data.error);
      console.error('Server error:', data.error);
    }

    // Handle camera status
    if (data.camera_active !== undefined) {
      setCameraActive(data.camera_active);
    }

    // Handle trip ID updates
    if (data.current_trip_id !== undefined) {
      setCurrentTripId(data.current_trip_id);
    }
  }, []);

  /**
   * Handle WebSocket close event
   */
  const handleWebSocketClose = useCallback(() => {
    console.log('WebSocket connection closed');
    setOnline(false);
    setConnectionStatus('disconnected');
    setIsStreaming(false);

    // Auto-reconnect if enabled
    if (autoConnect && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttemptsRef.current++;
      const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
      console.log(`Reconnection attempt ${reconnectAttemptsRef.current} in ${delay}ms`);
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    }
  }, [autoConnect, connect]);

  /**
   * Handle WebSocket error event
   */
  const handleWebSocketError = useCallback((error) => {
    console.error('WebSocket error:', error);
    setError('Connection error occurred');
    setConnectionStatus('error');
  }, []);

  /**
   * Perform health check
   */
  const performHealthCheck = useCallback(async () => {
    try {
      const health = await getPiHealth();
      setCameraActive(health.camera_active);
      setPassengerCount(health.passenger_count);
      setCurrentTripId(health.current_trip_id);
      setConnectedClients(health.connected_clients);

      // Update other statuses periodically
      const hwStatus = await getPiHardwareStatus();
      setHardwareStatus(hwStatus);

      const emStatus = await getPiEmergencyStatus();
      setEmergencyStatus(emStatus);

      // Get location only if enabled
      if (enableLocation) {
        try {
          const loc = await getPiLocation();
          setLocation(loc);
        } catch (locationError) {
          console.warn('Location service unavailable during health check:', locationError.message);
        }
      }

      // Update connection status based on health check
      if (health.server_running && !online) {
        setOnline(true);
        setConnectionStatus('connected');
      } else if (!health.server_running && online) {
        setOnline(false);
        setConnectionStatus('error');
      }

    } catch (error) {
      console.error('Health check failed:', error);
      if (online) {
        setOnline(false);
        setConnectionStatus('error');
        setError('Raspberry Pi server unavailable - health check failed');
      }
    }
  }, [online]);

  /**
   * Effect: Auto-connect on mount
   */
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  /**
   * Effect: Set up periodic health checks
   */
  useEffect(() => {
    if (enableHealthCheck && online) {
      healthCheckRef.current = setInterval(performHealthCheck, healthCheckInterval);
    }

    return () => {
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
      }
    };
  }, [enableHealthCheck, online, healthCheckInterval, performHealthCheck]);

  return {
    // Connection state
    online,
    connectionStatus,
    error,
    raspberryPiUrl: getPiBaseUrl(),

    // Raspberry Pi state
    cameraActive,
    passengerCount,
    averageCount,
    currentTripId,
    connectedClients,
    hardwareStatus,
    emergencyStatus,
    location,

    // Video streaming
    isStreaming,
    lastUpdate,
    videoRef,

    // Actions
    connect,
    disconnect,
    refresh,
    startStream,
    stopStream
  };
}
