import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { Users, DollarSign, Bus, AlertTriangle, Map as MapIcon, CheckCircle, Clock, Search, Video, Camera, Activity, Brain, RefreshCw, Filter, Navigation, MapPin, X, Maximize2, Minimize2, Download, ShieldCheck, Zap, Film, Gauge } from 'lucide-react';
import { supabase } from '../lib/supabase';
import 'leaflet/dist/leaflet.css';
import { useRaspberryPi } from '../hooks/useRaspberryPi';
import { useBackendVideo } from '../hooks/useBackendVideo';
import { getPiVideoFeedUrl } from '../services/raspberryPiApi';
import AuditService from '../services/auditService';
import L from 'leaflet';

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Route coordinates: Manolo Fortich Terminal to Agora Terminal, Cagayan de Oro
const ROUTE_COORDINATES = [
  [8.366264151737736, 124.86574877578431], // Manolo Fortich Bus Terminal
  [8.3720, 124.8580],
  [8.3780, 124.8500],
  [8.3840, 124.8420],
  [8.3900, 124.8340],
  [8.3960, 124.8260],
  [8.4020, 124.8180],
  [8.4080, 124.8100],
  [8.4140, 124.8020],
  [8.4200, 124.7940],
  [8.4260, 124.7860],
  [8.4320, 124.7780],
  [8.4380, 124.7700],
  [8.4440, 124.7620],
  [8.4500, 124.7540],
  [8.4560, 124.7460],
  [8.4620, 124.7380],
  [8.4680, 124.7300],
  [8.4740, 124.7220],
  [8.4800, 124.7140],
  [8.4860, 124.7060],
  [8.488898925316661, 124.65764707858631], // Agora Terminal
];

// Calculate distance between two coordinates in kilometers (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Calculate total route distance
const calculateRouteDistance = (coordinates) => {
  return coordinates.reduce((total, coord, index) => {
    if (index === 0) return 0;
    const prevCoord = coordinates[index - 1];
    return total + calculateDistance(prevCoord[0], prevCoord[1], coord[0], coord[1]);
  }, 0);
};

let ROUTE_TOTAL_DISTANCE = calculateRouteDistance(ROUTE_COORDINATES);

// Calculate bus progress along the route (0-100%)
const calculateRouteProgress = (lat, lng, coordinates) => {
  let minDistance = Infinity;
  let closestIndex = 0;
  let totalDistanceToClosest = 0;

  // Find the closest point on the route
  coordinates.forEach((coord, index) => {
    const distance = calculateDistance(lat, lng, coord[0], coord[1]);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = index;
    }
  });

  // Calculate distance from start to the closest point
  for (let i = 0; i < closestIndex; i++) {
    totalDistanceToClosest += calculateDistance(
      coordinates[i][0], coordinates[i][1],
      coordinates[i + 1][0], coordinates[i + 1][1]
    );
  }

  const totalDistance = calculateRouteDistance(coordinates);
  const progress = (totalDistanceToClosest / totalDistance) * 100;
  return Math.min(Math.max(progress, 0), 100); // Clamp between 0-100
};

// Determine route direction based on progress
const getRouteDirection = (progress) => {
  if (progress < 50) return 'Manolo Fortich → Agora';
  if (progress > 50) return 'Agora → Manolo Fortich';
  return 'Near Agora Terminal';
};

// Estimate time to destination (assuming average speed of 40 km/h)
const estimateTimeToDestination = (progress, routeDistance = ROUTE_TOTAL_DISTANCE) => {
  const remainingProgress = 100 - progress;
  const remainingDistance = (remainingProgress / 100) * routeDistance;
  const avgSpeed = 40; // km/h
  const timeHours = remainingDistance / avgSpeed;
  const timeMinutes = Math.round(timeHours * 60);

  if (timeMinutes < 60) return `${timeMinutes} min`;
  const hours = Math.floor(timeMinutes / 60);
  const mins = timeMinutes % 60;
  return `${hours}h ${mins}m`;
};



