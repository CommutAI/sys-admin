/**
 * Raspberry Pi API Service Layer
 * Handles all communication with the Raspberry Pi FastAPI server
 * Provides timeout handling, error management, and HTTP/WebSocket communication
 */

const RASPBERRY_PI_URL = import.meta.env.VITE_RASPBERRY_PI_URL || 'http://192.168.1.45:5000';
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const WEBSOCKET_TIMEOUT = 15000; // 15 seconds for WebSocket connection (increased from 5s)

/**
 * Generic HTTP request handler with timeout
 */
async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 503) {
        throw new Error('Service Unavailable - Raspberry Pi server is not running');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Check if Raspberry Pi server is running
 */
export async function checkPiServer() {
  try {
    const response = await fetchWithTimeout(`${RASPBERRY_PI_URL}/`, {}, DEFAULT_TIMEOUT);
    return response.message === 'Bus Monitoring Video Server Running (FastAPI)';
  } catch (error) {
    console.error('Failed to check Pi server:', error);
    return false;
  }
}

/**
 * Get comprehensive health status from Raspberry Pi
 */
export async function getPiHealth() {
  try {
    const health = await fetchWithTimeout(`${RASPBERRY_PI_URL}/health`, {}, DEFAULT_TIMEOUT);
    return {
      camera_active: health.camera_active || false,
      passenger_count: health.passenger_count || 0,
      connected_clients: health.connected_clients || 0,
      current_trip_id: health.current_trip_id || null,
      server_running: true
    };
  } catch (error) {
    console.error('Failed to get Pi health:', error);
    return {
      camera_active: false,
      passenger_count: 0,
      connected_clients: 0,
      current_trip_id: null,
      server_running: false
    };
  }
}

/**
 * Get current location from Raspberry Pi
 */
export async function getPiLocation() {
  try {
    const location = await fetchWithTimeout(`${RASPBERRY_PI_URL}/location`, {}, DEFAULT_TIMEOUT);
    return {
      latitude: location.latitude || null,
      longitude: location.longitude || null,
      address: location.address || null,
      timestamp: location.timestamp || null,
      speed: location.speed || null,
      heading: location.heading || null
    };
  } catch (error) {
    // Location service is optional - don't log errors as it's expected when GPS is not connected
    return {
      latitude: null,
      longitude: null,
      address: 'Location unavailable (GPS not connected)',
      timestamp: null,
      speed: null,
      heading: null
    };
  }
}

/**
 * Get hardware status from Raspberry Pi
 */
export async function getPiHardwareStatus() {
  try {
    const status = await fetchWithTimeout(`${RASPBERRY_PI_URL}/hardware-status`, {}, DEFAULT_TIMEOUT);
    return {
      camera: status.camera || 'unknown',
      gps: status.gps || 'unknown',
      sms: status.sms || 'unknown',
      emergency_button: status.emergency_button || 'unknown',
      last_updated: status.last_updated || null
    };
  } catch (error) {
    // Hardware status may not be available if database is not configured
    // or if the Raspberry Pi server is not running
    // Silently return unavailable status without logging
    console.warn('Hardware status unavailable (this is expected if database is not configured):', error.message);
    return {
      camera: 'unavailable',
      gps: 'unavailable',
      sms: 'unavailable',
      emergency_button: 'unavailable',
      last_updated: null
    };
  }
}

/**
 * Get emergency status from Raspberry Pi
 */
export async function getPiEmergencyStatus() {
  try {
    const status = await fetchWithTimeout(`${RASPBERRY_PI_URL}/emergency-status`, {}, DEFAULT_TIMEOUT);
    return {
      emergency_active: status.emergency_active || false,
      last_triggered: status.last_triggered || null,
      resolved: status.resolved || false
    };
  } catch (error) {
    console.error('Failed to get Pi emergency status:', error);
    return {
      emergency_active: false,
      last_triggered: null,
      resolved: false
    };
  }
}

/**
 * Get SMS logs from Raspberry Pi
 */
export async function getPiSmsLogs(limit = 100, offset = 0) {
  try {
    const logs = await fetchWithTimeout(
      `${RASPBERRY_PI_URL}/sms-logs?limit=${limit}&offset=${offset}`,
      {},
      DEFAULT_TIMEOUT
    );
    return logs.logs || [];
  } catch (error) {
    console.error('Failed to get Pi SMS logs:', error);
    return [];
  }
}

/**
 * Get GPS locations from Raspberry Pi
 */
export async function getPiGpsLocations(tripId = null, limit = 100, offset = 0) {
  try {
    const url = tripId 
      ? `${RASPBERRY_PI_URL}/gps-locations?trip_id=${tripId}&limit=${limit}&offset=${offset}`
      : `${RASPBERRY_PI_URL}/gps-locations?limit=${limit}&offset=${offset}`;
    const locations = await fetchWithTimeout(url, {}, DEFAULT_TIMEOUT);
    return locations.locations || [];
  } catch (error) {
    console.error('Failed to get Pi GPS locations:', error);
    return [];
  }
}

/**
 * Get emergency alerts from Raspberry Pi
 */
export async function getPiEmergencyAlerts(resolved = null, limit = 100, offset = 0) {
  try {
    const url = resolved !== null
      ? `${RASPBERRY_PI_URL}/emergency-alerts?resolved=${resolved}&limit=${limit}&offset=${offset}`
      : `${RASPBERRY_PI_URL}/emergency-alerts?limit=${limit}&offset=${offset}`;
    const alerts = await fetchWithTimeout(url, {}, DEFAULT_TIMEOUT);
    return alerts.alerts || [];
  } catch (error) {
    console.error('Failed to get Pi emergency alerts:', error);
    return [];
  }
}

/**
 * Get SMS statistics from Raspberry Pi
 */
export async function getPiSmsStatistics(days = 7) {
  try {
    const stats = await fetchWithTimeout(
      `${RASPBERRY_PI_URL}/sms-statistics?days=${days}`,
      {},
      DEFAULT_TIMEOUT
    );
    return stats;
  } catch (error) {
    console.error('Failed to get Pi SMS statistics:', error);
    return null;
  }
}

/**
 * Get GPS statistics from Raspberry Pi
 */
export async function getPiGpsStatistics(days = 7) {
  try {
    const stats = await fetchWithTimeout(
      `${RASPBERRY_PI_URL}/gps-statistics?days=${days}`,
      {},
      DEFAULT_TIMEOUT
    );
    return stats;
  } catch (error) {
    console.error('Failed to get Pi GPS statistics:', error);
    return null;
  }
}

/**
 * Get address from coordinates using Raspberry Pi
 */
export async function getPiAddressLookup(lat, lon) {
  try {
    const address = await fetchWithTimeout(
      `${RASPBERRY_PI_URL}/address-lookup?lat=${lat}&lon=${lon}`,
      {},
      DEFAULT_TIMEOUT
    );
    return address;
  } catch (error) {
    console.error('Failed to get Pi address lookup:', error);
    return null;
  }
}

/**
 * Set current trip ID on Raspberry Pi
 */
export async function setPiTrip(tripId) {
  try {
    const response = await fetchWithTimeout(
      `${RASPBERRY_PI_URL}/set-trip`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trip_id: tripId }),
      },
      DEFAULT_TIMEOUT
    );
    return response.status === 'success';
  } catch (error) {
    console.error('Failed to set Pi trip:', error);
    return false;
  }
}

