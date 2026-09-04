import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { Bus, Navigation, Users, AlertTriangle, Settings, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { discoverRaspberryPi, getPersistedIp, persistIp, clearPersistedIp } from '../services/piAutoDiscovery';
import 'leaflet/dist/leaflet.css';

const MapController = ({ center }) => {
  const map = useMap();
  
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, 15); // Use higher zoom for GPS tracking
    }
  }, [center, map]);
  
  return null;
};

const SummaryCard = ({ title, value, icon: Icon, color }) => (
  <div className="glass-card p-4 hover:scale-105 transition-transform duration-300">
    <div className="flex items-center justify-between mb-2">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
    <h3 className="text-white/60 text-xs mb-1">{title}</h3>
    <p className="text-white text-xl font-bold">{value}</p>
  </div>
);

const LiveMap = () => {
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [stats, setStats] = useState({
    totalPassengers: 0,
    activeBuses: 0,
    totalRoutes: 0,
    maintenanceBuses: 0
  });
  const [loading, setLoading] = useState(true);
  const [raspberryPiIP, setRaspberryPiIP] = useState(null); // Will be set by auto-discovery
  const [showSettings, setShowSettings] = useState(false);
  const [gpsData, setGpsData] = useState(null);
  const [gpsConnected, setGpsConnected] = useState(false);
  const [decodedLocations, setDecodedLocations] = useState({});
  const [isScanning, setIsScanning] = useState(false);
  const [discoveryLog, setDiscoveryLog] = useState([]);
  const [mapCenter, setMapCenter] = useState([14.5995, 120.9842]);
  const hasDiscovered = useRef(false);
  const raspberryPiIPRef = useRef(null); // Ref to prevent interval restarts

  // Auto-discover Raspberry Pi on local network using shared utility
  const performDiscovery = useCallback(async () => {
    setIsScanning(true);
    setDiscoveryLog(prev => [...prev, { time: new Date().toLocaleTimeString(), message: 'Starting network scan...' }]);

    const discoveredIp = await discoverRaspberryPi((progress) => {
      setDiscoveryLog(prev => [...prev, { 
        time: new Date().toLocaleTimeString(), 
        message: progress.message,
        type: progress.type
      }]);
    });

    if (discoveredIp) {
      setRaspberryPiIP(discoveredIp);
      raspberryPiIPRef.current = discoveredIp;
      console.log('Raspberry Pi discovered at:', discoveredIp);
    }

    setIsScanning(false);
    return discoveredIp;
  }, []);

  // Monitor network changes and trigger rediscovery
  useEffect(() => {
    const handleNetworkChange = async () => {
      setDiscoveryLog(prev => [...prev, { 
        time: new Date().toLocaleTimeString(), 
        message: 'Network change detected, scanning for Raspberry Pi...',
        type: 'info'
      }]);
      const discoveredIp = await performDiscovery();
      if (discoveredIp) {
        // Trigger immediate GPS fetch after rediscovery
        await fetchLiveGPSData();
      }
    };

    // Listen for online/offline events
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    // Also try to detect IP changes by periodic checks
    const networkCheckInterval = setInterval(() => {
      // If current IP is not responding, try rediscovery
      if (!gpsConnected) {
        handleNetworkChange();
      }
    }, 60000); // Check every minute

    return () => {
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
      clearInterval(networkCheckInterval);
    };
  }, [gpsConnected, performDiscovery, fetchLiveGPSData]);

  // Reverse geocoding function to convert coordinates to address
  const decodeLocation = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      if (response.ok) {
        const data = await response.json();
        return data.display_name || 'Location not found';
      }
      return 'Location not found';
    } catch (error) {
      console.error('Error decoding location:', error);
      return 'Location decoding failed';
    }
  };

  // Fetch live GPS data from Raspberry Pi
  const fetchLiveGPSData = useCallback(async () => {
    const currentIP = raspberryPiIPRef.current || raspberryPiIP;
    
    if (!currentIP) {
      return null;
    }

    try {
      const url = `http://${currentIP}:5000/location`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        setGpsData(data);
        setGpsConnected(true);
        
        // Update map center immediately
        if (data.latitude && data.longitude) {
          setMapCenter([data.latitude, data.longitude]);
        }
        
        return data;
      } else {
        setGpsConnected(false);
        return null;
      }
    } catch (error) {
      // Silently handle connection failures - expected when Pi server isn't running
      setGpsConnected(false);
      return null;
    }
  }, [raspberryPiIP]);

  useEffect(() => {
    // Initial auto-discovery on component mount (only once)
    const initializeDiscovery = async () => {
      if (!hasDiscovered.current) {
        hasDiscovered.current = true;
        // First try to get persisted IP
        const persistedIp = getPersistedIp();
        
        if (persistedIp) {
          setRaspberryPiIP(persistedIp);
          raspberryPiIPRef.current = persistedIp;
        } else {
          // Perform discovery if no persisted IP
          const discoveredIp = await performDiscovery();
          if (discoveredIp) {
            setRaspberryPiIP(discoveredIp);
            raspberryPiIPRef.current = discoveredIp;
          } else {
            // Fallback to localhost for local development
            setRaspberryPiIP('localhost');
            raspberryPiIPRef.current = 'localhost';
          }
        }
        
        // Wait a moment for state to update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Trigger initial GPS fetch after discovery
        await fetchLiveGPSData();
      }
      fetchLiveMapData();
    };
    
    initializeDiscovery();
    
    // Set up real-time subscription for trips
    const subscription = supabase
      .channel('trips-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchLiveMapData();
      })
      .subscribe();

    // Set up GPS polling for real-time updates
    const gpsInterval = setInterval(async () => {
      const gpsData = await fetchLiveGPSData();
      
      if (gpsData) {
        // Decode location for the current coordinates
        const locationKey = `${gpsData.latitude.toFixed(4)},${gpsData.longitude.toFixed(4)}`;
        
        // Fetch address if not already cached
        setDecodedLocations(prev => {
          if (!prev[locationKey]) {
            // Async decode - will be handled separately
            decodeLocation(gpsData.latitude, gpsData.longitude).then(address => {
              setDecodedLocations(prev => ({
                ...prev,
                [locationKey]: address
              }));
            });
          }
          return prev;
        });

        // Update all active buses with live GPS data (coordinates only)
        setBuses(prevBuses => {
          const updatedBuses = prevBuses.map(bus => {
            if (bus.status === 'active') {
              return {
                ...bus,
                lat: gpsData.latitude,
                lng: gpsData.longitude,
                altitude: gpsData.altitude,
                speed: gpsData.speed,
                accuracy: gpsData.accuracy,
                lastGPSUpdate: new Date().toISOString()
              };
            }
            return bus;
          });
          return updatedBuses;
        });
        
        // Update map center to follow GPS
        setMapCenter([gpsData.latitude, gpsData.longitude]);
      }
    }, 5000); // Poll every 5 seconds

    return () => {
      subscription.unsubscribe();
      clearInterval(gpsInterval);
    };
  }, [performDiscovery, fetchLiveGPSData]);

  const fetchLiveMapData = async () => {
    try {
      setLoading(true);

      // Fetch active trips with bus information
      const { data: activeTrips } = await supabase
        .from('trips')
        .select('*, buses(*)')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false });

      // Fetch all buses
      const { data: allBuses } = await supabase
        .from('buses')
        .select('*');

      // Transform trips to bus markers
      const busMarkers = (activeTrips || []).map(trip => {
        const lat = trip.current_lat || 14.5995;
        const lng = trip.current_lng || 120.9842;
        const locationKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        
        return {
          id: trip.id,
          plate: trip.buses?.plate_number || 'Unknown',
          route: trip.buses?.route || 'Unknown',
          lat: lat,
          lng: lng,
          passengers: 0, // Will be fetched from passenger_counts
          status: 'active',
          busId: trip.bus_id,
          tripId: trip.id,
          decodedLocation: decodedLocations[locationKey] || 'Loading location...'
        };
      });

      // Add inactive buses
      const inactiveBuses = (allBuses || [])
        .filter(bus => bus.status !== 'active' || !activeTrips?.some(t => t.bus_id === bus.id))
        .map(bus => {
          const lat = 14.5995;
          const lng = 120.9842;
          const locationKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
          
          return {
            id: bus.id,
            plate: bus.plate_number,
            route: bus.route,
            lat: lat,
            lng: lng,
            passengers: 0,
            status: bus.status === 'maintenance' ? 'maintenance' : 'idle',
            busId: bus.id,
            decodedLocation: decodedLocations[locationKey] || 'Depot location'
          };
        });

      // Always add GPS tracker bus when GPS data is available
      if (gpsData && gpsConnected && gpsData.latitude && gpsData.longitude) {
        const locationKey = `${gpsData.latitude.toFixed(4)},${gpsData.longitude.toFixed(4)}`;
        
        // Decode location immediately for GPS tracker
        if (!decodedLocations[locationKey]) {
          decodeLocation(gpsData.latitude, gpsData.longitude).then(address => {
            setDecodedLocations(prev => ({
              ...prev,
              [locationKey]: address
            }));
          });
        }
        
        const gpsBus = {
          id: 'gps-tracker',
          plate: 'GPS Tracker',
          route: 'Live GPS',
          lat: gpsData.latitude,
          lng: gpsData.longitude,
          passengers: 0,
          status: 'active',
          busId: 'gps-tracker',
          tripId: 'gps-tracker',
          decodedLocation: decodedLocations[locationKey] || 'Loading location...',
          altitude: gpsData.altitude,
          speed: gpsData.speed,
          accuracy: gpsData.accuracy,
          lastGPSUpdate: new Date().toISOString()
        };
        // Add GPS tracker bus (remove any existing one first to avoid duplicates)
        const filteredMarkers = busMarkers.filter(b => b.id !== 'gps-tracker');
        filteredMarkers.push(gpsBus);
        busMarkers = filteredMarkers;
      }

      // Fetch passenger counts for active trips
      const tripIds = (activeTrips || []).map(t => t.id);
      let totalPassengers = 0;
      
      if (tripIds.length > 0) {
        const { data: passengerCounts } = await supabase
          .from('passenger_counts')
          .select('trip_id, count')
          .in('trip_id', tripIds)
          .order('recorded_at', { ascending: false });

        // Group by trip_id and get latest count
        const latestCounts = {};
        (passengerCounts || []).forEach(pc => {
          if (!latestCounts[pc.trip_id]) {
            latestCounts[pc.trip_id] = pc.count;
          }
        });

        busMarkers.forEach(bus => {
          if (latestCounts[bus.tripId]) {
            bus.passengers = latestCounts[bus.tripId];
            totalPassengers += latestCounts[bus.tripId];
          }
        });
      }

      setBuses([...busMarkers, ...inactiveBuses]);

      // Decode locations for all buses in background
      const allBusLocations = [...busMarkers, ...inactiveBuses];
      allBusLocations.forEach(async (bus) => {
        const locationKey = `${bus.lat.toFixed(4)},${bus.lng.toFixed(4)}`;
        if (!decodedLocations[locationKey]) {
          const address = await decodeLocation(bus.lat, bus.lng);
          setDecodedLocations(prev => ({
            ...prev,
            [locationKey]: address
          }));
        }
      });

      // Calculate stats
      const uniqueRoutes = [...new Set((allBuses || []).map(b => b.route))];
      const activeBusesCount = (allBuses || []).filter(b => b.status === 'active').length;
      const maintenanceBusesCount = (allBuses || []).filter(b => b.status === 'maintenance').length;

      setStats({
        totalPassengers,
        activeBuses: activeBusesCount,
        totalRoutes: uniqueRoutes.length,
        maintenanceBuses: maintenanceBusesCount
      });

      const routeColors = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444'];
      setRoutes(uniqueRoutes.map((route, index) => ({
        id: index + 1,
        name: route,
        color: routeColors[index % routeColors.length],
        path: [] // Will need GPS logs to draw actual routes
      })));

    } catch (error) {
      console.error('Error fetching live map data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Refresh locations when decoded locations change
  useEffect(() => {
    setBuses(prevBuses => {
      return prevBuses.map(bus => {
        const locationKey = `${bus.lat.toFixed(4)},${bus.lng.toFixed(4)}`;
        return {
          ...bus,
          decodedLocation: decodedLocations[locationKey] || bus.decodedLocation || 'Loading location...'
        };
      });
    });
  }, [decodedLocations]);

  const BusMarker = ({ bus }) => (
    <Marker position={[bus.lat, bus.lng]}>
      <Popup>
        <div className="p-2">
          <h3 className="font-bold text-gray-800">{bus.plate}</h3>
          <p className="text-sm text-gray-600">{bus.route}</p>
          <div className="flex items-center gap-2 mt-2">
            <Users size={16} className="text-orange-500" />
            <span className="text-sm">{bus.passengers} passengers</span>
          </div>
          <div className="mt-2 p-2 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-1 text-xs text-blue-800 mb-1">
              <MapPin size={12} />
              <span className="font-semibold">Coordinates:</span>
            </div>
            <div className="text-xs text-gray-700">
              {bus.lat.toFixed(6)}, {bus.lng.toFixed(6)}
            </div>
            <div className="flex items-center gap-1 text-xs text-blue-800 mt-2 mb-1">
              <MapPin size={12} />
              <span className="font-semibold">Location:</span>
            </div>
            <div className="text-xs text-gray-700 max-w-xs">
              {bus.decodedLocation || 'Loading location...'}
            </div>
          </div>
          {bus.lastGPSUpdate && (
            <div className="mt-2 text-xs text-gray-500">
              <div>GPS Updated: {new Date(bus.lastGPSUpdate).toLocaleTimeString()}</div>
              {bus.speed !== undefined && <div>Speed: {bus.speed.toFixed(1)} km/h</div>}
              {bus.altitude !== undefined && <div>Altitude: {bus.altitude.toFixed(1)}m</div>}
              {bus.accuracy !== undefined && <div>Accuracy: ±{bus.accuracy.toFixed(1)}m</div>}
            </div>
          )}
          <span className={`inline-block px-2 py-1 rounded text-xs mt-2 ${bus.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
            {bus.status}
          </span>
        </div>
      </Popup>
    </Marker>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Live Map</h1>
          <p className="text-white/60">Loading GPS data...</p>
        </div>
      </div>
    );
  }

  // Use GPS data as center if available, otherwise use first bus or default
  const center = mapCenter && mapCenter[0] && mapCenter[1]
    ? mapCenter
    : buses.length > 0 && buses[0].lat && buses[0].lng
    ? [buses[0].lat, buses[0].lng]
    : [14.5995, 120.9842];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-3xl font-bold mb-2">Live Map</h1>
        <p className="text-white/60">Real-time GPS tracking of all buses</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <SummaryCard 
          title="Total Passengers" 
          value={stats.totalPassengers} 
          icon={Users} 
          color="bg-blue-500" 
        />
        <SummaryCard 
          title="Active Buses" 
          value={stats.activeBuses} 
          icon={Bus} 
          color="bg-green-500" 
        />
        <SummaryCard 
          title="Total Routes" 
          value={stats.totalRoutes} 
          icon={Navigation} 
          color="bg-purple-500" 
        />
        <div className="glass-card p-4 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between mb-2">
            <div className={`w-10 h-10 rounded-lg ${gpsConnected ? 'bg-green-500' : 'bg-red-500'} flex items-center justify-center`}>
              <MapPin className="w-5 h-5 text-white" />
            </div>
          </div>
          <h3 className="text-white/60 text-xs mb-1">GPS Status</h3>
          <p className="text-white text-xl font-bold">{gpsConnected ? 'Connected' : 'Disconnected'}</p>
          {gpsData && (
            <p className="text-white/40 text-xs mt-1">
              {gpsData.latitude.toFixed(4)}, {gpsData.longitude.toFixed(4)}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="glass-card p-4 h-[600px]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white font-bold">Live Map</h2>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <Settings size={20} />
              </button>
            </div>
            
            {showSettings && (
              <div className="bg-white/10 p-4 rounded-xl mb-4 space-y-4">
                <div className="flex items-center gap-3">
                  <MapPin className="text-orange-400" size={20} />
                  <input
                    type="text"
                    value={raspberryPiIP || ''}
                    onChange={(e) => setRaspberryPiIP(e.target.value)}
                    placeholder="Raspberry Pi IP Address"
                    className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                  />
                  <button
                    onClick={async () => {
                      setShowSettings(false);
                      // Persist the new IP
                      if (raspberryPiIP) {
                        persistIp(raspberryPiIP);
                        raspberryPiIPRef.current = raspberryPiIP;
                      }
                      // Trigger immediate GPS fetch with new IP
                      await fetchLiveGPSData();
                    }}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Save
                  </button>
                </div>
                <p className="text-white/40 text-xs">Enter the IP address of your Raspberry Pi GPS server</p>
                
                <div className="border-t border-white/20 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-white text-sm font-semibold">Auto-Discovery</h4>
                    <button
                      onClick={performDiscovery}
                      disabled={isScanning}
                      className={`${
                        isScanning 
                          ? 'bg-gray-500 cursor-not-allowed' 
                          : 'bg-blue-500 hover:bg-blue-600'
                      } text-white px-3 py-1.5 rounded-lg text-sm transition-colors`}
                    >
                      {isScanning ? 'Scanning...' : 'Scan Network'}
                    </button>
                  </div>
                  
                  {discoveryLog.length > 0 && (
                    <div className="bg-black/30 rounded-lg p-3 max-h-32 overflow-y-auto">
                      {discoveryLog.map((log, index) => (
                        <div 
                          key={index} 
                          className={`text-xs mb-1 ${
                            log.type === 'success' ? 'text-green-400' : 
                            log.type === 'error' ? 'text-red-400' : 
                            'text-white/70'
                          }`}
                        >
                          <span className="text-white/40">[{log.time}]</span> {log.message}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <p className="text-white/40 text-xs mt-2">
                    Automatically scans local network for Raspberry Pi GPS server
                  </p>
                </div>
              </div>
            )}
            
            <MapContainer center={center} zoom={13} style={{ height: 'calc(100% - 80px)', width: '100%' }}>
              <MapController center={center} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {routes.map((route) => (
                route.path.length > 0 && (
                  <Polyline
                    key={route.id}
                    positions={route.path}
                    color={route.color}
                    weight={4}
                    opacity={0.7}
                  />
                )
              ))}
              {buses.map((bus) => (
                <BusMarker key={bus.id} bus={bus} />
              ))}
            </MapContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
              <Bus className="text-orange-400" />
              Active Buses
            </h3>
            <div className="space-y-3">
              {buses.length > 0 ? (
                buses.map((bus) => (
                  <div key={bus.id} className="bg-white/5 p-3 rounded-xl">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-white font-medium text-sm">{bus.plate}</p>
                        <p className="text-white/60 text-xs">{bus.route}</p>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${bus.status === 'active' ? 'bg-green-400' : 'bg-gray-400'}`} />
                    </div>
                    <div className="flex items-center gap-2 text-white/70 text-xs mb-2">
                      <Users size={14} />
                      <span>{bus.passengers} passengers</span>
                    </div>
                    <div className="mt-2 p-2 bg-white/10 rounded-lg">
                      <div className="flex items-center gap-1 text-xs text-orange-400 mb-1">
                        <MapPin size={12} />
                        <span className="font-semibold">Coordinates:</span>
                      </div>
                      <div className="text-xs text-white/80">
                        {bus.lat.toFixed(6)}, {bus.lng.toFixed(6)}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-orange-400 mt-2 mb-1">
                        <MapPin size={12} />
                        <span className="font-semibold">Location:</span>
                      </div>
                      <div className="text-xs text-white/80" style={{ 
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {bus.decodedLocation || 'Loading location...'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-white/60 text-sm">No active buses</p>
              )}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
              <Navigation className="text-orange-400" />
              Routes
            </h3>
            <div className="space-y-3">
              {routes.map((route) => (
                <div key={route.id} className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: route.color }} />
                  <span className="text-white/70 text-sm">{route.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-white text-lg font-bold mb-4">Map Legend</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="text-white/70">Active Bus</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span className="text-white/70">Idle Bus</span>
              </div>
              {routes.map((route) => (
                <div key={route.id} className="flex items-center gap-2">
                  <div className="w-6 h-1 rounded" style={{ backgroundColor: route.color }} />
                  <span className="text-white/70">{route.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMap;