const KPICard = ({ title, value, change, icon: Icon, color }) => (
  <div className="glass-card p-4 sm:p-6 hover:scale-105 transition-transform duration-300">
    <div className="flex items-center justify-between mb-4">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
      </div>
      <span className={`text-xs sm:text-sm ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {change >= 0 ? '+' : ''}{change}%
      </span>
    </div>
    <h3 className="text-white/60 text-xs sm:text-sm mb-1">{title}</h3>
    <p className="text-white text-xl sm:text-3xl font-bold">{value}</p>
  </div>
);

// Bus Details Modal Component
const BusDetailsModal = ({ bus, onClose }) => {
  if (!bus) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[999999] p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative z-[1000000]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700 bg-gray-800">
          <h2 className="text-white text-lg sm:text-xl font-bold flex items-center gap-2">
            <Bus className="text-orange-400" size={24} />
            Bus #{bus.plate || 'N/A'} Details
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Split Pane Content - Responsive */}
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-700">
          {/* Left Column */}
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Route */}
            <div>
              <p className="text-gray-400 text-sm mb-1">Route</p>
              <p className="text-white font-semibold">{bus.route}</p>
            </div>

            {/* Status */}
            <div>
              <p className="text-gray-400 text-sm mb-1">Status</p>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                bus.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
              }`}>
                {bus.status}
              </span>
            </div>

            {/* Passengers */}
            <div>
              <p className="text-gray-400 text-sm mb-1">Passengers</p>
              <p className="text-white text-2xl sm:text-3xl font-bold flex items-center gap-2">
                <Users className="text-orange-400" size={24} />
                {bus.passengers}
              </p>
            </div>

            {/* GPS Coordinates */}
            <div>
              <p className="text-gray-400 text-sm mb-1">GPS Coordinates</p>
              <p className="text-white font-mono text-xs sm:text-sm bg-gray-800 p-3 rounded-lg border border-gray-700 break-all">
                {Number(bus.lat).toFixed(6)}, {Number(bus.lng).toFixed(6)}
              </p>
            </div>

            {/* GPS Source */}
            <div>
              <p className="text-gray-400 text-sm mb-1">GPS Source</p>
              <span className={`px-3 py-1 rounded-full text-sm ${
                bus.locationSource?.includes('driver_phone') || bus.locationSource?.includes('phone') || bus.locationSource === 'gps'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {bus.locationSource?.includes('driver_phone') || bus.locationSource?.includes('phone')
                  ? '📱 Driver Phone GPS'
                  : bus.locationSource === 'gps'
                  ? '🛰️ Satellite GPS'
                  : bus.locationSource || 'fallback'}
              </span>
            </div>
          </div>

          {/* Right Column */}
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-800/50">
            {/* Route Progress */}
            {bus.routeProgress !== undefined && (
              <>
                <div>
                  <p className="text-gray-400 text-sm mb-2">Route Progress</p>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 bg-gray-700 rounded-full h-4">
                      <div
                        className="bg-orange-500 h-4 rounded-full transition-all duration-300"
                        style={{ width: `${bus.routeProgress}%` }}
                      />
                    </div>
                    <span className="text-orange-400 font-bold text-lg sm:text-xl min-w-[60px] sm:min-w-[70px] text-right">
                      {bus.routeProgress.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-gray-400 text-sm mb-1">Direction</p>
                  <p className="text-white font-semibold text-base sm:text-lg">{bus.routeDirection}</p>
                </div>

                <div>
                  <p className="text-gray-400 text-sm mb-1">ETA to Destination</p>
                  <p className="text-white font-semibold text-xl sm:text-2xl">{bus.eta}</p>
                </div>
              </>
            )}

            {/* Last Update */}
            <div>
              <p className="text-gray-400 text-sm mb-1">Last Update</p>
              <p className="text-white font-semibold text-sm">
                {bus.locationUpdatedAt ? new Date(bus.locationUpdatedAt).toLocaleString() : 'No data'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-700 bg-gray-800">
          <button
            onClick={onClose}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Animated Bus Marker Component
const AnimatedBusMarker = ({ bus, onClick }) => {
  const markerRef = useRef(null);

  useEffect(() => {
    if (markerRef.current) {
      // Smooth transition to new position
      markerRef.current.setLatLng([bus.lat, bus.lng]);
    }
  }, [bus.lat, bus.lng]);

  return (
    <Marker
      ref={markerRef}
      position={[bus.lat, bus.lng]}
      eventHandlers={{
        click: () => onClick && onClick(bus),
      }}
    >
      <Popup>
        <div className="p-3 min-w-[250px]">
          <h3 className="font-bold text-lg mb-2 text-gray-800">Bus #{bus.plate || 'N/A'}</h3>
          <div className="space-y-1 text-sm text-gray-700">
            <p><strong>Route:</strong> {bus.route}</p>
            <p><strong>Status:</strong> <span className={`px-2 py-0.5 rounded text-xs ${bus.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{bus.status}</span></p>
            <p><strong>Passengers:</strong> {bus.passengers}</p>

            {/* Route Progress */}
            {bus.routeProgress !== undefined && (
              <>
                <div className="mt-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">Route Progress</span>
                    <span className="font-semibold text-orange-600">{bus.routeProgress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${bus.routeProgress}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-600"><strong>Direction:</strong> {bus.routeDirection}</p>
                <p className="text-xs text-gray-600"><strong>ETA to Destination:</strong> {bus.eta}</p>
              </>
            )}

            <p className="text-gray-500 text-xs mt-2">
              GPS: {Number(bus.lat).toFixed(6)}, {Number(bus.lng).toFixed(6)}
            </p>
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Source:</span>
                {bus.locationSource?.includes('driver_phone') || bus.locationSource?.includes('phone') ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    📱 Driver Phone GPS
                  </span>
                ) : bus.locationSource?.includes('gps') && !bus.locationSource?.includes('ip') && !bus.locationSource?.includes('pi') && !bus.locationSource?.includes('anchor') ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    🛰️ Satellite GPS
                  </span>
                ) : bus.locationSource?.includes('terminal') || bus.locationSource?.includes('anchor') ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300" title="Stationary at Terminal (No GPS Fix)">
                    📍 Terminal (Stationary)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 border border-blue-300">
                    📶 {bus.locationSource || 'fallback'}
                  </span>
                )}
              </div>
              {bus.locationUpdatedAt && (
                <p className="text-gray-400 text-[11px]">
                  Last update: {new Date(bus.locationUpdatedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

// Video monitoring feed viewport with tactical HUD overlays
const CompactVideoFeed = ({
  online,
  connectionStatus,
  passengerCount,
  isStreaming,
  videoRef,
  refresh,
  cameraActive,
  piReachable,
  usingBackend,
  currentTripId,
  assignedBus,
  locationSource,
  isFullWidth = false,
}) => {
  const [useMjpeg, setUseMjpeg] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  const showLive = isStreaming || useMjpeg;

  // Real-time clock for CCTV HUD
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Snapshot capture handler
  const handleSnapshot = () => {
    try {
      if (!videoRef?.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.naturalWidth || 640;
      canvas.height = videoRef.current.naturalHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const a = document.createElement('a');
        a.download = `bus_monitoring_${assignedBus?.busNumber || '001'}_${Date.now()}.jpg`;
        a.href = canvas.toDataURL('image/jpeg', 0.95);
        a.click();
      }
    } catch (e) {
      console.warn('Snapshot capture error:', e);
    }
  };

  const statusColor = showLive ? 'text-green-400' : online ? 'text-yellow-400' : 'text-red-400';
  const statusLabel = showLive ? 'Live Feed' : online ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting…' : 'Offline';

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Sub-header tool strip */}
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/80 font-medium">EMEET C60E 4K Sensor</span>
          <span className="text-[10px] text-white/30">·</span>
          <span className="text-xs text-emerald-400 font-mono font-medium">60 FPS Live</span>
          <span className="text-[10px] text-white/30">·</span>
          <span className="text-xs text-purple-300 font-medium">YOLOv8n ONNX Edge</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-cyan-300/80 bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded-md">
            <Zap size={11} className="text-cyan-400" />
            Zero-Delay Sync
          </span>

          <button
            onClick={handleSnapshot}
            disabled={!showLive}
            title="Capture Frame Snapshot"
            className="bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 text-white p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <Download size={14} />
          </button>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button
            onClick={refresh}
            title="Refresh Video Stream"
            className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Video Viewport Container - Matches map dimensions in split mode, expands in full width */}
      <div className={`relative bg-zinc-950 rounded-xl overflow-hidden border border-white/10 shadow-xl ${
        isFullWidth ? 'h-[400px] sm:h-[520px] lg:h-[580px]' : 'h-[350px] sm:h-[500px]'
      } w-full`}>
        {/* Live video image */}
        <img
          ref={videoRef}
          alt="Live bus camera feed"
          className="w-full h-full object-contain"
          style={{ visibility: isStreaming && !useMjpeg ? 'visible' : 'hidden' }}
        />

        {!usingBackend && useMjpeg && (
          <img src={getPiVideoFeedUrl()} alt="MJPEG feed" className="w-full h-full object-contain" />
        )}

        {/* Tactical HUD Corner Reticles */}
        <div className="pointer-events-none absolute inset-0 p-3 flex flex-col justify-between">
          <div className="flex justify-between">
            <div className="w-4 h-4 border-t-2 border-l-2 border-cyan-400/50" />
            <div className="w-4 h-4 border-t-2 border-r-2 border-cyan-400/50" />
          </div>
          <div className="flex justify-between">
            <div className="w-4 h-4 border-b-2 border-l-2 border-cyan-400/50" />
            <div className="w-4 h-4 border-b-2 border-r-2 border-cyan-400/50" />
          </div>
        </div>

        {/* Offline / Connecting placeholder */}
        {!showLive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/90 backdrop-blur-sm p-6 text-center">
            {/* Camera explicitly off — only shown when Pi is confirmed reachable */}
            {cameraActive === false && online && piReachable === true ? (
              <>
                <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                  <Camera size={26} />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Camera Hardware Disconnected</p>
                  <p className="text-white/40 text-xs mt-1">Check EMEET C60E USB connection on Raspberry Pi</p>
                </div>
                <button onClick={refresh} className="mt-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition-colors">
                  <RefreshCw size={12} /> Retry Camera
                </button>
              </>
            ) : !online ? (
              <>
                <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400">
                  <Camera size={26} />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Connecting to Onboard Video Server...</p>
                  <p className="text-white/40 text-xs mt-1">Connecting to Raspberry Pi port 8080 (Zero-Delay ONNX Stream)</p>
                </div>
                <button onClick={refresh} className="mt-2 px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors">
                  <RefreshCw size={12} /> Reconnect
                </button>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 animate-pulse">
                  <Video size={26} />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Initializing Real-Time Stream...</p>
                  <p className="text-white/40 text-xs mt-1">Activating YOLOv8n ONNX Edge Pipeline & Kinematic Tracking</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* HUD Top Bar Overlay */}
        {showLive && (
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none gap-2 flex-wrap">
            {/* Status / Recording Badge */}
            <div className="bg-black/75 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1 flex items-center gap-2 shadow-lg">
              {currentTripId ? (
                <>
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                  <span className="text-red-400 text-xs font-bold tracking-wider">REC</span>
                  <span className="text-white/60 text-[10px] font-mono border-l border-white/10 pl-2">
                    TRIP #{currentTripId.slice(0, 8)}
                  </span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                  <span className="text-emerald-400 text-xs font-bold tracking-wider">LIVE</span>
                  <span className="text-white/50 text-[10px] font-mono border-l border-white/10 pl-2">
                    STANDBY (DISPLAY ONLY)
                  </span>
                </>
              )}
            </div>

            {/* Right HUD info: Headcount + Real-Time Clock */}
            <div className="flex items-center gap-2">
              <div className="bg-black/75 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1 flex items-center gap-1.5 shadow-lg">
                <Users size={13} className="text-orange-400" />
                <span className="text-white text-xs font-bold">{passengerCount}</span>
                <span className="text-white/50 text-[10px]">Onboard</span>
              </div>

              {currentTime && (
                <div className="bg-black/75 backdrop-blur-md border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1.5 shadow-lg">
                  <Clock size={12} className="text-cyan-400" />
                  <span className="text-white/90 text-xs font-mono font-medium">{currentTime}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* HUD Bottom Bar Overlay */}
        {showLive && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none text-[10px] font-mono text-white/70">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded px-2 py-0.5 flex items-center gap-1.5">
                <Zap size={11} className="text-yellow-400" />
                <span className="text-white/90 font-medium">Zero-Delay Sync</span>
                <span className="text-white/40">·</span>
                <span className="text-emerald-400 font-semibold">60 FPS</span>
              </div>
              {(locationSource?.includes('phone') || locationSource?.includes('driver')) && (
                <div className="bg-emerald-950/80 backdrop-blur-md border border-emerald-500/30 text-emerald-300 rounded px-2 py-0.5 flex items-center gap-1">
                  <span>📱</span>
                  <span className="font-semibold">Driver GPS Active</span>
                </div>
              )}
            </div>

            <div className="hidden sm:flex bg-black/70 backdrop-blur-md border border-white/10 rounded px-2 py-0.5 items-center gap-1.5">
              <Brain size={11} className="text-purple-400" />
              <span>YOLOv8n ONNX Edge (Sync Mode)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [kpis, setKpis] = useState([
    { title: "Today's Passengers", value: '0', change: 0, icon: Users, color: 'bg-blue-500' },
    { title: 'Total Revenue', value: '$0', change: 0, icon: DollarSign, color: 'bg-green-500' },
    { title: 'Bus Fare Revenue', value: '$0', change: 0, icon: Bus, color: 'bg-purple-500' },
    { title: 'Baggage Fee Revenue', value: '$0', change: 0, icon: DollarSign, color: 'bg-orange-500' },
  ]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({
    totalRoutes: 0,
    activeDrivers: 0,
    activeConductors: 0,
    avgTripDuration: '0 min',
    seatUtilization: '0%',
    totalBusFare: 0,
    totalBaggageFees: 0
  });
  const [loading, setLoading] = useState(true);
  const [buses, setBuses] = useState([]);
  const [mapStats, setMapStats] = useState({
    totalPassengers: 0,
    activeBuses: 0,
    totalRoutes: 0,
    maintenanceBuses: 0
  });
  const [selectedBus, setSelectedBus] = useState(null);
  const [emergencyAlerts, setEmergencyAlerts] = useState([]);
  const [alertFilterStatus, setAlertFilterStatus] = useState('all');
  const [alertSearchTerm, setAlertSearchTerm] = useState('');
  const [routeCoordinates, setRouteCoordinates] = useState(ROUTE_COORDINATES);
  const [isVideoFullWidth, setIsVideoFullWidth] = useState(false);

  const sharedVideoRef = useRef(null);

  // Single Raspberry Pi connection — shared between status indicators and the video widget
  // Always use backend video (Pi -> backend -> dashboard) with auto-discovery
  const {
    online: piOnline,
    connectionStatus: piConnectionStatus,
    cameraActive: piCameraActive,
    passengerCount: piPassengerCount,
    currentTripId: piCurrentTripId,
    emergencyStatus: piEmergencyStatus,
    hardwareStatus: piHardwareStatus,
    isStreaming: piIsStreaming,
    refresh: piRefresh,
    assignedBus: piAssignedBus,
    activeTripId: piActiveTripId,
    usingWebSocket: piUsingWebSocket,
    piReachable,
  } = useRaspberryPi({ autoConnect: true, enableHealthCheck: true, videoRef: sharedVideoRef });

  // Backend video connection — Render processes frames with YOLO and streams to dashboard
  const {
    isStreaming: backendStreaming,
    connectionStatus: backendConnectionStatus,
    passengerCount: backendCount,
    tripId: backendTripIdFromWs,
    refresh: backendRefresh,
  } = useBackendVideo({ autoConnect: true, videoRef: sharedVideoRef });

  // Backend video processing status — not used in Pi ONNX mode
  const [backendTripId, setBackendTripId] = useState(null);

  useEffect(() => {
    fetchDashboardData();
    fetchLiveMapData();
    fetchEmergencyAlerts();
    fetchRouteFromOSRM();

    // Log page view to audit logs
    AuditService.logPageView('Dashboard');

    // Set up real-time subscription for trips
    const tripsSubscription = supabase
      .channel('trips-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchLiveMapData();
      })
      .subscribe();

    const gpsSubscription = supabase
      .channel('dashboard-gps-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_locations' }, () => {
        fetchLiveMapData();
      })
      .subscribe();

    // Set up real-time subscription for emergency alerts
    const alertsSubscription = supabase
      .channel('emergency-alerts-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, () => {
        fetchEmergencyAlerts();
      })
      .subscribe();

    return () => {
      tripsSubscription.unsubscribe();
      gpsSubscription.unsubscribe();
      alertsSubscription.unsubscribe();
    };
  }, []);

  // Keep Render backend alive — ping every 10 minutes to prevent spin-down
  // Note: Use root endpoint instead of /health to avoid ad blocker blocking
  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://sys-admin-62ro.onrender.com';
    const keepAlive = () => {
      // Use HEAD request to root endpoint (less likely to be blocked than /health)
      fetch(`${backendUrl}/`, { method: 'HEAD', mode: 'no-cors' })
        .catch(() => {}); // silent fail
    };
    keepAlive(); // ping immediately on mount
    const interval = setInterval(keepAlive, 10 * 60 * 1000); // every 10 min
    return () => clearInterval(interval);
  }, []);

  // Auto-start video stream when Pi connects
  useEffect(() => {
    if (piOnline && piCameraActive && !piIsStreaming) {
      // Start stream automatically when Pi is online and camera is active
      const timer = setTimeout(() => {
        if (piOnline && piCameraActive && !piIsStreaming) {
          console.log('[Dashboard] Auto-starting video stream');
          // The stream will start automatically via WebSocket on connection
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [piOnline, piCameraActive, piIsStreaming]);

  // Synchronize Live Bus Tracking passenger count with real-time Bus Video Monitoring count
  useEffect(() => {
    const liveVideoCount = backendCount || piPassengerCount || 0;
    const monitoredTripId = backendTripIdFromWs || piActiveTripId || piCurrentTripId;
    const monitoredBusId = piAssignedBus?.busId;
    const monitoredPlate = piAssignedBus?.busPlate;

    setBuses(prevBuses => {
      if (!prevBuses || prevBuses.length === 0) return prevBuses;
      let hasChanges = false;
      const updated = prevBuses.map(bus => {
        const isMonitoredBus = (
          (monitoredBusId && (bus.id === monitoredBusId || bus.busId === monitoredBusId)) ||
          (monitoredPlate && bus.plate === monitoredPlate) ||
          (monitoredTripId && bus.tripId === monitoredTripId) ||
          (prevBuses.length === 1 && (backendStreaming || piIsStreaming || piOnline))
        );
        if (isMonitoredBus && bus.passengers !== liveVideoCount) {
          hasChanges = true;
          return { ...bus, passengers: liveVideoCount };
        }
        return bus;
      });

      if (hasChanges) {
        const newTotal = updated
          .filter(b => b.status === 'active')
          .reduce((sum, b) => sum + (b.passengers || 0), 0);
        setMapStats(prev => ({ ...prev, totalPassengers: newTotal }));
        return updated;
      }
      return prevBuses;
    });
  }, [backendCount, piPassengerCount, backendStreaming, piIsStreaming, piOnline, backendTripIdFromWs, piActiveTripId, piCurrentTripId, piAssignedBus]);

  const fetchRouteFromOSRM = async () => {
    try {
      // Use OSRM (Open Source Routing Machine) public API
      const startLat = 8.366264151737736;
      const startLng = 124.86574877578431;
      const endLat = 8.488898925316661;
      const endLng = 124.65764707858631;

      console.log('Fetching route from OSRM:', startLat, startLng, 'to', endLat, endLng);

      // Try multiple OSRM servers
      const servers = [
        'https://router.project-osrm.org',
        'https://routing.openstreetmap.de',
        'https://osrm.gosm.io'
      ];

      let routeFound = false;

      for (const server of servers) {
        try {
          const response = await fetch(
            `${server}/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`
          );

          if (!response.ok) {
            console.log(`Server ${server} returned error:`, response.statusText);
            continue;
          }

          const data = await response.json();
          console.log(`OSRM response from ${server}:`, data);

          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const geometry = data.routes[0].geometry;
            // Convert GeoJSON coordinates to Leaflet format [lat, lng]
            const coordinates = geometry.coordinates.map(coord => [coord[1], coord[0]]);
            setRouteCoordinates(coordinates);
            ROUTE_TOTAL_DISTANCE = calculateRouteDistance(coordinates);
            console.log('Route fetched from OSRM:', coordinates.length, 'points');
            console.log('Total route distance:', ROUTE_TOTAL_DISTANCE.toFixed(2), 'km');
            routeFound = true;
            break;
          }
        } catch (err) {
          console.log(`Error with server ${server}:`, err);
          continue;
        }
      }

      if (!routeFound) {
        console.log('No OSRM server returned a valid route, using detailed manual waypoints');
        // Use detailed manual waypoints that follow the actual road
        const manualRoute = [
          [8.366264151737736, 124.86574877578431], // Manolo Fortich Bus Terminal
          [8.3700, 124.8600],
          [8.3750, 124.8520],
          [8.3800, 124.8440],
          [8.3850, 124.8360],
          [8.3900, 124.8280],
          [8.3950, 124.8200],
          [8.4000, 124.8120],
          [8.4050, 124.8040],
          [8.4100, 124.7960],
          [8.4150, 124.7880],
          [8.4200, 124.7800],
          [8.4250, 124.7720],
          [8.4300, 124.7640],
          [8.4350, 124.7560],
          [8.4400, 124.7480],
          [8.4450, 124.7400],
          [8.4500, 124.7320],
          [8.4550, 124.7240],
          [8.4600, 124.7160],
          [8.4650, 124.7080],
          [8.4700, 124.7000],
          [8.4750, 124.6920],
          [8.4800, 124.6840],
          [8.4850, 124.6760],
          [8.488898925316661, 124.65764707858631], // Agora Terminal
        ];
        setRouteCoordinates(manualRoute);
        ROUTE_TOTAL_DISTANCE = calculateRouteDistance(manualRoute);
        console.log('Using manual route with', manualRoute.length, 'waypoints');
      }
    } catch (error) {
      console.error('Error fetching route from OSRM:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const today = new Date();
      // Use Philippine time (UTC+8) for "today" boundary so it's consistent
      // regardless of the browser's local timezone
      const phOffset = 8 * 60; // minutes
      const utcMinutes = today.getTime() / 60000 + today.getTimezoneOffset();
      const phMidnight = new Date((utcMinutes - (utcMinutes % 1440) + (phOffset % 1440 === 0 ? 0 : 1440 - (phOffset % 1440)) % 1440 - phOffset) * 60000);
      // Simpler approach: format today's date in PH time then parse as UTC+8 midnight
      const phDateStr = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // 'YYYY-MM-DD'
      const todayStart = new Date(`${phDateStr}T00:00:00+08:00`).toISOString();

      // Parallelize all independent queries for significant performance improvement
      const [
        { data: buses },
        { data: trips },
        { data: boardedPassengers },
        { data: irregularities },
        { data: emergencyAlerts },
        { data: staffUsers }
      ] = await Promise.all([
        // Fetch active buses
        supabase.from('buses').select('*').eq('status', 'active'),

        // Fetch today's trips
        supabase.from('trips').select('*, bus_id:buses!trips_bus_id_fkey(*)').gte('started_at', todayStart),

        // Fetch boarded passengers (QR scans/tickets) for today
        supabase.from('boarded_passengers').select('*').gte('boarded_at', todayStart),

        // Fetch fare irregularities for today
        supabase.from('fare_irregularities')
          .select('*, trips!fare_irregularities_trip_id_fkey(*, bus_id:buses!trips_bus_id_fkey(*))')
          .gte('detected_at', todayStart)
          .order('detected_at', { ascending: false })
          .limit(10),

        // Fetch emergency alerts - simplified query to avoid 400 error
        supabase.from('emergency_alerts')
          .select('*')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(5),

        // Fetch staff users
        supabase.from('staff_users').select('*').eq('is_active', true)
      ]);

      // Calculate KPIs based on tickets (QR scans) instead of YOLO counting
      const totalPassengers = boardedPassengers?.length || 0;
      const totalTrips = trips?.length || 0;
      const activeBusesCount = buses?.length || 0;
      const activeConductorsCount = staffUsers?.filter(u => u.role === 'conductor').length || 0;
      const activeDriversCount = staffUsers?.filter(u => u.role === 'driver').length || 0;

      // Calculate today's revenue from completed transactions (Philippine time)
      const { data: todayTransactions } = await supabase
        .from('transactions')
        .select('final_amount, fare_amount, baggage_fee, status')
        .eq('status', 'completed')
        .gte('created_at', todayStart);

      const totalRevenue = (todayTransactions || []).reduce((sum, t) => sum + parseFloat(t.final_amount || t.fare_amount || 0), 0);
      const busFareRevenue = (todayTransactions || []).reduce((sum, t) => sum + parseFloat(t.fare_amount || 0), 0);
      const baggageFeeRevenue = (todayTransactions || []).reduce((sum, t) => sum + parseFloat(t.baggage_fee || 0), 0);

      setKpis([
        { title: "Today's Passengers", value: totalPassengers.toLocaleString(), change: 8.5, icon: Users, color: 'bg-blue-500' },
        { title: 'Total Revenue', value: `₱${totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, change: 12.3, icon: DollarSign, color: 'bg-green-500' },
        { title: 'Bus Fare Revenue', value: `₱${busFareRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, change: 10.1, icon: Bus, color: 'bg-purple-500' },
        { title: 'Baggage Fee Revenue', value: `₱${baggageFeeRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, change: 15.2, icon: DollarSign, color: 'bg-orange-500' },
      ]);

      // Transform irregularities to alerts
      const irregularityAlerts = (irregularities || []).map(irr => ({
        type: `${irr.type.replace('_', ' ').toUpperCase()}`,
        message: `Trip #${irr.trip_id?.slice(0, 8)} - ${irr.description}`,
        time: new Date(irr.detected_at).toLocaleString(),
        severity: irr.type === 'fare_evasion' ? 'high' : 'medium',
        buses: irr.trips?.bus_id
      }));

      // Transform emergency alerts
      const emergencyAlertList = (emergencyAlerts || []).map(alert => ({
        type: 'EMERGENCY ALERT',
        message: alert.notes || 'Emergency reported',
        time: new Date(alert.created_at).toLocaleString(),
        severity: 'high'
      }));

      setAlerts([...emergencyAlertList, ...irregularityAlerts].slice(0, 10));

      setStats({
        totalRoutes: buses?.length || 0,
        activeDrivers: activeDriversCount,
        activeConductors: activeConductorsCount,
        avgTripDuration: '32 min',
        seatUtilization: '78%',
        totalBusFare: busFareRevenue,
        totalBaggageFees: baggageFeeRevenue || 0
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Set default values on error to prevent UI crashes
      setKpis([
        { title: "Today's Passengers", value: '0', change: 0, icon: Users, color: 'bg-blue-500' },
        { title: 'Total Revenue', value: '₱0.00', change: 0, icon: DollarSign, color: 'bg-green-500' },
        { title: 'Bus Fare Revenue', value: '₱0.00', change: 0, icon: Bus, color: 'bg-purple-500' },
        { title: 'Baggage Fee Revenue', value: '₱0.00', change: 0, icon: DollarSign, color: 'bg-orange-500' },
      ]);
      setAlerts([]);
      setStats({
        totalRoutes: 0,
        activeDrivers: 0,
        activeConductors: 0,
        avgTripDuration: '0 min',
        seatUtilization: '0%',
        totalBusFare: 0,
        totalBaggageFees: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveMapData = async () => {
    try {
      // Fetch all buses on the route regardless of status — show on map with their current state
      const [
        { data: allBuses },
        { data: activeTrips },
        { data: gpsRows }
      ] = await Promise.all([
        supabase.from('buses').select('*').order('bus_number', { ascending: true }),
        supabase.from('trips')
          .select('*, buses!trips_bus_id_fkey(*)')
          .eq('status', 'in_progress')
          .order('started_at', { ascending: false }),
        supabase.from('gps_locations')
          .select('trip_id, latitude, longitude, source, recorded_at')
          .order('recorded_at', { ascending: false })
          .limit(100)
      ]);

      // Map active trip IDs to their trip data for quick lookup
      const tripByBusId = {};
      (activeTrips || []).forEach(trip => {
        tripByBusId[trip.bus_id] = trip;
      });

      // Helper: check if a source is an anchor / placeholder / fallback
      const isFallbackSource = (s) => {
        if (!s) return true;
        const lower = String(s).toLowerCase();
        return lower.includes('anchor') || lower.includes('fallback') || lower.includes('terminal');
      };

      // Map real GPS data by trip ID and bus ID; track global real GPS and fallback
      const latestRealGpsByTripId = {};
      const latestRealGpsByBusId = {};
      let latestRealGpsAny = null;
      let latestFallbackGpsAny = null;

      (gpsRows || []).forEach(row => {
        const lat = parseFloat(row.latitude);
        const lng = parseFloat(row.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return;

        const gps = {
          lat,
          lng,
          source: row.source || 'gps',
          recordedAt: row.recorded_at,
          tripId: row.trip_id || null
        };

        if (isFallbackSource(gps.source)) {
          if (!latestFallbackGpsAny) latestFallbackGpsAny = gps;
          return;
        }

        // True GPS fix (e.g. driver_phone_gps, satellite gps)
        if (!latestRealGpsAny) latestRealGpsAny = gps;
        if (row.trip_id && !latestRealGpsByTripId[row.trip_id]) {
          latestRealGpsByTripId[row.trip_id] = gps;
          const trip = (activeTrips || []).find(t => t.id === row.trip_id);
          if (trip && !latestRealGpsByBusId[trip.bus_id]) {
            latestRealGpsByBusId[trip.bus_id] = gps;
          }
        }
      });

      // Build a marker for every bus — strictly prioritize real GPS over any fallback
      const busMarkers = (allBuses || []).map(bus => {
        const trip = tripByBusId[bus.id];

        // 1. Check for real GPS linked specifically to this bus or trip
        let gps = latestRealGpsByBusId[bus.id] || (trip ? latestRealGpsByTripId[trip.id] : null);

        // 2. Check if the active trip record has valid driver phone coordinates
        const tripLat = trip?.current_lat != null ? parseFloat(trip.current_lat) : null;
        const tripLng = trip?.current_lng != null ? parseFloat(trip.current_lng) : null;
        const hasValidTripCoords = Number.isFinite(tripLat) && Number.isFinite(tripLng) && (Math.abs(tripLat) > 0.001 || Math.abs(tripLng) > 0.001);

        // 3. Fallback to latest global real GPS fix (e.g. driver phone GPS unlinked to trip)
        if (!gps && !hasValidTripCoords && latestRealGpsAny) {
          gps = latestRealGpsAny;
        }

        let lat, lng, locationSource, locationUpdatedAt;

        if (gps) {
          lat = gps.lat;
          lng = gps.lng;
          locationSource = gps.source;
          locationUpdatedAt = gps.recordedAt;
        } else if (hasValidTripCoords) {
          lat = tripLat;
          lng = tripLng;
          locationSource = 'driver_phone_gps';
          locationUpdatedAt = trip.gps_updated_at || trip.started_at;
        } else if (latestFallbackGpsAny) {
          lat = latestFallbackGpsAny.lat;
          lng = latestFallbackGpsAny.lng;
          locationSource = 'terminal_default';
          locationUpdatedAt = latestFallbackGpsAny.recordedAt;
        } else {
          lat = 8.366264; // Manolo Fortich Bus Terminal
          lng = 124.865749;
          locationSource = 'terminal_default';
          locationUpdatedAt = null;
        }

        const routeProgress = calculateRouteProgress(lat, lng, routeCoordinates);
        const routeDirection = getRouteDirection(routeProgress);
        const eta = estimateTimeToDestination(routeProgress, calculateRouteDistance(routeCoordinates));

        return {
          id: bus.id,
          plate: bus.plate_number,
          route: bus.route,
          lat,
          lng,
          passengers: 0,
          status: trip ? 'active' : bus.status,
          locationSource,
          locationUpdatedAt,
          busId: bus.id,
          tripId: trip?.id || null,
          routeProgress,
          routeDirection,
          eta
        };
      });

      // Fetch latest passenger count for each active trip
      const tripIds = (activeTrips || []).map(t => t.id);
      let totalPassengers = 0;

      const liveVideoCount = backendCount || piPassengerCount || 0;
      const monitoredTripId = backendTripIdFromWs || piActiveTripId || piCurrentTripId;
      const monitoredBusId = piAssignedBus?.busId;
      const monitoredPlate = piAssignedBus?.busPlate;

      const latestCounts = {};
      if (tripIds.length > 0) {
        const { data: passengerCounts } = await supabase
          .from('passenger_counts')
          .select('trip_id, count')
          .in('trip_id', tripIds)
          .order('recorded_at', { ascending: false });

        (passengerCounts || []).forEach(pc => {
          if (!(pc.trip_id in latestCounts)) latestCounts[pc.trip_id] = pc.count;
        });
      }

      busMarkers.forEach(bus => {
        const isMonitoredBus = (
          (monitoredBusId && (bus.id === monitoredBusId || bus.busId === monitoredBusId)) ||
          (monitoredPlate && bus.plate === monitoredPlate) ||
          (monitoredTripId && bus.tripId === monitoredTripId) ||
          (busMarkers.length === 1 && (backendStreaming || piIsStreaming || piOnline))
        );

        if (isMonitoredBus && (backendStreaming || piIsStreaming || piOnline || liveVideoCount > 0)) {
          bus.passengers = liveVideoCount;
        } else if (bus.tripId && latestCounts[bus.tripId] !== undefined) {
          bus.passengers = latestCounts[bus.tripId];
        }
        totalPassengers += (bus.passengers || 0);
      });

      setBuses(busMarkers);
      setMapStats({
        totalPassengers,
        activeBuses: (activeTrips || []).length,
        totalRoutes: 1,
        maintenanceBuses: (allBuses || []).filter(b => b.status === 'maintenance').length
      });
    } catch (error) {
      console.error('Error fetching live map data:', error);
    }
  };

  const fetchEmergencyAlerts = async () => {
    try {
      // Select only columns that are guaranteed to exist in the base table.
      // Avoid joining buses() here to prevent 400 errors if the FK relationship
      // isn't recognised by PostgREST (e.g. migration not yet applied).
      const { data, error } = await supabase
        .from('emergency_alerts')
        .select('id, status, notes, created_at, acknowledged_at, resolved_at, bus_id, conductor_id, lat, lng')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmergencyAlerts(data || []);
    } catch (error) {
      console.error('Error fetching emergency alerts:', error);
      setEmergencyAlerts([]);
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const { data: { user } } = await supabase.auth.getUser();
      
      const response = await fetch(`${API_URL}/api/emergency-alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to acknowledge alert');
      }

      // Log alert acknowledgment to audit logs
      await AuditService.logAuditEvent({
        action: 'UPDATE',
        module: 'Emergency Alerts',
        details: `Acknowledged emergency alert ${alertId}`,
      });

      fetchEmergencyAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      alert('Error acknowledging alert: ' + error.message);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      const alert = emergencyAlerts.find(a => a.id === alertId);
      const notes = alert?.notes || 'No notes provided';
      const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const { data: { user } } = await supabase.auth.getUser();

      const response = await fetch(`${API_URL}/api/emergency-alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.session.access_token}`,
        },
        body: JSON.stringify({ notes }),
      });

      if (!response.ok) {
        throw new Error('Failed to resolve alert');
      }

      // Log alert resolution to audit logs
      await AuditService.logEmergencyAlertResolved(alertId, notes);

      fetchEmergencyAlerts();
    } catch (error) {
      console.error('Error resolving alert:', error);
      alert('Error resolving alert: ' + error.message);
    }
  };

  const filteredAlerts = emergencyAlerts.filter(alert => {
    const matchesSearch = !alertSearchTerm ||
      alert.notes?.toLowerCase().includes(alertSearchTerm.toLowerCase()) ||
      alert.bus_id?.toLowerCase().includes(alertSearchTerm.toLowerCase());
    const matchesStatus = alertFilterStatus === 'all' || alert.status === alertFilterStatus;
    return matchesSearch && matchesStatus;
  });

  const alertStatusColors = {
    active: 'bg-red-500/20 text-red-400 border-red-500/50',
    acknowledged: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    resolved: 'bg-green-500/20 text-green-400 border-green-500/50',
  };

  const alertStatusIcons = {
    active: AlertTriangle,
    acknowledged: Clock,
    resolved: CheckCircle,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-white/60">Loading data...</p>
        </div>
      </div>
    );
  }

  // Route: Manolo Fortich Terminal ↔ Agora Terminal, Cagayan de Oro
  // Calculate midpoint for centering the map
  const ROUTE_CENTER = [8.4276, 124.7617]; // Midpoint of the route
  const ROUTE_ZOOM = 11;
  const mapCenter = ROUTE_CENTER;
  const mapZoom = ROUTE_ZOOM;



  // VideoMonitoring handles its own connection — no inline video code needed here

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-2xl sm:text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-white/60 text-sm sm:text-base">Welcome back! Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {kpis.map((kpi, index) => (
          <KPICard key={index} {...kpi} />
        ))}
      </div>

      {/* Live Bus Video Monitoring Section - Enhanced Full Card */}
      <div className="glass-card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-white text-lg sm:text-xl font-bold flex items-center gap-2">
              <Video className="text-orange-400" />
              Live Bus Video Monitoring
              <span className="px-2.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300 text-xs font-semibold border border-orange-500/30">
                Bus {piAssignedBus?.busNumber || '001'} {piAssignedBus?.busPlate ? `· ${piAssignedBus.busPlate}` : ''}
              </span>
            </h2>
            <span className={`text-xs font-medium flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border ${
              (backendStreaming || piIsStreaming)
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : (backendStreaming || backendConnectionStatus === 'connected' || piOnline)
                ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                : 'text-red-400 bg-red-500/10 border-red-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${(backendStreaming || piIsStreaming) ? 'bg-emerald-400 animate-pulse' : (backendStreaming || backendConnectionStatus === 'connected' || piOnline) ? 'bg-yellow-400' : 'bg-red-400'}`} />
              {(backendStreaming || piIsStreaming) ? 'Live Feed' : (backendStreaming || backendConnectionStatus === 'connected' || piOnline) ? 'Connected' : 'Offline'}
            </span>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* View Mode Toggle: Split View vs Full Width Video */}
            <button
              onClick={() => setIsVideoFullWidth(!isVideoFullWidth)}
              className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title={isVideoFullWidth ? "Switch to Split View with Telemetry" : "Expand Video to Full Width"}
            >
              {isVideoFullWidth ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span>{isVideoFullWidth ? "Split View" : "Full Width"}</span>
            </button>

            {/* Refresh Connection */}
            <button
              onClick={() => {
                if (backendStreaming) backendRefresh();
                else piRefresh();
              }}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
              title="Refresh Video Stream"
            >
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Video & Telemetry Layout */}
        <div className={`grid grid-cols-1 ${isVideoFullWidth ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} gap-4 sm:gap-6`}>
          {/* Live Video Monitoring Viewport */}
          <div className={isVideoFullWidth ? 'w-full' : 'lg:col-span-2'}>
            <CompactVideoFeed
              online={backendStreaming || backendConnectionStatus === 'connected' || piOnline}
              connectionStatus={backendStreaming ? 'connected' : backendConnectionStatus === 'connected' ? 'connected' : piConnectionStatus}
              passengerCount={backendCount || piPassengerCount}
              isStreaming={backendStreaming || piIsStreaming}
              videoRef={sharedVideoRef}
              refresh={backendStreaming ? backendRefresh : piRefresh}
              cameraActive={piCameraActive}
              piReachable={piReachable}
              usingBackend={backendStreaming}
              currentTripId={piCurrentTripId}
              assignedBus={piAssignedBus}
              locationSource={buses.find(b => b.status === 'active')?.locationSource}
              isFullWidth={isVideoFullWidth}
            />
          </div>

          {/* Video Processing Status Indicators */}
          {isVideoFullWidth ? (
            /* Full Width Mode: Horizontal Telemetry Strip below video */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
              {/* Occupancy Card */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-white/50 text-xs mb-1">
                  <span className="flex items-center gap-1"><Users size={13} className="text-emerald-400" /> Occupancy</span>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/15 px-1 rounded">
                    {Math.min(100, Math.round(((backendCount || piPassengerCount || 0) / 35) * 100))}%
                  </span>
                </div>
                <div className="text-lg font-bold text-white">
                  {backendCount || piPassengerCount || 0} <span className="text-white/40 text-xs font-normal">/ 35</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-1.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (backendCount || piPassengerCount) > 31
                        ? 'bg-red-500'
                        : (backendCount || piPassengerCount) > 24
                        ? 'bg-yellow-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(3, ((backendCount || piPassengerCount || 0) / 35) * 100))}%` }}
                  />
                </div>
              </div>

              {/* AI Model Card */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400">
                  <Brain size={16} />
                </div>
                <div>
                  <p className="text-white/50 text-[10px]">AI Model</p>
                  <p className="text-white text-xs font-semibold">YOLOv8n ONNX</p>
                  <span className="text-[10px] text-emerald-400">Synced</span>
                </div>
              </div>

              {/* Camera Sensor Card */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-400">
                  <Camera size={16} />
                </div>
                <div>
                  <p className="text-white/50 text-[10px]">Camera</p>
                  <p className="text-white text-xs font-semibold">EMEET C60E</p>
                  <span className="text-[10px] text-cyan-400">{(piIsStreaming || piCameraActive) ? '60 FPS' : 'Offline'}</span>
                </div>
              </div>

              {/* Recording Card */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400">
                  <Film size={16} />
                </div>
                <div>
                  <p className="text-white/50 text-[10px]">Recording</p>
                  <p className="text-white text-xs font-semibold truncate max-w-[100px]">
                    {(backendTripIdFromWs || backendTripId || piCurrentTripId) ? `Trip #${(backendTripIdFromWs || backendTripId || piCurrentTripId).slice(0, 8)}` : 'Standby'}
                  </p>
                  <span className={`text-[10px] ${(backendTripIdFromWs || backendTripId || piCurrentTripId) ? 'text-red-400' : 'text-white/40'}`}>
                    {(backendTripIdFromWs || backendTripId || piCurrentTripId) ? '● REC' : 'Idle'}
                  </span>
                </div>
              </div>

              {/* Motion Sync Card */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-yellow-500/15 text-yellow-400">
                  <Zap size={16} />
                </div>
                <div>
                  <p className="text-white/50 text-[10px]">Motion Sync</p>
                  <p className="text-white text-xs font-semibold">&lt; 20ms Lag</p>
                  <span className="text-[10px] text-yellow-400">Zero-Delay</span>
                </div>
              </div>

              {/* Safety Card */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${piEmergencyStatus.emergency_active ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  {piEmergencyStatus.emergency_active ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
                </div>
                <div>
                  <p className="text-white/50 text-[10px]">Safety System</p>
                  <p className={`text-xs font-semibold ${piEmergencyStatus.emergency_active ? 'text-red-400' : 'text-white'}`}>
                    {piEmergencyStatus.emergency_active ? 'EMERGENCY' : 'All Clear'}
                  </p>
                  <span className={`text-[10px] ${piEmergencyStatus.emergency_active ? 'text-red-400' : 'text-emerald-400'}`}>
                    {piEmergencyStatus.emergency_active ? 'Alert' : 'Normal'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Split Mode: Sleek Sidebar (lg:col-span-1) */
            <div className="bg-white/5 p-4 sm:p-5 rounded-xl flex flex-col justify-between border border-white/10 lg:col-span-1">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                      <Activity size={16} />
                    </div>
                    <div>
                      <h3 className="text-white text-sm font-bold tracking-wide">Video Processing Status</h3>
                      <p className="text-white/40 text-[11px]">Edge Telemetry</p>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-300 text-[11px] rounded-full border border-emerald-500/30 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                </div>

                {/* Minimal Occupancy Meter */}
                <div className="bg-white/5 border border-white/5 rounded-xl p-3 mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white/70 text-xs font-medium flex items-center gap-1.5">
                      <Users size={14} className="text-emerald-400" />
                      Passenger Occupancy
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">
                        {backendCount || piPassengerCount || 0} <span className="text-white/40 font-normal">/ 35</span>
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {Math.min(100, Math.round(((backendCount || piPassengerCount || 0) / 35) * 100))}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (backendCount || piPassengerCount) > 31
                          ? 'bg-red-500'
                          : (backendCount || piPassengerCount) > 24
                          ? 'bg-yellow-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(3, ((backendCount || piPassengerCount || 0) / 35) * 100))}%` }}
                    />
                  </div>
                </div>

                {/* Status Rows */}
                <div className="space-y-2">
                  {/* AI Model */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-md bg-purple-500/15 text-purple-400">
                        <Brain size={14} />
                      </div>
                      <div>
                        <p className="text-white/50 text-[10px]">AI Model</p>
                        <p className="text-white text-xs font-semibold">YOLOv8n ONNX</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Synced
                    </span>
                  </div>

                  {/* Camera */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-md bg-cyan-500/15 text-cyan-400">
                        <Camera size={14} />
                      </div>
                      <div>
                        <p className="text-white/50 text-[10px]">Camera</p>
                        <p className="text-white text-xs font-semibold">EMEET C60E 4K</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                      (piIsStreaming || piCameraActive)
                        ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                        : 'text-red-400 bg-red-500/10 border-red-500/20'
                    }`}>
                      {(piIsStreaming || piCameraActive) ? '60 FPS' : 'Offline'}
                    </span>
                  </div>

                  {/* Trip Recording */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-md bg-amber-500/15 text-amber-400">
                        <Film size={14} />
                      </div>
                      <div>
                        <p className="text-white/50 text-[10px]">Trip Recording</p>
                        <p className="text-white text-xs font-semibold truncate max-w-[130px]">
                          {(backendTripIdFromWs || backendTripId || piCurrentTripId)
                            ? `Trip #${(backendTripIdFromWs || backendTripId || piCurrentTripId).slice(0, 8)}`
                            : 'Standby'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border flex items-center gap-1 ${
                      (backendTripIdFromWs || backendTripId || piCurrentTripId)
                        ? 'text-red-400 bg-red-500/10 border-red-500/20'
                        : 'text-white/40 bg-white/5 border-white/10'
                    }`}>
                      {(backendTripIdFromWs || backendTripId || piCurrentTripId) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                      )}
                      {(backendTripIdFromWs || backendTripId || piCurrentTripId) ? 'REC' : 'Idle'}
                    </span>
                  </div>

                  {/* Motion Sync */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-md bg-yellow-500/15 text-yellow-400">
                        <Zap size={14} />
                      </div>
                      <div>
                        <p className="text-white/50 text-[10px]">Motion Sync</p>
                        <p className="text-white text-xs font-semibold">&lt; 20ms Lag</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-yellow-400 font-medium bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
                      Zero-Delay
                    </span>
                  </div>

                  {/* Safety System */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-md ${
                        piEmergencyStatus.emergency_active ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
                      }`}>
                        {piEmergencyStatus.emergency_active ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                      </div>
                      <div>
                        <p className="text-white/50 text-[10px]">Safety System</p>
                        <p className={`text-xs font-semibold ${piEmergencyStatus.emergency_active ? 'text-red-400' : 'text-white'}`}>
                          {piEmergencyStatus.emergency_active ? 'EMERGENCY' : 'All Clear'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                      piEmergencyStatus.emergency_active
                        ? 'text-red-400 bg-red-500/10 border-red-500/20 animate-pulse'
                        : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    }`}>
                      {piEmergencyStatus.emergency_active ? 'ALERT' : 'Normal'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Minimal Footer */}
              <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/40">
                <span>Bus {piAssignedBus?.busNumber || '001'}</span>
                <span>Edge Engine Active</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Map Section - Enhanced */}
      <div className="glass-card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h2 className="text-white text-lg sm:text-xl font-bold flex items-center gap-2">
            <MapPin className="text-orange-400" />
            Live Bus Tracking
          </h2>
          <button
            onClick={() => {
              fetchLiveMapData();
              fetchDashboardData();
            }}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors self-start sm:self-auto"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 order-2 lg:order-1">
            <div className="h-[350px] sm:h-[500px] rounded-xl overflow-hidden">
              <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Polyline
                  positions={routeCoordinates}
                  color="#f97316"
                  weight={4}
                  opacity={0.7}
                />
                {buses.filter(bus => bus.status === 'active').map((bus) => (
                  <AnimatedBusMarker key={bus.id} bus={bus} onClick={setSelectedBus} />
                ))}
              </MapContainer>
            </div>
          </div>
          <div className="space-y-4 order-1 lg:order-2">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 sm:p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Bus className="w-4 h-4 text-blue-400" />
                  <p className="text-white/60 text-xs">Active Buses</p>
                </div>
                <p className="text-white text-xl sm:text-2xl font-bold">{mapStats.activeBuses}</p>
                <p className="text-white/40 text-xs mt-1">on trip now</p>
              </div>
              <div className="bg-white/5 p-3 sm:p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-green-400" />
                  <p className="text-white/60 text-xs">Passengers</p>
                </div>
                <p className="text-white text-xl sm:text-2xl font-bold">{mapStats.totalPassengers}</p>
                <p className="text-white/40 text-xs mt-1">on buses</p>
              </div>
            </div>

            {/* Fleet List */}
            <div className="bg-white/5 p-3 sm:p-4 rounded-xl">
              <h3 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
                <Navigation className="text-green-400" size={16} />
                Active Fleet
              </h3>
              <div className="space-y-2 max-h-[250px] sm:max-h-[300px] overflow-y-auto">
                {buses.filter(bus => bus.status === 'active').length > 0 ? (
                  buses.filter(bus => bus.status === 'active').map((bus) => (
                    <div
                      key={bus.id}
                      className="p-3 rounded-lg cursor-pointer transition-colors bg-white/5 hover:bg-white/10"
                      onClick={() => setSelectedBus(bus.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-semibold text-sm">Bus #{bus.plate || 'N/A'}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                          Active
                        </span>
                      </div>
                      <p className="text-white/70 text-xs mb-1">{bus.route}</p>

                      {/* Route Progress Bar */}
                      {bus.routeProgress !== undefined && (
                        <div className="mt-2 mb-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-white/60">Progress</span>
                            <span className="text-orange-400 font-semibold">{bus.routeProgress.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-1.5">
                            <div
                              className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${bus.routeProgress}%` }}
                            />
                          </div>
                          <p className="text-white/50 text-xs mt-1">
                            ETA: {bus.eta}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        <span className="text-white/60 text-xs flex items-center gap-1">
                          <Users size={12} />
                          {bus.passengers} passengers
                        </span>
                        <span className="text-white/60 text-xs">
                          {bus.locationUpdatedAt ? new Date(bus.locationUpdatedAt).toLocaleTimeString() : 'No GPS'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <Bus className="w-8 h-8 text-white/20 mx-auto mb-2" />
                    <p className="text-white/60 text-xs">No active buses</p>
                  </div>
                )}
              </div>
            </div>

            {/* Selected Bus Details Modal */}
            {selectedBus && (() => {
              const bus = buses.find(b => b.id === selectedBus);
              if (!bus) return null;
              return <BusDetailsModal bus={bus} onClose={() => setSelectedBus(null)} />;
            })()}
          </div>
        </div>
      </div>

      {/* Emergency Alerts and Recent Activity — Split Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Emergency Alerts */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white text-base sm:text-lg font-bold flex items-center gap-2">
              <AlertTriangle className="text-orange-400" />
              Emergency Alerts
            </h2>
          </div>

          {/* Alert Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <div className="bg-red-500/10 border border-red-500/30 p-2 sm:p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-white/60 text-xs">Active</p>
                  <p className="text-white text-base sm:text-lg font-bold">{emergencyAlerts.filter(a => a.status === 'active').length}</p>
                </div>
              </div>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 p-2 sm:p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400" />
                </div>
                <div>
                  <p className="text-white/60 text-xs">Acknowledged</p>
                  <p className="text-white text-base sm:text-lg font-bold">{emergencyAlerts.filter(a => a.status === 'acknowledged').length}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 p-2 sm:p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-white/60 text-xs">Resolved</p>
                  <p className="text-white text-base sm:text-lg font-bold">{emergencyAlerts.filter(a => a.status === 'resolved').length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Alert Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={16} />
              <input
                type="text"
                placeholder="Search alerts..."
                value={alertSearchTerm}
                onChange={(e) => setAlertSearchTerm(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg pl-9 pr-3 py-1.5 text-white placeholder-white/40 focus:outline-none focus:border-orange-500 text-sm"
              />
            </div>
            <select
              value={alertFilterStatus}
              onChange={(e) => setAlertFilterStatus(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-orange-500 text-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          {/* Alerts List */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {filteredAlerts.length > 0 ? (
              filteredAlerts.slice(0, 5).map((alert) => {
                const StatusIcon = alertStatusIcons[alert.status];
                return (
                  <div key={alert.id} className={`p-3 rounded-lg border ${alertStatusColors[alert.status]}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-white/10">
                          <StatusIcon size={12} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-white font-medium text-xs">Emergency Alert</h3>
                            <span className={`px-1.5 py-0.5 rounded-full text-xs border ${alertStatusColors[alert.status]}`}>
                              {alert.status}
                            </span>
                          </div>
                          <p className="text-white/70 text-xs mb-1">{alert.notes || 'No description provided'}</p>
                          <div className="flex items-center gap-3 text-white/60 text-xs">
                            {alert.buses?.plate_number && (
                              <span className="flex items-center gap-1">
                                <Bus size={10} />
                                {alert.buses.plate_number}
                              </span>
                            )}
                            <div className="flex items-center gap-1">
                              <Clock size={10} />
                              <span>{new Date(alert.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {alert.status === 'active' && (
                          <button
                            onClick={() => handleAcknowledgeAlert(alert.id)}
                            className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors text-xs"
                          >
                            Acknowledge
                          </button>
                        )}
                        {alert.status === 'acknowledged' && (
                          <button
                            onClick={() => handleResolveAlert(alert.id)}
                            className="px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors text-xs"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4">
                <AlertTriangle className="w-8 h-8 text-white/20 mx-auto mb-2" />
                <p className="text-white/60 text-xs">No emergency alerts found</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="glass-card p-4">
          <h2 className="text-white text-base sm:text-lg font-bold mb-3">Recent Activity</h2>
          {alerts.length > 0 ? (
            <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
              {alerts.slice(0, 10).map((alert, index) => (
                <div key={index} className="flex items-center gap-3 py-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    alert.severity === 'high' ? 'bg-red-400' :
                    alert.severity === 'medium' ? 'bg-orange-400' : 'bg-yellow-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-white/80 text-sm font-medium block">{alert.type}</span>
                    <span className="text-white/50 text-xs truncate block">{alert.message}</span>
                  </div>
                  <span className="text-white/30 text-xs flex-shrink-0">{alert.time}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-sm py-2">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