/**
 * Clear current trip ID on Raspberry Pi
 */
export async function clearPiTrip() {
  try {
    const response = await fetchWithTimeout(
      `${RASPBERRY_PI_URL}/clear-trip`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      DEFAULT_TIMEOUT
    );
    return response.status === 'success';
  } catch (error) {
    console.error('Failed to clear Pi trip:', error);
    return false;
  }
}

/**
 * Get video feed URL for MJPEG stream
 */
export function getPiVideoFeedUrl() {
  return `${RASPBERRY_PI_URL}/video_feed`;
}

/**
 * Get WebSocket URL for real-time communication
 */
export function getPiWebSocketUrl() {
  // Convert HTTP URL to WebSocket URL
  let wsUrl = RASPBERRY_PI_URL;
  if (wsUrl.startsWith('http://')) {
    wsUrl = wsUrl.replace('http://', 'ws://');
  } else if (wsUrl.startsWith('https://')) {
    wsUrl = wsUrl.replace('https://', 'wss://');
  }
  
  // Ensure /ws endpoint
  if (!wsUrl.endsWith('/ws')) {
    wsUrl = wsUrl.replace(/\/$/, '') + '/ws';
  }
  
  return wsUrl;
}

/**
 * Create WebSocket connection with timeout
 */
export function createPiWebSocket(onMessage, onOpen, onClose, onError) {
  const wsUrl = getPiWebSocketUrl();
  let ws = null;
  let timeoutId = null;

  try {
    ws = new WebSocket(wsUrl);

    // Set connection timeout
    timeoutId = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        if (onError) onError(new Error('WebSocket connection timeout'));
      }
    }, WEBSOCKET_TIMEOUT);

    ws.onopen = () => {
      clearTimeout(timeoutId);
      console.log('WebSocket connected to Raspberry Pi');
      if (onOpen) onOpen();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessage) onMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      clearTimeout(timeoutId);
      console.log('WebSocket disconnected from Raspberry Pi');
      if (onClose) onClose();
    };

    ws.onerror = (error) => {
      clearTimeout(timeoutId);
      console.error('WebSocket error:', error);
      if (onError) onError(error);
    };

    return ws;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Failed to create WebSocket connection:', error);
    if (onError) onError(error);
    return null;
  }
}

/**
 * Send action through WebSocket
 */
export function sendWebSocketAction(ws, action) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(action));
    return true;
  }
  return false;
}

/**
 * Start video stream through WebSocket
 */
export function startVideoStream(ws) {
  return sendWebSocketAction(ws, { action: 'start_stream' });
}

/**
 * Stop video stream through WebSocket
 */
export function stopVideoStream(ws) {
  return sendWebSocketAction(ws, { action: 'stop_stream' });
}

/**
 * Get the base Raspberry Pi URL
 */
export function getPiBaseUrl() {
  return RASPBERRY_PI_URL;
}
