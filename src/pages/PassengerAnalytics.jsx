import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, Armchair, Calendar, Brain, AlertTriangle, Eye, Scan, XCircle, CheckCircle, Search, Filter, Video, Camera, Wifi, WifiOff, Play, Square, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRaspberryPi } from '../hooks/useRaspberryPi';

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
    error,
    passengerCount,
    averageCount,
    isStreaming,
    lastUpdate,
    videoRef,
    connect,
    disconnect,
    refresh,
    startStream,
    stopStream
  } = useRaspberryPi({ autoConnect: false, enableHealthCheck: false });

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
        const { data: countsData } = await supabase
          .from('passenger_counts')
          .select('*, trips(*, buses(*))')
          .gte('recorded_at', startDate.toISOString())
          .order('recorded_at', { ascending: true });
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
          .select('*, trips(*, buses(*))')
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

      // Calculate statistics
      const totalPassengers = counts.reduce((sum, pc) => sum + (pc.count || 0), 0);
      const yoloCount = counts.reduce((sum, pc) => sum + (pc.ai_count || 0), 0);
      const qrCount = boarded.length;
      const anomaliesCount = irregularities.length;

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
      const route = pc.trips?.buses?.route || 'Unknown';
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
      const { error } = await supabase
        .from('fare_irregularities')
        .update({ 
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: (await supabase.auth.getUser()).data.user?.id
        })
        .eq('id', irregularityId);

      if (error) throw error;
      fetchAnalyticsData();
    } catch (error) {
      console.error('Error resolving irregularity:', error);
      alert('Error resolving irregularity: ' + error.message);
    }
  };

  const filteredIrregularities = fareIrregularities.filter(irr => {
    const matchesSearch = irr.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         irr.trips?.buses?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'resolved' ? irr.resolved : !irr.resolved);
    const matchesType = filterType === 'all' || irr.type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  // Fetch data on component mount and when time range changes
  useEffect(() => {
    fetchAnalyticsData();
  }, [timeRange]);

  const typeColors = {
    double_scan: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    count_mismatch: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    fare_evasion: 'bg-red-500/20 text-red-400 border-red-500/50',
    other: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };

  const typeLabels = {
    double_scan: 'Double Scan',
    count_mismatch: 'Count Mismatch',
    fare_evasion: 'Fare Evasion',
    other: 'Other',
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
              <p className="text-white/60 text-sm">Total Passengers</p>
              <p className="text-white text-2xl font-bold">{stats.totalPassengers.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-green-400 text-sm">Based on counts</p>
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
          <p className="text-green-400 text-sm">Fare irregularities</p>
        </div>
      </div>

      {/* Live Video Monitoring Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <Video className="text-orange-400" />
            Live Bus Video Monitoring
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
              title="Refresh Connection"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </div>

        {/* Connection Status */}
        <div className={`mb-4 p-4 rounded-xl flex items-center gap-3 ${
          online ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'
        }`}>
          {online ? (
            <Wifi className="w-5 h-5 text-green-400" />
          ) : (
            <WifiOff className="w-5 h-5 text-red-400" />
          )}
          <div className="flex-1">
            <p className="text-white font-medium">
              {online ? 'Connected to Raspberry Pi' : 'Disconnected from Raspberry Pi'}
            </p>
            <p className="text-white/60 text-sm">
              Status: {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle size={16} />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Feed */}
          <div className="lg:col-span-2">
            <div className="bg-black/30 rounded-xl overflow-hidden relative aspect-video">
              <img
                ref={videoRef}
                alt="Live video feed"
                className={`w-full h-full object-contain ${isStreaming ? 'block' : 'hidden'}`}
              />
              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center px-6">
                    <Video className="w-16 h-16 text-white/30 mx-auto mb-4" />
                    {error ? (
                      <>
                        <p className="text-red-400 font-medium mb-1">Stream Error</p>
                        <p className="text-white/50 text-sm">{error}</p>
                        <p className="text-white/30 text-xs mt-2">Check the camera is connected and yolov8n.pt is present on the Pi</p>
                      </>
                    ) : (
                      <p className="text-white/50">
                        {online ? 'Click "Start Stream" to begin' : 'Connect to server to start streaming'}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {/* Overlay Info */}
              {isStreaming && (
                <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-white text-sm font-medium">LIVE</span>
                  </div>
                </div>
              )}
              {/* Stream Controls */}
              <div className="absolute bottom-4 right-4 flex gap-2">
                {!isStreaming && online && (
                  <button
                    onClick={startStream}
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Play size={16} />
                    Start Stream
                  </button>
                )}
                {isStreaming && (
                  <button
                    onClick={stopStream}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Square size={16} />
                    Stop Stream
                  </button>
                )}
              </div>
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
                <div className="text-5xl font-bold text-white mb-2">{passengerCount}</div>
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
                  <span className="text-white">1280x720</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">AI Model</span>
                  <span className="text-white">YOLOv8n</span>
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
            <Bar dataKey="passengers" fill="#f97316" name="Total Passengers" />
            <Bar dataKey="yolo" fill="#8b5cf6" name="YOLO Count" />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <XCircle className="text-orange-400" />
          Fare Irregularities Management
        </h2>
        
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search irregularities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Status</option>
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Types</option>
            <option value="double_scan">Double Scan</option>
            <option value="count_mismatch">Count Mismatch</option>
            <option value="fare_evasion">Fare Evasion</option>
            <option value="other">Other</option>
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
                filteredIrregularities.map((irr) => (
                  <tr key={irr.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-4">
                      <span className={`px-3 py-1 rounded-full text-xs border ${typeColors[irr.type]}`}>
                        {typeLabels[irr.type]}
                      </span>
                    </td>
                    <td className="py-4 text-white/70">{irr.description}</td>
                    <td className="py-4 text-white/70">{irr.trips?.buses?.plate_number || 'N/A'}</td>
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
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <AlertTriangle className="w-16 h-16 text-white/20 mx-auto mb-4" />
                    <p className="text-white/60">No fare irregularities found</p>
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
            <Line type="monotone" dataKey="passengers" strokeWidth={3} stroke="#f97316" name="Total Passengers" />
            <Line type="monotone" dataKey="yolo" strokeWidth={2} stroke="#8b5cf6" name="YOLO Count" />
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default PassengerAnalytics;
