/**
 * Raspberry Pi API Service Layer
 *
 * Auto-discovery: on first use, the Pi URL is fetched from the `pi_devices`
 * table in Supabase (where the Pi registers itself on startup).
 * The result is cached in memory so every subsequent call uses the live IP.
 * Falls back to VITE_RASPBERRY_PI_URL if Supabase has no record yet.
 */

import { supabase } from '../lib/supabase';

const LAN_HINT_URL    = 'http://192.168.1.54:8080';
const FALLBACK_URL   = (import.meta.env.VITE_RASPBERRY_PI_URL || '').replace(/\/$/, '') || LAN_HINT_URL;
const DEFAULT_TIMEOUT = 8000;
const BUS_NUMBER      = 1; // this dashboard manages bus 001

// ── URL cache ────────────────────────────────────────────────────────────────
let _resolvedUrl  = '';
let _resolving    = null;
let _lastResolved = 0;
const REDISCOVER_INTERVAL = 10_000;

async function probePiUrl(url, timeoutMs = 2500) {
  if (!url) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve the Pi's base HTTP URL.
 * 1. Prefer a reachable VITE_RASPBERRY_PI_URL (LAN or live tunnel).
 * 2. On HTTPS origins, try dynamic Cloudflare/ngrok tunnel from Supabase pi_devices (backend_url).
 * 3. On HTTP origins, try pi_devices LAN IP from Supabase, then tunnel, then LAN hint.
 */
export async function resolvePiUrl() {
  const now = Date.now();
  const envUrl = (import.meta.env.VITE_RASPBERRY_PI_URL || '').replace(/\/$/, '');
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';

  // Return cache if still fresh and still reachable
  if (_resolvedUrl && now - _lastResolved < REDISCOVER_INTERVAL) {
    return _resolvedUrl;
  }

  if (_resolving) return _resolving;

  _resolving = (async () => {
    // 1) Explicit env URL if provided
    if (envUrl) {
      if (!isHttpsPage || envUrl.startsWith('https://')) {
        if (await probePiUrl(envUrl)) {
          console.log('[Pi] Using env URL:', envUrl);
          _resolvedUrl = envUrl;
          _lastResolved = Date.now();
          return envUrl;
        }
      }
    }

    // 2) Supabase registration (holds LAN IP, port, and Cloudflare tunnel in backend_url)
    try {
      const { data, error } = await supabase
        .from('pi_devices')
        .select('ip_address, port, backend_url')
        .eq('bus_number', BUS_NUMBER)
        .maybeSingle();

      if (!error && data) {
        // If on HTTPS, we MUST use a secure HTTPS tunnel URL to avoid mixed-content blocking
        if (isHttpsPage) {
          if (data.backend_url && data.backend_url.startsWith('https://')) {
            if (await probePiUrl(data.backend_url)) {
              console.log('[Pi] Using Supabase tunnel URL:', data.backend_url);
              _resolvedUrl = data.backend_url;
              _lastResolved = Date.now();
              return data.backend_url;
            }
          }
        } else {
          // If on HTTP origin (localhost / LAN dev), try LAN IP first
          if (data.ip_address) {
            const url = `http://${data.ip_address}:${data.port || 8080}`;
            if (await probePiUrl(url)) {
              console.log('[Pi] Using pi_devices LAN URL:', url);
              _resolvedUrl = url;
              _lastResolved = Date.now();
              return url;
            }
          }
          // Also try tunnel URL on HTTP if LAN isn't directly reachable
          if (data.backend_url && data.backend_url.startsWith('https://')) {
            if (await probePiUrl(data.backend_url)) {
              console.log('[Pi] Using pi_devices tunnel URL:', data.backend_url);
              _resolvedUrl = data.backend_url;
              _lastResolved = Date.now();
              return data.backend_url;
            }
          }
        }
      } else if (error && error.code !== '42P01') {
        console.warn('[Pi] pi_devices lookup error:', error.message);
      }
    } catch (e) {
      console.warn('[Pi] pi_devices lookup threw:', e?.message || e);
    }

    // 3) On HTTP pages only: try known LAN hint used by this project
    if (!isHttpsPage && await probePiUrl(LAN_HINT_URL)) {
      console.log('[Pi] Using LAN hint URL:', LAN_HINT_URL);
      _resolvedUrl = LAN_HINT_URL;
      _lastResolved = Date.now();
      return LAN_HINT_URL;
    }

    // If on HTTPS and no tunnel was reachable, return empty string cleanly
    if (isHttpsPage) {
      console.warn('[Pi] No reachable HTTPS tunnel found — running in database/backend mode on HTTPS');
      _resolvedUrl = '';
      _lastResolved = Date.now();
      return '';
    }

    console.warn('[Pi] Falling back to', FALLBACK_URL, '(may be unreachable)');
    _resolvedUrl = FALLBACK_URL;
    _lastResolved = Date.now();
    return FALLBACK_URL;
  })().finally(() => { _resolving = null; });

  return _resolving;
}

/** Force re-discovery on the next call (e.g. after a manual refresh) */
export function invalidatePiUrl() {
  _resolvedUrl  = '';  // reset to empty, force discovery
  _lastResolved = 0;
}

/**
 * Subscribe to pi_devices realtime changes for bus 1.
 * Calls onIpChange(newUrl) whenever the Pi registers a new IP.
 * Returns an unsubscribe function.
 */
export function subscribePiDeviceChanges(onIpChange) {
  // On HTTPS, ignore local IP updates from pi_devices — always use the ngrok URL
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return () => {};
  }

  const channel = supabase
    .channel('pi-device-watch')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pi_devices', filter: `bus_number=eq.${BUS_NUMBER}` },
      (payload) => {
        const row = payload.new;
        if (row?.ip_address) {
          const url = `http://${row.ip_address}:${row.port || 5000}`;
          // Update cache immediately
          _resolvedUrl  = url;
          _lastResolved = Date.now();
          onIpChange(url);
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') throw new Error(`Timeout after ${timeout}ms`);
    throw err;
  }
}

// ── WebSocket URL ─────────────────────────────────────────────────────────────

export async function resolvePiWebSocketUrl() {
  const base = await resolvePiUrl();
  return base.replace(/^http/, 'ws').replace(/\/?$/, '/ws');
}

/** Synchronous fallback used by hooks that already have the URL cached */
export function getPiWebSocketUrl() {
  const base = _resolvedUrl || FALLBACK_URL;
  return base.replace(/^http/, 'ws').replace(/\/?$/, '/ws');
}

export function getPiVideoFeedUrl() {
  return `${_resolvedUrl || FALLBACK_URL}/video_feed`;
}

export function getPiBaseUrl() {
  return _resolvedUrl || FALLBACK_URL;
}

// ── Pi endpoints ──────────────────────────────────────────────────────────────

export async function getPiHealth() {
  try {
    const base   = await resolvePiUrl();
    const health = await fetchWithTimeout(`${base}/health`);
    return {
      camera_active:    health.camera_active    || false,
      passenger_count:  health.passenger_count  || 0,
      connected_clients:health.connected_clients|| 0,
      current_trip_id:  health.current_trip_id  || null,
      bus_id:           health.bus_id           || null,
      bus_number:       health.bus_number        || null,
      bus_plate:        health.bus_plate         || null,
      server_running:   true,
    };
  } catch {
    return { camera_active:false, passenger_count:0, connected_clients:0,
             current_trip_id:null, bus_id:null, bus_number:null, bus_plate:null,
             server_running:false };
  }
}

export async function getPiLocation() {
  try {
    const base = await resolvePiUrl();
    const loc  = await fetchWithTimeout(`${base}/location`);
    return { latitude:loc.latitude||null, longitude:loc.longitude||null,
             address:loc.address||null, timestamp:loc.timestamp||null,
             speed:loc.speed||null, heading:loc.heading||null };
  } catch {
    return { latitude:null, longitude:null,
             address:'Location unavailable (GPS not connected)',
             timestamp:null, speed:null, heading:null };
  }
}

export async function getPiHardwareStatus() {
  try {
    const base   = await resolvePiUrl();
    const status = await fetchWithTimeout(`${base}/hardware-status`);
    return { camera:status.camera||'unknown', gps:status.gps||'unknown',
             sms:status.sms||'unknown', emergency_button:status.emergency_button||'unknown',
             last_updated:status.last_updated||null };
  } catch {
    return { camera:'unavailable', gps:'unavailable', sms:'unavailable',
             emergency_button:'unavailable', last_updated:null };
  }
}

export async function getPiEmergencyStatus() {
  try {
    const base   = await resolvePiUrl();
    const status = await fetchWithTimeout(`${base}/emergency-status`);
    return { emergency_active:status.emergency_active||false,
             last_triggered:status.last_triggered||null, resolved:status.resolved||false };
  } catch {
    return { emergency_active:false, last_triggered:null, resolved:false };
  }
}

export async function checkPiServer() {
  try {
    const base = await resolvePiUrl();
    const res  = await fetchWithTimeout(`${base}/`);
    return !!res.message;
  } catch {
    return false;
  }
}

export async function setPiTrip(tripId) {
  try {
    const base = await resolvePiUrl();
    const res  = await fetchWithTimeout(`${base}/set-trip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_id: tripId }),
    });
    return res.status === 'success';
  } catch { return false; }
}

export async function clearPiTrip() {
  try {
    const base = await resolvePiUrl();
    const res  = await fetchWithTimeout(`${base}/clear-trip`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' } });
    return res.status === 'success';
  } catch { return false; }
}

export async function getPiSmsLogs(limit = 100, offset = 0) {
  try {
    const base = await resolvePiUrl();
    const res  = await fetchWithTimeout(`${base}/sms-logs?limit=${limit}&offset=${offset}`);
    return res.logs || [];
  } catch { return []; }
}

export async function getPiGpsLocations(tripId = null, limit = 100, offset = 0) {
  try {
    const base = await resolvePiUrl();
    const url  = tripId
      ? `${base}/gps-locations?trip_id=${tripId}&limit=${limit}&offset=${offset}`
      : `${base}/gps-locations?limit=${limit}&offset=${offset}`;
    const res = await fetchWithTimeout(url);
    return res.locations || [];
  } catch { return []; }
}

export async function getPiEmergencyAlerts(resolved = null, limit = 100, offset = 0) {
  try {
    const base = await resolvePiUrl();
    const url  = resolved !== null
      ? `${base}/emergency-alerts?resolved=${resolved}&limit=${limit}&offset=${offset}`
      : `${base}/emergency-alerts?limit=${limit}&offset=${offset}`;
    const res = await fetchWithTimeout(url);
    return res.alerts || [];
  } catch { return []; }
}

export async function getPiSmsStatistics(days = 7) {
  try {
    const base = await resolvePiUrl();
    return await fetchWithTimeout(`${base}/sms-statistics?days=${days}`);
  } catch { return null; }
}

export async function getPiGpsStatistics(days = 7) {
  try {
    const base = await resolvePiUrl();
    return await fetchWithTimeout(`${base}/gps-statistics?days=${days}`);
  } catch { return null; }
}

export async function getPiAddressLookup(lat, lon) {
  try {
    const base = await resolvePiUrl();
    return await fetchWithTimeout(`${base}/address-lookup?lat=${lat}&lon=${lon}`);
  } catch { return null; }
}

// ── Legacy sync helpers (kept for backward compat) ───────────────────────────

export function sendWebSocketAction(ws, action) {
  if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(action)); return true; }
  return false;
}
export function startVideoStream(ws) { return sendWebSocketAction(ws, { action: 'start_stream' }); }
export function stopVideoStream(ws)  { return sendWebSocketAction(ws, { action: 'stop_stream'  }); }
