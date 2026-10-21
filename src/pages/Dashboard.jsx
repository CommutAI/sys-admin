import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { Users, DollarSign, Bus, AlertTriangle, Map as MapIcon, CheckCircle, Clock, Search, Video, Camera, Activity, Brain, RefreshCw, Filter, Navigation, MapPin, X } from 'lucide-react';
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
  <div className="glass-card p-6 hover:scale-105 transition-transform duration-300">
    <div className="flex items-center justify-between mb-4">
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <span className={`text-sm ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {change >= 0 ? '+' : ''}{change}%
      </span>
    </div>
    <h3 className="text-white/60 text-sm mb-1">{title}</h3>
    <p className="text-white text-3xl font-bold">{value}</p>
  </div>
);

// Bus Details Modal Component
const BusDetailsModal = ({ bus, onClose }) => {
  if (!bus) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[999999] p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative z-[1000000]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-800">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
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

        {/* Split Pane Content */}
        <div className="grid grid-cols-2 divide-x divide-gray-700">
          {/* Left Column */}
          <div className="p-6 space-y-6">
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
              <p className="text-white text-3xl font-bold flex items-center gap-2">
                <Users className="text-orange-400" size={24} />
                {bus.passengers}
              </p>
            </div>

            {/* GPS Coordinates */}
            <div>
              <p className="text-gray-400 text-sm mb-1">GPS Coordinates</p>
              <p className="text-white font-mono text-sm bg-gray-800 p-3 rounded-lg border border-gray-700">
                {Number(bus.lat).toFixed(6)}, {Number(bus.lng).toFixed(6)}
              </p>
            </div>

            {/* GPS Source */}
            <div>
              <p className="text-gray-400 text-sm mb-1">GPS Source</p>
              <span className={`px-3 py-1 rounded-full text-sm ${
                bus.locationSource === 'gps' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {bus.locationSource || 'fallback'}
              </span>
            </div>
          </div>

          {/* Right Column */}
          <div className="p-6 space-y-6 bg-gray-800/50">
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
                    <span className="text-orange-400 font-bold text-xl min-w-[70px] text-right">
                      {bus.routeProgress.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-gray-400 text-sm mb-1">Direction</p>
                  <p className="text-white font-semibold text-lg">{bus.routeDirection}</p>
                </div>

                <div>
                  <p className="text-gray-400 text-sm mb-1">ETA to Destination</p>
                  <p className="text-white font-semibold text-2xl">{bus.eta}</p>
                </div>
              </>
            )}

            {/* Last Update */}
            <div>
              <p className="text-gray-400 text-sm mb-1">Last Update</p>
              <p className="text-white font-semibold">
                {bus.locationUpdatedAt ? new Date(bus.locationUpdatedAt).toLocaleString() : 'No data'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 bg-gray-800">
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
            <p className="text-gray-500 text-xs">
              Source: {bus.locationSource || 'fallback'}
            </p>
            {bus.locationUpdatedAt && (
              <p className="text-gray-500 text-xs">
                Last update: {new Date(bus.locationUpdatedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

// Compact video widget for the dashboard — receives Pi state from parent to avoid duplicate WebSocket connections
const CompactVideoFeed = ({ online, connectionStatus, passengerCount, isStreaming, videoRef, refresh, cameraActive }) => {
  const [useMjpeg, setUseMjpeg] = useState(false);
  const [useBackend, setUseBackend] = useState(true); // Use Backend YOLO by default
  // Stream is started automatically by the hook on connect — no effect needed here

  const statusColor = isStreaming || useMjpeg || useBackend ? 'text-green-400' : online ? 'text-yellow-400' : 'text-red-400';
  const statusLabel = isStreaming || useMjpeg || useBackend ? 'Live' : online ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting…' : 'Offline';

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-orange-400" />
          <h2 className="text-white font-semibold text-sm">Bus Video Monitoring</h2>
          <span className={`text-xs ${statusColor}`}>· {statusLabel}</span>
          {useBackend && <span className="text-xs text-green-400">· 90%+ AI Accuracy</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setUseBackend(v => !v)}
            className={`text-xs px-2 py-1 rounded-lg transition-colors ${useBackend ? 'bg-blue-500/30 text-blue-300' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}
          >
            {useBackend ? 'Backend YOLO' : 'Pi'}
          </button>
          {!useBackend && (
            <button
              onClick={() => setUseMjpeg(v => !v)}
              className={`text-xs px-2 py-1 rounded-lg transition-colors ${useMjpeg ? 'bg-orange-500/30 text-orange-300' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}
            >
              {useMjpeg ? 'MJPEG' : 'WS'}
            </button>
          )}
          <button onClick={refresh} className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded-lg transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Video — fixed height for compact size */}
      <div className="relative bg-black rounded-xl overflow-hidden" style={{ height: '500px' }}>
        {/* Backend YOLO Stream */}
        {useBackend && (
          <img ref={videoRef} alt="Live feed" className={`w-full h-full object-contain ${isStreaming ? 'block' : 'hidden'}`} />
        )}

        {/* Backend connecting message */}
        {useBackend && !isStreaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Video className="w-10 h-10 text-blue-400" />
            <p className="text-blue-400 text-xs font-medium">Connecting to Backend...</p>
            <p className="text-white/30 text-xs">YOLOv8m AI Processing</p>
          </div>
        )}

        {/* Pi WebSocket Stream */}
        {!useBackend && (
          <img ref={videoRef} alt="Live feed" className={`w-full h-full object-contain ${isStreaming && !useMjpeg ? 'block' : 'hidden'}`} />
        )}

        {/* Pi MJPEG Stream */}
        {!useBackend && useMjpeg && <img src={getPiVideoFeedUrl()} alt="MJPEG feed" className="w-full h-full object-contain" />}

        {/* Pi offline message */}
        {!useBackend && !isStreaming && !useMjpeg && !online && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Camera className="w-10 h-10 text-red-400" />
            <p className="text-red-400 text-xs font-medium">Pi Server Offline</p>
            <p className="text-white/30 text-xs">Switch to Backend for AI detection</p>
          </div>
        )}

        {!isStreaming && !useMjpeg && !useBackend && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            {cameraActive === false ? (
              <>
                <Camera className="w-10 h-10 text-red-400" />
                <p className="text-red-400 text-xs font-medium">Camera not connected</p>
                <p className="text-white/30 text-xs">Check camera on Raspberry Pi</p>
              </>
            ) : (
              <>
                <Video className="w-10 h-10 text-white/20" />
                {online ? (
                  <p className="text-white/40 text-xs">Starting stream…</p>
                ) : (
                  <p className="text-white/40 text-xs">Connecting to Raspberry Pi…</p>
                )}
              </>
            )}
          </div>
        )}

        {/* LIVE badge */}
        {(isStreaming || useMjpeg || useBackend) && (
          <div className="absolute top-2 left-2 bg-black/70 rounded px-2 py-0.5 flex items-center gap-1.5">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-white text-xs font-medium">LIVE</span>
          </div>
        )}

        {/* Passenger count badge */}
        {(isStreaming || useMjpeg || useBackend) && (
          <div className="absolute top-2 right-2 bg-black/70 rounded px-2 py-0.5 flex items-center gap-1.5">
            <Users className="w-3 h-3 text-orange-400" />
          <span className="text-white text-xs font-bold">{passengerCount}</span>
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

  // Single Raspberry Pi connection — shared between status indicators and the video widget
  const {
    online: piOnline,
    connectionStatus: piConnectionStatus,
    cameraActive: piCameraActive,
    passengerCount: piPassengerCount,
    currentTripId: piCurrentTripId,
    emergencyStatus: piEmergencyStatus,
    hardwareStatus: piHardwareStatus,
    isStreaming: piIsStreaming,
    videoRef: piVideoRef,
    refresh: piRefresh,
    assignedBus: piAssignedBus,
    activeTripId: piActiveTripId,
    usingWebSocket: piUsingWebSocket,
  } = useRaspberryPi({ autoConnect: false, enableHealthCheck: true });

  // Backend video connection for YOLOv8m processing
  const {
    isStreaming: backendStreaming,
    passengerCount: backendCount,
    videoRef: backendVideoRef,
    refresh: backendRefresh,
  } = useBackendVideo({ autoConnect: true });

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
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString(); // Start of day in ISO format

      // Parallelize all independent queries for significant performance improvement
      const [
        { data: buses },
        { data: trips },
        { data: passengerCounts },
        { data: irregularities },
        { data: emergencyAlerts },
        { data: staffUsers }
      ] = await Promise.all([
        // Fetch active buses
        supabase.from('buses').select('*').eq('status', 'active'),

        // Fetch today's trips
        supabase.from('trips').select('*, buses(*)').gte('started_at', todayStart),

        // Fetch passenger counts for today
        supabase.from('passenger_counts').select('count').gte('recorded_at', todayStart),

        // Fetch fare irregularities for today
        supabase.from('fare_irregularities')
          .select('*, trips(*, buses(*))')
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

      // Calculate KPIs
      const totalPassengers = passengerCounts?.reduce((sum, pc) => sum + (pc.count || 0), 0) || 0;
      const totalTrips = trips?.length || 0;
      const activeBusesCount = buses?.length || 0;
      const activeConductorsCount = staffUsers?.filter(u => u.role === 'conductor').length || 0;
      const activeDriversCount = staffUsers?.filter(u => u.role === 'driver').length || 0;

      // Revenue calculation disabled - transactions table structure needs to be defined
      const totalRevenue = 0;
      const busFareRevenue = 0;
      const baggageFeeRevenue = 0;

      setKpis([
        { title: "Today's Passengers", value: totalPassengers.toLocaleString(), change: 8.5, icon: Users, color: 'bg-blue-500' },
        { title: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, change: 12.3, icon: DollarSign, color: 'bg-green-500' },
        { title: 'Bus Fare Revenue', value: `$${busFareRevenue.toLocaleString()}`, change: 10.1, icon: Bus, color: 'bg-purple-500' },
        { title: 'Baggage Fee Revenue', value: `$${baggageFeeRevenue.toLocaleString()}`, change: 15.2, icon: DollarSign, color: 'bg-orange-500' },
      ]);

      // Transform irregularities to alerts
      const irregularityAlerts = (irregularities || []).map(irr => ({
        type: `${irr.type.replace('_', ' ').toUpperCase()}`,
        message: `Trip #${irr.trip_id?.slice(0, 8)} - ${irr.description}`,
        time: new Date(irr.detected_at).toLocaleString(),
        severity: irr.type === 'fare_evasion' ? 'high' : 'medium'
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
        { title: 'Total Revenue', value: '$0', change: 0, icon: DollarSign, color: 'bg-green-500' },
        { title: 'Bus Fare Revenue', value: '$0', change: 0, icon: Bus, color: 'bg-purple-500' },
        { title: 'Baggage Fee Revenue', value: '$0', change: 0, icon: DollarSign, color: 'bg-orange-500' },
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
          .select('*, buses(*)')
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

      // Map GPS data by trip ID and also collect by bus ID through trips
      const latestGpsByTripId = {};
      const latestGpsByBusId = {};
      let latestGpsAny = null;

      (gpsRows || []).forEach(row => {
        const gps = {
          lat: parseFloat(row.latitude),
          lng: parseFloat(row.longitude),
          source: row.source || 'gps',
          recordedAt: row.recorded_at,
          tripId: row.trip_id || null
        };

        if (!Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) return;
        if (!latestGpsAny) latestGpsAny = gps;
        if (row.trip_id && !latestGpsByTripId[row.trip_id]) {
          latestGpsByTripId[row.trip_id] = gps;
          // Also map to bus ID if we have the trip info
          const trip = (activeTrips || []).find(t => t.id === row.trip_id);
          if (trip && !latestGpsByBusId[trip.bus_id]) {
            latestGpsByBusId[trip.bus_id] = gps;
          }
        }
      });

      console.log('GPS Data loaded:', {
        totalGpsRows: gpsRows?.length || 0,
        gpsByTripId: Object.keys(latestGpsByTripId).length,
        gpsByBusId: Object.keys(latestGpsByBusId).length,
        activeTrips: activeTrips?.length || 0
      });

      // Build a marker for every bus — use GPS data if available, otherwise fallback
      const busMarkers = (allBuses || []).map(bus => {
        const trip = tripByBusId[bus.id];
        const gps = latestGpsByBusId[bus.id] || (trip ? latestGpsByTripId[trip.id] : null) || latestGpsAny;

        const lat = gps?.lat ?? trip?.current_lat ?? 8.43;
        const lng = gps?.lng ?? trip?.current_lng ?? 124.76;
        const routeProgress = calculateRouteProgress(lat, lng, routeCoordinates);
        const routeDirection = getRouteDirection(routeProgress);
        const eta = estimateTimeToDestination(routeProgress, calculateRouteDistance(routeCoordinates));

        console.log(`Bus ${bus.plate_number}: GPS from ${gps?.source || 'fallback'}, lat=${lat}, lng=${lng}`);

        return {
          id: bus.id,
          plate: bus.plate_number,
          route: bus.route,
          lat,
          lng,
          passengers: 0,
          status: trip ? 'active' : bus.status,
          locationSource: gps ? (gps.tripId ? gps.source : `${gps.source} (latest GPS)`) : 'fallback',
          locationUpdatedAt: gps?.recordedAt || trip?.gps_updated_at || null,
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

      if (tripIds.length > 0) {
        const { data: passengerCounts } = await supabase
          .from('passenger_counts')
          .select('trip_id, count')
          .in('trip_id', tripIds)
          .order('recorded_at', { ascending: false });

        const latestCounts = {};
        (passengerCounts || []).forEach(pc => {
          if (!latestCounts[pc.trip_id]) latestCounts[pc.trip_id] = pc.count;
        });

        busMarkers.forEach(bus => {
          if (bus.tripId && latestCounts[bus.tripId]) {
            bus.passengers = latestCounts[bus.tripId];
            totalPassengers += latestCounts[bus.tripId];
          }
        });
      }

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
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
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
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
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
        <h1 className="text-white text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-white/60">Welcome back! Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, index) => (
          <KPICard key={index} {...kpi} />
        ))}
      </div>

      {/* Live Video Monitoring and Raspberry Pi Status — Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Video Monitoring — compact widget */}
        <div className="glass-card p-4 rounded-xl lg:col-span-2">
          <CompactVideoFeed
            online={backendStreaming || piOnline}
            connectionStatus={backendStreaming ? 'connected' : piConnectionStatus}
            passengerCount={backendCount || piPassengerCount}
            isStreaming={backendStreaming || piIsStreaming}
            videoRef={backendStreaming ? backendVideoRef : piVideoRef}
            refresh={backendStreaming ? backendRefresh : piRefresh}
            cameraActive={piCameraActive}
          />
        </div>

        {/* Video Processing Status Indicators */}
        <div className="glass-card p-6 rounded-xl">
          <h2 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
            <Camera className="text-orange-400" size={20} />
            Video Processing Status
            {piAssignedBus?.busPlate && (
              <span className="ml-1 px-2 py-0.5 bg-orange-500/20 text-orange-300 text-xs rounded-full border border-orange-500/30">
                Bus {piAssignedBus.busNumber}
              </span>
            )}
            <span className="ml-1 px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30">
              Stream Mode
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Video className="w-4 h-4 text-indigo-400" />
                <p className="text-white/60 text-xs">Backend</p>
              </div>
              <p className={`text-lg font-bold ${backendStreaming ? 'text-green-400' : 'text-red-400'}`}>
                {backendStreaming ? 'Online' : 'Offline'}
              </p>
              <p className="text-white/40 text-xs mt-1">{backendStreaming ? 'Processing frames' : 'Disconnected'}</p>
            </div>
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Camera className="w-4 h-4 text-blue-400" />
                <p className="text-white/60 text-xs">Camera</p>
              </div>
              <p className={`text-lg font-bold ${backendStreaming ? 'text-green-400' : 'text-red-400'}`}>
                {backendStreaming ? 'Streaming' : 'Inactive'}
              </p>
              <p className="text-white/40 text-xs mt-1">{backendStreaming ? 'Pi sending frames' : 'No stream'}</p>
            </div>
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-purple-400" />
                <p className="text-white/60 text-xs">Passengers</p>
              </div>
              <p className="text-lg font-bold text-white">{backendCount || piPassengerCount}</p>
              <p className="text-white/40 text-xs mt-1">Current count</p>
            </div>
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-orange-400" />
                <p className="text-white/60 text-xs">Trip ID</p>
              </div>
              <p className="text-lg font-bold text-white">
                {piCurrentTripId ? `#${piCurrentTripId.slice(0, 8)}` : 'None'}
              </p>
              <p className="text-white/40 text-xs mt-1">Active trip</p>
            </div>
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <p className="text-white/60 text-xs">Detection</p>
              </div>
              <p className="text-lg font-bold text-white">YOLOv8n</p>
              <p className="text-white/40 text-xs mt-1">Backend AI</p>
            </div>
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className={`w-4 h-4 ${piEmergencyStatus.emergency_active ? 'text-red-400' : 'text-green-400'}`} />
                <p className="text-white/60 text-xs">Emergency</p>
              </div>
              <p className={`text-lg font-bold ${piEmergencyStatus.emergency_active ? 'text-red-400' : 'text-green-400'}`}>
                {piEmergencyStatus.emergency_active ? 'Active' : 'Clear'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Live Map Section - Enhanced */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <MapPin className="text-orange-400" />
            Live Bus Tracking
          </h2>
          <button
            onClick={() => {
              fetchLiveMapData();
              fetchDashboardData();
            }}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="h-[500px] rounded-xl overflow-hidden">
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
            <div className="bg-white/5 p-4 rounded-xl mt-4">
              <h3 className="text-white text-sm font-bold mb-3">Map Legend</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-1 bg-orange-500 rounded"></div>
                  <span className="text-white/70 text-xs">Route: Manolo Fortich ↔ Agora</span>
                </div>
                <div className="flex gap-6 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                    <span className="text-white/70">On Active Trip</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-400" />
                    <span className="text-white/70">Inactive / Idle</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <span className="text-white/70">Maintenance</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Bus className="w-4 h-4 text-blue-400" />
                  <p className="text-white/60 text-xs">Active Buses</p>
                </div>
                <p className="text-white text-2xl font-bold">{mapStats.activeBuses}</p>
                <p className="text-white/40 text-xs mt-1">on trip now</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-green-400" />
                  <p className="text-white/60 text-xs">Passengers</p>
                </div>
                <p className="text-white text-2xl font-bold">{mapStats.totalPassengers}</p>
                <p className="text-white/40 text-xs mt-1">on buses</p>
              </div>
            </div>

            {/* Fleet List */}
            <div className="bg-white/5 p-4 rounded-xl">
              <h3 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
                <Navigation className="text-green-400" size={16} />
                Active Fleet
              </h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Emergency Alerts */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white text-lg font-bold flex items-center gap-2">
              <AlertTriangle className="text-orange-400" />
              Emergency Alerts
            </h2>
          </div>
          
          {/* Alert Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-white/60 text-xs">Active</p>
                  <p className="text-white text-lg font-bold">{emergencyAlerts.filter(a => a.status === 'active').length}</p>
                </div>
              </div>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <Clock className="w-4 h-4 text-yellow-400" />
                </div>
                <div>
                  <p className="text-white/60 text-xs">Acknowledged</p>
                  <p className="text-white text-lg font-bold">{emergencyAlerts.filter(a => a.status === 'acknowledged').length}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-white/60 text-xs">Resolved</p>
                  <p className="text-white text-lg font-bold">{emergencyAlerts.filter(a => a.status === 'resolved').length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Alert Filters */}
          <div className="flex items-center gap-3 mb-3">
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
          <h2 className="text-white text-lg font-bold mb-3">Recent Activity</h2>
          {alerts.length > 0 ? (
            <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
              {alerts.slice(0, 10).map((alert, index) => (
                <div key={index} className="flex items-center gap-3 py-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    alert.severity === 'high' ? 'bg-red-400' :
                    alert.severity === 'medium' ? 'bg-orange-400' : 'bg-yellow-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-white/80 text-sm font-medium">{alert.type}</span>
                    <span className="text-white/50 text-xs ml-2 truncate">{alert.message}</span>
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
