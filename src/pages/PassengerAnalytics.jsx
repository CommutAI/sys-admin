import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, Armchair, Calendar, Brain, AlertTriangle, Eye, Scan, XCircle, CheckCircle, Search, Filter, Video, Camera, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRaspberryPi } from '../hooks/useRaspberryPi';
import { useBackendVideo } from '../hooks/useBackendVideo';
import AuditService from '../services/auditService';

const PassengerAnalytics = () => {
  const [timeRange, setTimeRange] = useState('daily');
  const [passengerCounts, setPassengerCounts] = useState([]);
  const [boardedPassengers, setBoardedPassengers] = useState([]);
  const [fareIrregularities, setFareIrregularities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCameraFeeds, setShowCameraFeeds] = useState(false);
  const [cameraFeeds, setCameraFeeds] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [stats, setStats] = useState({
    totalPassengers: 0,
    yoloCount: 0,
    qrCount: 0,
    seatUtilization: 0,
    anomaliesDetected: 0
  });

  const {
    online,
    connectionStatus,
    passengerCount,
    averageCount,
    isStreaming,
    lastUpdate,
    videoRef,
    refresh,
    assignedBus,
    activeTripId,
    cameraActive,
  } = useRaspberryPi({ autoConnect: false, enableHealthCheck: false });

  // Backend video connection for YOLOv8m processing
  const {
    isStreaming: backendStreaming,
    passengerCount: backendCount,
    videoRef: backendVideoRef,
    refresh: backendRefresh,
  } = useBackendVideo({ autoConnect: true });

  // Use backend video if available, otherwise fall back to Pi
  const videoConnected = backendStreaming || isStreaming;
  const videoSourceRef = backendStreaming ? backendVideoRef : videoRef;
  const videoRefresh = backendStreaming ? backendRefresh : refresh;
  const currentPassengerCount = backendCount || passengerCount;

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);

      // Fetch passenger counts based on time range
      let startDate = new Date();
      if (timeRange === 'hourly') {
        startDate.setHours(startDate.getHours() - 24);
      } else if (timeRange === 'daily') {
        startDate.setDate(startDate.getDate() - 7);
      } else {
        startDate.setMonth(startDate.getMonth() - 6);
      }

      let counts = [];
      let boarded = [];
      let irregularities = [];

      try {
        // Only fetch counts for trips that belong to the Pi's assigned bus
        const busFilter = assignedBus?.busId;
        let countsQuery = supabase
          .from('passenger_counts')
          .select('*, trips(*, bus_id:buses!trips_bus_id_fkey(*))')
          .gte('recorded_at', startDate.toISOString())
          .order('recorded_at', { ascending: true });

        if (busFilter) {
          // Join through trips to filter by bus_id
          countsQuery = supabase
            .from('passenger_counts')
            .select('*, trips!inner(*, bus_id:buses!trips_bus_id_fkey(*))')
            .eq('trips.bus_id', busFilter)
            .gte('recorded_at', startDate.toISOString())
            .order('recorded_at', { ascending: true });
        }

        const { data: countsData } = await countsQuery;
        counts = countsData || [];
      } catch (err) {
        console.warn('Failed to fetch passenger counts:', err.message);
      }

      try {
        const { data: boardedData, error: boardedError } = await supabase
          .from('boarded_passengers')
          .select('id, boarded_at')
          .gte('boarded_at', startDate.toISOString())
          .order('boarded_at', { ascending: true });
        if (boardedError) console.warn('boarded_passengers query failed:', boardedError.message);
        boarded = boardedData || [];
      } catch (err) {
        console.warn('Failed to fetch boarded passengers:', err.message);
      }

      try {
        const { data: irregularitiesData } = await supabase
          .from('fare_irregularities')
          .select('*, trips!fare_irregularities_trip_id_fkey(*, bus_id:buses!trips_bus_id_fkey(*))')
          .gte('detected_at', startDate.toISOString())
          .order('detected_at', { ascending: false })
          .limit(10);
        irregularities = irregularitiesData || [];
      } catch (err) {
        console.warn('Failed to fetch fare irregularities:', err.message);
      }

      setPassengerCounts(counts);
      setBoardedPassengers(boarded);
      setFareIrregularities(irregularities);

      // Calculate statistics - use tickets (QR scans) as the primary passenger count
      const qrCount = boarded.length;
      const yoloCount = counts.reduce((sum, pc) => sum + (pc.ai_count || 0), 0);
      const anomaliesCount = irregularities.length;

      // Total passengers is now based on tickets, not YOLO counts
      const totalPassengers = qrCount;

      // Calculate seat utilization (would need bus capacity data)
      const seatUtilization = totalPassengers > 0 ? Math.round((qrCount / totalPassengers) * 100) : 0;

      setStats({
        totalPassengers,
        yoloCount,
        qrCount,
        seatUtilization,
        anomaliesDetected: anomaliesCount
      });

    } catch (error) {
      console.error('Error fetching analytics data:', error);
      // Set empty data on error to prevent empty page
      setPassengerCounts([]);
      setBoardedPassengers([]);
      setFareIrregularities([]);
      setStats({
        totalPassengers: 0,
        yoloCount: 0,
        qrCount: 0,
        seatUtilization: 0,
        anomaliesDetected: 0
      });
    } finally {
      setLoading(false);
    }
  };

  // Process data for charts
  const getChartData = () => {
    if (timeRange === 'hourly') {
      // Group by hour
      const hourlyMap = {};
      passengerCounts.forEach(pc => {
        const hour = new Date(pc.recorded_at).getHours();
        const key = `${hour}:00`;
        if (!hourlyMap[key]) {
          hourlyMap[key] = { hour: key, passengers: 0, yolo: 0, qr: 0 };
        }
        hourlyMap[key].passengers += pc.count || 0;
        hourlyMap[key].yolo += pc.ai_count || 0;
      });
      return Object.values(hourlyMap).sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
    } else if (timeRange === 'daily') {
      // Group by day
      const dailyMap = {};
      passengerCounts.forEach(pc => {
        const day = new Date(pc.recorded_at).toLocaleDateString('en-US', { weekday: 'short' });
        if (!dailyMap[day]) {
          dailyMap[day] = { day, passengers: 0, yolo: 0, qr: 0 };
        }
        dailyMap[day].passengers += pc.count || 0;
        dailyMap[day].yolo += pc.ai_count || 0;
      });
      return Object.values(dailyMap);
    } else {
      // Group by month
      const monthlyMap = {};
      passengerCounts.forEach(pc => {
        const month = new Date(pc.recorded_at).toLocaleDateString('en-US', { month: 'short' });
        if (!monthlyMap[month]) {
          monthlyMap[month] = { month, passengers: 0, yolo: 0, qr: 0 };
        }
        monthlyMap[month].passengers += pc.count || 0;
        monthlyMap[month].yolo += pc.ai_count || 0;
      });
      return Object.values(monthlyMap);
    }
  };

  const getXAxisKey = () => {
    switch (timeRange) {
      case 'hourly': return 'hour';
      case 'daily': return 'day';
      case 'monthly': return 'month';
      default: return 'day';
    }
  };

  const seatUtilizationData = [
    { name: 'Empty', value: 100 - stats.seatUtilization, color: '#22c55e' },
    { name: 'Occupied', value: stats.seatUtilization, color: '#f97316' },
  ];

  // Calculate route utilization
  const getRouteUtilization = () => {
    const routeMap = {};
    passengerCounts.forEach(pc => {
      const route = pc.trips?.bus_id?.route || 'Unknown';
      if (!routeMap[route]) {
        routeMap[route] = { route, count: 0 };
      }
      routeMap[route].count += pc.count || 0;
    });

    const maxCount = Math.max(...Object.values(routeMap).map(r => r.count), 1);
    return Object.values(routeMap).map(r => ({
      route: r.route,
      utilization: Math.round((r.count / maxCount) * 100)
    }));
  };

  const handleResolve = async (irregularityId) => {
    try {
      const irregularity = fareIrregularities.find(irr => irr.id === irregularityId);
      const irregularityType = irregularity?.type || 'unknown';

      const { error } = await supabase
        .from('fare_irregularities')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: (await supabase.auth.getUser()).data.user?.id
        })
        .eq('id', irregularityId);

      if (error) throw error;

      // Log irregularity resolution to audit logs
      await AuditService.logIrregularityResolved(irregularityId, irregularityType);

      // Update local state instead of refetching all data
      setFareIrregularities(prev =>
        prev.map(irr =>
          irr.id === irregularityId
            ? { ...irr, resolved: true, resolved_at: new Date().toISOString() }
            : irr
        )
      );
    } catch (error) {
      console.error('Error resolving irregularity:', error);
      alert('Error resolving irregularity: ' + error.message);
    }
  };

  const filteredIrregularities = fareIrregularities.filter(irr => {
    const matchesSearch = irr.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         irr.trips?.bus_id?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'resolved' ? irr.resolved : !irr.resolved);
    const matchesType = filterType === 'all' || irr.type === filterType || irr.anomaly_type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  // Fetch data on component mount and when time range or assigned bus changes
  useEffect(() => {
    fetchAnalyticsData();
    AuditService.logAnalyticsViewed(timeRange);
  }, [timeRange, assignedBus?.busId]);

  // Log initial page view
  useEffect(() => {
    AuditService.logPageView('Passenger Analytics');
  }, []);

  const typeColors = {
    fare_evasion: 'bg-red-500/20 text-red-400 border-red-500/50',
    count_mismatch: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
    camera_malfunction: 'bg-rose-500/20 text-rose-400 border-rose-500/50',
    hardware_error: 'bg-pink-500/20 text-pink-400 border-pink-500/50',
    overcrowding: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    double_scan: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    staff_absence: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    passenger_spike: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    trip_duration: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50',
    route_deviation: 'bg-red-600/20 text-red-300 border-red-600/50',
    boarding_rate: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50',
    passenger_dispute: 'bg-amber-600/20 text-amber-300 border-amber-600/50',
    wrong_route: 'bg-purple-600/20 text-purple-300 border-purple-600/50',
    overshooting: 'bg-teal-500/20 text-teal-400 border-teal-500/50',
    underpayment: 'bg-red-400/20 text-red-300 border-red-400/50',
    card_sharing: 'bg-violet-500/20 text-violet-400 border-violet-500/50',
    unauthorized_passenger: 'bg-rose-600/20 text-rose-300 border-rose-600/50',
    other: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };

  const typeLabels = {
    fare_evasion: 'Unpaid Passenger (Fare Evasion)',
    count_mismatch: 'Count Discrepancy (AI vs QR)',
    camera_malfunction: 'Camera / Video Feed Issue',
    hardware_error: 'Hardware Device Error',
    overcrowding: 'Overcapacity Alert',
    double_scan: 'Duplicate QR Scan',
    staff_absence: 'Staff Missing (No Conductor)',
    passenger_spike: 'Sudden Passenger Surge',
    trip_duration: 'Trip Duration Exceeded',
    route_deviation: 'Route Deviation Alert',
    boarding_rate: 'Abnormal Boarding Rate',
    passenger_dispute: 'Passenger Dispute',
    wrong_route: 'Wrong Route Logged',
    overshooting: 'Passenger Overshooting',
    underpayment: 'Fare Underpayment',
    card_sharing: 'Card Sharing Detected',
    unauthorized_passenger: 'Unauthorized Boarding',
    other: 'System Discrepancy',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Passenger Analytics</h1>
        <p className="text-white/60">Loading analytics data...</p>
        <div className="glass-card p-6">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-orange-400 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
            <Brain className="text-orange-400" />
            Passenger Analytics & AI Dashboard
          </h1>
          <p className="text-white/60">Detailed passenger count, utilization analytics, and AI-powered anomaly detection</p>
        </div>
        <div className="flex gap-2">
          {['hourly', 'daily', 'monthly'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-xl capitalize transition-colors ${
                timeRange === range
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Passengers (Tickets)</p>
              <p className="text-white text-2xl font-bold">{stats.totalPassengers.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-green-400 text-sm">Based on QR scans</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <Eye className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">YOLO Count</p>
              <p className="text-white text-2xl font-bold">{stats.yoloCount.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-green-400 text-sm">AI estimates</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
              <Scan className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">QR Scans</p>
              <p className="text-white text-2xl font-bold">{stats.qrCount.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-green-400 text-sm">Boarded passengers</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Anomalies</p>
              <p className="text-white text-2xl font-bold">{stats.anomaliesDetected}</p>
            </div>
          </div>
          <p className="text-amber-400 text-sm">System & fare alerts</p>
        </div>
      </div>

      {/* Live Video Monitoring Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <Video className="text-orange-400" />
            Live Bus Video Monitoring
            {assignedBus?.busPlate && (
              <span className="px-2 py-0.5 bg-orange-500/20 text-orange-300 text-xs rounded-full border border-orange-500/30">
                Bus {assignedBus.busNumber} · {assignedBus.busPlate}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={videoRefresh}
              className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
              title="Refresh Connection"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </div>

        {/* Connection Status */}
        <div className={`mb-4 p-4 rounded-xl flex items-center gap-3 ${
          backendStreaming ? 'border-green-500/30 bg-green-500/10' : online ? 'border-green-500/30 bg-green-500/10' : 'border-yellow-500/30 bg-yellow-500/10'
        }`}>
          {backendStreaming || online ? (
            <Wifi className="w-5 h-5 text-green-400" />
          ) : (
            <WifiOff className="w-5 h-5 text-yellow-400" />
          )}
          <div className="flex-1">
            <p className="text-white font-medium">
              {backendStreaming ? 'Backend Stream Active' : cameraActive === false ? 'Camera Disabled (GPS Only Mode)' : online ? 'Raspberry Pi Connected' : 'Connecting…'}
            </p>
            <p className="text-white/60 text-sm">
              {backendStreaming
                ? 'YOLOv8n AI Processing - Stream Status: Active'
                : cameraActive === false
                ? 'Pi running in GPS-only mode. Camera disabled for stability.'
                : online
                ? `Stream Status: ${isStreaming ? 'Active' : 'Inactive'}`
                : 'Connecting…'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Feed */}
          <div className="lg:col-span-2">
            <div className="bg-black/30 rounded-xl overflow-hidden relative aspect-video">
              <img
                ref={videoSourceRef}
                alt="Live video feed"
                className={`w-full h-full object-cover ${videoConnected ? 'block' : 'hidden'}`}
              />
              {!videoConnected && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center px-6">
                    {cameraActive === false ? (
                      <>
                        <Camera className="w-16 h-16 text-red-400 mx-auto mb-4" />
                        <p className="text-red-400 font-medium mb-1">Camera not connected</p>
                        <p className="text-white/40 text-sm">Please check camera connection</p>
                      </>
                    ) : (
                      <>
                        <Video className="w-16 h-16 text-white/30 mx-auto mb-4" />
                        <p className="text-white/50">
                          {backendStreaming ? 'Connecting to Backend...' : online ? 'Starting stream…' : 'Connecting…'}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
              {videoConnected && (
                <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-white text-sm font-medium">LIVE</span>
                    {backendStreaming && <span className="text-green-400 text-xs ml-2">· AI Processing</span>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Real-time Passenger Count */}
          <div className="space-y-4">
            <div className="bg-black/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-6 h-6 text-orange-400" />
                <h3 className="text-white font-semibold">Real-time Count</h3>
              </div>
              <div className="text-center py-6">
                <div className="text-5xl font-bold text-white mb-2">{currentPassengerCount}</div>
                <p className="text-white/60">Current Passengers</p>
              </div>
              {lastUpdate && (
                <div className="text-center text-white/40 text-sm">
                  Last updated: {lastUpdate}
                </div>
              )}
            </div>

            <div className="bg-black/30 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Statistics</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Average (30 frames)</span>
                  <span className="text-white font-medium">{averageCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Stream Status</span>
                  <span className={`font-medium ${isStreaming ? 'text-green-400' : 'text-red-400'}`}>
                    {isStreaming ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Connection</span>
                  <span className={`font-medium ${online ? 'text-green-400' : 'text-red-400'}`}>
                    {online ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-black/30 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Camera Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Model</span>
                  <span className="text-white">EMEET C60E</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Resolution</span>
                  <span className="text-white">320x240</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">AI Model</span>
                  <span className="text-white">YOLOv8n</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Detection Method</span>
                  <span className="text-white">YOLO</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4">Passenger Count Comparison (YOLO vs QR)</h2>
        {getChartData().length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/40">
            <TrendingUp className="w-12 h-12 mb-3" />
            <p>No passenger data available for the selected time range</p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={getChartData()}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey={getXAxisKey()} stroke="rgba(255,255,255,0.6)" />
            <YAxis stroke="rgba(255,255,255,0.6)" />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend />
            <Bar dataKey="passengers" fill="#f97316" name="Total Passengers (Tickets)" />
            <Bar dataKey="yolo" fill="#8b5cf6" name="YOLO Count" />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <XCircle className="text-orange-400" />
          System Anomalies & Irregularity Alerts
        </h2>
        
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search alerts by description or bus plate..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all" className="bg-gray-800 text-white">All Status</option>
            <option value="unresolved" className="bg-gray-800 text-white">Unresolved</option>
            <option value="resolved" className="bg-gray-800 text-white">Resolved</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all" className="bg-gray-800 text-white">All Alert Types</option>
            <option value="fare_evasion" className="bg-gray-800 text-white">Unpaid Passenger (Fare Evasion)</option>
            <option value="count_mismatch" className="bg-gray-800 text-white">Count Discrepancy (AI vs QR)</option>
            <option value="camera_malfunction" className="bg-gray-800 text-white">Camera / Video Feed Issue</option>
            <option value="overcrowding" className="bg-gray-800 text-white">Overcapacity Alert</option>
            <option value="double_scan" className="bg-gray-800 text-white">Duplicate QR Scan</option>
            <option value="staff_absence" className="bg-gray-800 text-white">Missing Staff</option>
            <option value="hardware_error" className="bg-gray-800 text-white">Hardware Error</option>
            <option value="other" className="bg-gray-800 text-white">Other Discrepancies</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-white/60 border-b border-white/10">
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium">Description</th>
                <th className="pb-3 font-medium">Bus</th>
                <th className="pb-3 font-medium">Detected</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredIrregularities.length > 0 ? (
                filteredIrregularities.map((irr) => {
                  const alertKey = irr.anomaly_type || irr.type;
                  const badgeColor = typeColors[alertKey] || typeColors[irr.type] || typeColors.other;
                  const badgeLabel = typeLabels[alertKey] || typeLabels[irr.type] || (alertKey || 'Alert').replace(/_/g, ' ');
                  return (
                    <tr key={irr.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs border ${badgeColor}`}>
                          {badgeLabel}
                        </span>
                      </td>
                      <td className="py-4 text-white/70">{irr.description}</td>
                      <td className="py-4 text-white/70">{irr.trips?.bus_id?.plate_number || 'N/A'}</td>
                      <td className="py-4 text-white/60 text-sm">
                        {new Date(irr.detected_at).toLocaleString()}
                      </td>
                      <td className="py-4">
                      <span className={`flex items-center gap-2 ${irr.resolved ? 'text-green-400' : 'text-red-400'}`}>
                        {irr.resolved ? (
                          <>
                            <CheckCircle size={14} />
                            Resolved
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={14} />
                            Unresolved
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-4">
                      {!irr.resolved && (
                        <button
                          onClick={() => handleResolve(irr.id)}
                          className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <AlertTriangle className="w-16 h-16 text-white/20 mx-auto mb-4" />
                    <p className="text-white/60">No system anomalies or irregularities found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4">Seat Utilization</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={seatUtilizationData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {seatUtilizationData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4">Route Utilization</h2>
          {getRouteUtilization().length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/40">
              <Armchair className="w-12 h-12 mb-3" />
              <p>No route data available</p>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={getRouteUtilization()} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis type="number" stroke="rgba(255,255,255,0.6)" />
              <YAxis dataKey="route" type="category" stroke="rgba(255,255,255,0.6)" width={80} />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
                formatter={(value) => `${value}%`}
              />
              <Bar dataKey="utilization" fill="#f97316" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4">Passenger Trend</h2>
        {getChartData().length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-white/40">
            <TrendingUp className="w-12 h-12 mb-3" />
            <p>No trend data available</p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={getChartData()}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey={getXAxisKey()} stroke="rgba(255,255,255,0.6)" />
            <YAxis stroke="rgba(255,255,255,0.6)" />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend />
            <Line type="monotone" dataKey="passengers" strokeWidth={3} stroke="#f97316" name="Total Passengers (Tickets)" />
            <Line type="monotone" dataKey="yolo" strokeWidth={2} stroke="#8b5cf6" name="YOLO Count" />
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default PassengerAnalytics;
