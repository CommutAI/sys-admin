import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Users, DollarSign, Bus, AlertTriangle, HeadphonesIcon, Map as MapIcon, Navigation, CheckCircle, Clock, Search, Filter, MapPin, Video, Wifi, WifiOff, Camera, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import 'leaflet/dist/leaflet.css';
import VideoMonitoring from './VideoMonitoring';
import { useRaspberryPi } from '../hooks/useRaspberryPi';

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

const AIAlertCard = ({ type, message, time, severity }) => {
  const severityColors = {
    high: 'bg-red-500/20 border-red-500/50',
    medium: 'bg-orange-500/20 border-orange-500/50',
    low: 'bg-yellow-500/20 border-yellow-500/50',
  };

  return (
    <div className={`glass-card p-4 border ${severityColors[severity]} mb-3`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 mt-0.5 ${severity === 'high' ? 'text-red-400' : severity === 'medium' ? 'text-orange-400' : 'text-yellow-400'}`} />
        <div className="flex-1">
          <p className="text-white font-medium text-sm">{type}</p>
          <p className="text-white/60 text-sm mt-1">{message}</p>
          <p className="text-white/40 text-xs mt-2">{time}</p>
        </div>
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
  const [showVideoMonitoring, setShowVideoMonitoring] = useState(false);

  // Raspberry Pi integration
  const {
    online: piOnline,
    connectionStatus: piConnectionStatus,
    cameraActive: piCameraActive,
    passengerCount: piPassengerCount,
    currentTripId: piCurrentTripId,
    hardwareStatus: piHardwareStatus,
    emergencyStatus: piEmergencyStatus,
    location: piLocation
  } = useRaspberryPi({ autoConnect: false, enableHealthCheck: false });

  useEffect(() => {
    fetchDashboardData();
    fetchLiveMapData();
    fetchEmergencyAlerts();
    // Set up real-time subscription for trips
    const tripsSubscription = supabase
      .channel('trips-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
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
      alertsSubscription.unsubscribe();
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch active buses
      const { data: buses } = await supabase
        .from('buses')
        .select('*')
        .eq('status', 'active');

      // Fetch today's trips
      const today = new Date().toISOString().split('T')[0];
      const { data: trips } = await supabase
        .from('trips')
        .select('*, buses(*)')
        .gte('started_at', today);

      // Fetch passenger counts for today
      const { data: passengerCounts } = await supabase
        .from('passenger_counts')
        .select('count')
        .gte('recorded_at', today);

      // Fetch fare irregularities for today
      const { data: irregularities } = await supabase
        .from('fare_irregularities')
        .select('*, trips(*, buses(*))')
        .gte('detected_at', today)
        .order('detected_at', { ascending: false })
        .limit(10);

      // Fetch emergency alerts
      const { data: emergencyAlerts } = await supabase
        .from('emergency_alerts')
        .select('*, trips(*, buses(*))')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5);

      // Fetch staff users
      const { data: staffUsers } = await supabase
        .from('staff_users')
        .select('*')
        .eq('is_active', true);

      // Calculate KPIs
      const totalPassengers = passengerCounts?.reduce((sum, pc) => sum + (pc.count || 0), 0) || 0;
      const totalTrips = trips?.length || 0;
      const activeBusesCount = buses?.length || 0;
      const activeConductorsCount = staffUsers?.filter(u => u.role === 'conductor').length || 0;
      const activeDriversCount = activeConductorsCount;

      // Calculate revenue (from transactions)
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount, type')
        .gte('created_at', today);

      const totalRevenue = transactions?.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) || 0;
      
      // Calculate bus fare revenue (fare_validation transactions)
      const busFareRevenue = transactions
        ?.filter(t => t.type === 'fare_validation')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) || 0;
      
      // Calculate baggage fee revenue (assuming a separate transaction type or calculation)
      // For now, we'll estimate it as a portion of total revenue since specific baggage transactions aren't defined
      const baggageFeeRevenue = transactions
        ?.filter(t => t.type === 'balance_topup' || t.type === 'card_issuance')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) || 0;

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
        passengers: 0,
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

      setMapStats({
        totalPassengers,
        activeBuses: activeBusesCount,
        totalRoutes: uniqueRoutes.length,
        maintenanceBuses: maintenanceBusesCount
      });
    } catch (error) {
      console.error('Error fetching live map data:', error);
    }
  };

  const fetchEmergencyAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('emergency_alerts')
        .select('*, trips(*, buses(*)), staff_users!conductor_id(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmergencyAlerts(data || []);
    } catch (error) {
      console.error('Error fetching emergency alerts:', error);
      // Set empty array on error to prevent UI crashes
      setEmergencyAlerts([]);
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ 
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (error) throw error;
      fetchEmergencyAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      alert('Error acknowledging alert: ' + error.message);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ 
          status: 'resolved',
          resolved_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (error) throw error;
      fetchEmergencyAlerts();
    } catch (error) {
      console.error('Error resolving alert:', error);
      alert('Error resolving alert: ' + error.message);
    }
  };

  const filteredAlerts = emergencyAlerts.filter(alert => {
    const matchesSearch = alert.notes?.toLowerCase().includes(alertSearchTerm.toLowerCase()) ||
                         alert.trips?.buses?.plate_number?.toLowerCase().includes(alertSearchTerm.toLowerCase()) ||
                         alert.staff_users?.full_name?.toLowerCase().includes(alertSearchTerm.toLowerCase());
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

  const center = buses.length > 0 && buses[0].lat
    ? [buses[0].lat, buses[0].lng]
    : [14.5995, 120.9842];

  const ShortcutCard = ({ title, value, icon: Icon, color, link }) => (
    <Link to={link} className="block">
      <div className="glass-card p-4 hover:scale-105 transition-transform duration-300 cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white/60 text-xs">{title}</p>
              <p className="text-white font-bold">{value}</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );

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

      {/* Raspberry Pi Status Card */}
      <div className={`glass-card p-6 rounded-xl border ${
        piOnline ? 'border-green-500/30' : 'border-red-500/30'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl ${piOnline ? 'bg-green-500/20' : 'bg-red-500/20'} flex items-center justify-center`}>
              {piOnline ? (
                <Wifi className="w-6 h-6 text-green-400" />
              ) : (
                <WifiOff className="w-6 h-6 text-red-400" />
              )}
            </div>
            <div>
              <h3 className="text-white font-semibold">Raspberry Pi Status</h3>
              <p className="text-white/60 text-sm">
                {piOnline ? 'Connected' : 'Disconnected'} - {piConnectionStatus.charAt(0).toUpperCase() + piConnectionStatus.slice(1)}
              </p>
            </div>
          </div>
          <Link to="/video-monitoring" className="text-orange-400 hover:text-orange-300 text-sm font-medium">
            View Live Feed →
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <Camera className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-white/60 text-xs">Camera</p>
              <p className={`text-sm font-medium ${piCameraActive ? 'text-green-400' : 'text-red-400'}`}>
                {piCameraActive ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-purple-400" />
            <div>
              <p className="text-white/60 text-xs">Passengers</p>
              <p className="text-sm font-medium text-white">{piPassengerCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-orange-400" />
            <div>
              <p className="text-white/60 text-xs">Trip ID</p>
              <p className="text-sm font-medium text-white">
                {piCurrentTripId ? `#${piCurrentTripId.slice(0, 8)}` : 'None'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AlertTriangle className={`w-5 h-5 ${piEmergencyStatus.emergency_active ? 'text-red-400' : 'text-green-400'}`} />
            <div>
              <p className="text-white/60 text-xs">Emergency</p>
              <p className={`text-sm font-medium ${piEmergencyStatus.emergency_active ? 'text-red-400' : 'text-green-400'}`}>
                {piEmergencyStatus.emergency_active ? 'Active' : 'Clear'}
              </p>
            </div>
          </div>
        </div>

        {piLocation.latitude && piLocation.longitude && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-green-400" />
              <span className="text-white/60">Location:</span>
              <span className="text-white">
                {piLocation.latitude.toFixed(4)}, {piLocation.longitude.toFixed(4)}
              </span>
              {piLocation.address && (
                <span className="text-white/40 ml-2">({piLocation.address})</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live Map Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <MapIcon className="text-orange-400" />
            Live Bus Tracking
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <div className="h-[400px] rounded-xl overflow-hidden">
              <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {buses.map((bus) => (
                  <BusMarker key={bus.id} bus={bus} />
                ))}
              </MapContainer>
            </div>
            <div className="bg-white/5 p-4 rounded-xl mt-4">
              <h3 className="text-white text-sm font-bold mb-3">Map Legend</h3>
              <div className="flex gap-6 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="text-white/70">Active Bus</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                  <span className="text-white/70">Idle Bus</span>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-3">
              <div className="bg-white/5 p-4 rounded-xl">
                <p className="text-white/60 text-xs">Active Buses</p>
                <p className="text-white text-2xl font-bold">{mapStats.activeBuses}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <p className="text-white/60 text-xs">Passengers</p>
                <p className="text-white text-2xl font-bold">{mapStats.totalPassengers}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <p className="text-white/60 text-xs">Routes</p>
                <p className="text-white text-2xl font-bold">{mapStats.totalRoutes}</p>
              </div>
            </div>
            
            {/* Active Buses Dropdown */}
            <div className="bg-white/5 p-4 rounded-xl">
              <h3 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
                <Bus className="text-orange-400" size={16} />
                Active Buses
              </h3>
              <div className="space-y-3">
                <select
                  value={selectedBus || ''}
                  onChange={(e) => setSelectedBus(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select a bus...</option>
                  {buses.length > 0 ? (
                    buses.slice(0, 5).map((bus) => (
                      <option key={bus.id} value={bus.id}>
                        {bus.plate} - {bus.route}
                      </option>
                    ))
                  ) : (
                    <option disabled>No active buses</option>
                  )}
                </select>
                {selectedBus && buses.find(b => b.id === selectedBus) && (
                  <div className="p-3 bg-black/30 rounded-lg border border-white/10">
                    {(() => {
                      const bus = buses.find(b => b.id === selectedBus);
                      return (
                        <>
                          <p className="text-white/80 text-sm mb-2">{bus.route}</p>
                          <div className="flex items-center gap-2 text-white/70 text-sm">
                            <Users size={14} />
                            <span>{bus.passengers} passengers</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions and Emergency Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <ShortcutCard 
              title="Analytics" 
              value="View" 
              icon={Navigation} 
              color="bg-purple-500" 
              link="/analytics"
            />
            <ShortcutCard 
              title="Active Alerts" 
              value={emergencyAlerts.filter(a => a.status === 'active').length || '0'} 
              icon={AlertTriangle} 
              color="bg-red-500" 
              link="/"
            />
            <ShortcutCard 
              title="Fare Issues" 
              value={alerts.filter(a => a.type.includes('SCAN') || a.type.includes('MISMATCH')).length || 0} 
              icon={AlertTriangle} 
              color="bg-yellow-500" 
              link="/fare-irregularities"
            />
            <ShortcutCard 
              title="Service Logs" 
              value="New" 
              icon={HeadphonesIcon} 
              color="bg-blue-500" 
              link="/users"
            />
            <div 
              onClick={() => setShowVideoMonitoring(!showVideoMonitoring)}
              className="glass-card p-4 hover:scale-105 transition-transform duration-300 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center">
                    <Video className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white/60 text-xs">Video Feed</p>
                    <p className="text-white font-bold">{showVideoMonitoring ? 'Hide' : 'Show'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-white text-xl font-bold mb-4">Quick Stats</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                <span className="text-white/70 text-sm">Total Routes</span>
                <span className="text-white font-bold">{stats.totalRoutes}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                <span className="text-white/70 text-sm">Active Conductors</span>
                <span className="text-white font-bold">{stats.activeConductors}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                <span className="text-white/70 text-sm">Avg. Trip Duration</span>
                <span className="text-white font-bold">{stats.avgTripDuration}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                <span className="text-white/70 text-sm">Total Bus Fare Revenue</span>
                <span className="text-white font-bold">${typeof stats.totalBusFare === 'number' ? stats.totalBusFare.toLocaleString() : '0'}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                <span className="text-white/70 text-sm">Total Baggage Fee Revenue</span>
                <span className="text-white font-bold">${typeof stats.totalBaggageFees === 'number' ? stats.totalBaggageFees.toLocaleString() : '0'}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                <span className="text-white/70 text-sm">Seat Utilization</span>
                <span className="text-white font-bold">{stats.seatUtilization}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-xl font-bold flex items-center gap-2">
              <AlertTriangle className="text-orange-400" />
              Emergency Alerts
            </h2>
          </div>
          
          {/* Alert Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-white/60 text-xs">Active</p>
                  <p className="text-white text-xl font-bold">{emergencyAlerts.filter(a => a.status === 'active').length}</p>
                </div>
              </div>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-white/60 text-xs">Acknowledged</p>
                  <p className="text-white text-xl font-bold">{emergencyAlerts.filter(a => a.status === 'acknowledged').length}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-white/60 text-xs">Resolved</p>
                  <p className="text-white text-xl font-bold">{emergencyAlerts.filter(a => a.status === 'resolved').length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Alert Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
              <input
                type="text"
                placeholder="Search alerts..."
                value={alertSearchTerm}
                onChange={(e) => setAlertSearchTerm(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
              />
            </div>
            <select
              value={alertFilterStatus}
              onChange={(e) => setAlertFilterStatus(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          {/* Alerts List */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {filteredAlerts.length > 0 ? (
              filteredAlerts.slice(0, 5).map((alert) => {
                const StatusIcon = alertStatusIcons[alert.status];
                return (
                  <div key={alert.id} className={`p-4 rounded-xl border ${alertStatusColors[alert.status]}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10">
                          <StatusIcon size={16} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-white font-medium text-sm">Emergency Alert</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${alertStatusColors[alert.status]}`}>
                              {alert.status}
                            </span>
                          </div>
                          <p className="text-white/70 text-sm mb-2">{alert.notes || 'No description provided'}</p>
                          <div className="flex items-center gap-3 text-white/60 text-xs">
                            <div className="flex items-center gap-1">
                              <MapPin size={12} />
                              <span>{alert.trips?.buses?.plate_number || 'Unknown Bus'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock size={12} />
                              <span>{new Date(alert.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {alert.status === 'active' && (
                          <button
                            onClick={() => handleAcknowledgeAlert(alert.id)}
                            className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors text-xs"
                          >
                            Acknowledge
                          </button>
                        )}
                        {alert.status === 'acknowledged' && (
                          <button
                            onClick={() => handleResolveAlert(alert.id)}
                            className="px-2 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-xs"
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
              <div className="text-center py-8">
                <AlertTriangle className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/60 text-sm">No emergency alerts found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {alerts.length > 0 ? (
            alerts.map((alert, index) => (
              <AIAlertCard key={index} {...alert} />
            ))
          ) : (
            <p className="text-white/60">No recent activity</p>
          )}
        </div>
      </div>

      {/* Video Monitoring Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <Video className="text-orange-400" />
            Live Video Monitoring
          </h2>
          <button
            onClick={() => setShowVideoMonitoring(!showVideoMonitoring)}
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {showVideoMonitoring ? 'Hide' : 'Show'} Camera Feed
          </button>
        </div>
        
        {showVideoMonitoring && (
          <div className="mt-4">
            <VideoMonitoring 
              autoConnect={true} 
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
