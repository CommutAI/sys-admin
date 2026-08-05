import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { Bus, Navigation, Users, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import 'leaflet/dist/leaflet.css';

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

  useEffect(() => {
    fetchLiveMapData();
    // Set up real-time subscription for trips
    const subscription = supabase
      .channel('trips-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchLiveMapData();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
      const busMarkers = (activeTrips || []).map(trip => ({
        id: trip.id,
        plate: trip.buses?.plate_number || 'Unknown',
        route: trip.buses?.route || 'Unknown',
        lat: trip.current_lat || 14.5995,
        lng: trip.current_lng || 120.9842,
        passengers: 0, // Will be fetched from passenger_counts
        status: 'active',
        busId: trip.bus_id,
        tripId: trip.id
      }));

      // Add inactive buses
      const inactiveBuses = (allBuses || [])
        .filter(bus => bus.status !== 'active' || !activeTrips?.some(t => t.bus_id === bus.id))
        .map(bus => ({
          id: bus.id,
          plate: bus.plate_number,
          route: bus.route,
          lat: 14.5995,
          lng: 120.9842,
          passengers: 0,
          status: bus.status === 'maintenance' ? 'maintenance' : 'idle',
          busId: bus.id
        }));

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

  const center = buses.length > 0 && buses[0].lat
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
        <SummaryCard 
          title="Maintenance" 
          value={stats.maintenanceBuses} 
          icon={AlertTriangle} 
          color="bg-yellow-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="glass-card p-4 h-[600px]">
            <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
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
                    <div className="flex items-center gap-2 text-white/70 text-xs">
                      <Users size={14} />
                      <span>{bus.passengers} passengers</span>
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
