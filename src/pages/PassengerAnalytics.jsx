import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, Armchair, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PassengerAnalytics = () => {
  const [timeRange, setTimeRange] = useState('daily');
  const [passengerCounts, setPassengerCounts] = useState([]);
  const [boardedPassengers, setBoardedPassengers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPassengers: 0,
    yoloCount: 0,
    qrCount: 0,
    seatUtilization: 0
  });

  useEffect(() => {
    fetchAnalyticsData();
  }, [timeRange]);

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

      const { data: counts } = await supabase
        .from('passenger_counts')
        .select('*, trips(*, buses(*))')
        .gte('recorded_at', startDate.toISOString())
        .order('recorded_at', { ascending: true });

      // Fetch boarded passengers
      const { data: boarded } = await supabase
        .from('boarded_passengers')
        .select('*, trips(*, buses(*))')
        .gte('boarded_at', startDate.toISOString())
        .order('boarded_at', { ascending: true });

      setPassengerCounts(counts || []);
      setBoardedPassengers(boarded || []);

      // Calculate statistics
      const totalPassengers = (counts || []).reduce((sum, pc) => sum + (pc.count || 0), 0);
      const yoloCount = (counts || []).reduce((sum, pc) => sum + (pc.ai_count || 0), 0);
      const qrCount = (boarded || []).length;

      // Calculate seat utilization (would need bus capacity data)
      const seatUtilization = totalPassengers > 0 ? Math.round((qrCount / totalPassengers) * 100) : 0;

      setStats({
        totalPassengers,
        yoloCount,
        qrCount,
        seatUtilization
      });

    } catch (error) {
      console.error('Error fetching analytics data:', error);
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

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Passenger Analytics</h1>
        <p className="text-white/60">Loading analytics data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Passenger Analytics</h1>
          <p className="text-white/60">Detailed passenger count and utilization analytics</p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <TrendingUp className="w-6 h-6 text-purple-400" />
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
            <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <Armchair className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Boarded Passengers</p>
              <p className="text-white text-2xl font-bold">{stats.qrCount.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-green-400 text-sm">QR scans</p>
        </div>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4">Passenger Count Comparison</h2>
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
        </div>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4">Passenger Trend</h2>
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
      </div>
    </div>
  );
};

export default PassengerAnalytics;
