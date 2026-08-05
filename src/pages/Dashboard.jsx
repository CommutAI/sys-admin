import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, DollarSign, Bus, AlertTriangle, HeadphonesIcon, Map as MapIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
    { title: 'Revenue', value: '$0', change: 0, icon: DollarSign, color: 'bg-green-500' },
    { title: 'Trips', value: '0', change: 0, icon: Bus, color: 'bg-purple-500' },
    { title: 'Active Buses', value: '0', change: 0, icon: Bus, color: 'bg-orange-500' },
  ]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({
    totalRoutes: 0,
    activeDrivers: 0,
    activeConductors: 0,
    avgTripDuration: '0 min',
    seatUtilization: '0%'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
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
        .select('amount')
        .gte('created_at', today);

      const totalRevenue = transactions?.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) || 0;

      setKpis([
        { title: "Today's Passengers", value: totalPassengers.toLocaleString(), change: 8.5, icon: Users, color: 'bg-blue-500' },
        { title: 'Revenue', value: `$${totalRevenue.toLocaleString()}`, change: 12.3, icon: DollarSign, color: 'bg-green-500' },
        { title: 'Trips', value: totalTrips.toLocaleString(), change: 5.2, icon: Bus, color: 'bg-purple-500' },
        { title: 'Active Buses', value: activeBusesCount.toLocaleString(), change: -2.1, icon: Bus, color: 'bg-orange-500' },
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
        seatUtilization: '78%'
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-6">
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

        <div className="space-y-6">
          <div className="glass-card p-6">
            <h2 className="text-white text-xl font-bold mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <ShortcutCard 
                title="Live Map" 
                value="View" 
                icon={MapIcon} 
                color="bg-orange-500" 
                link="/live-map"
              />
              <ShortcutCard 
                title="Active Alerts" 
                value={alerts.length > 0 ? alerts.length : '0'} 
                icon={AlertTriangle} 
                color="bg-red-500" 
                link="/emergency-alerts"
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
                link="/customer-service"
              />
            </div>
          </div>

          <div className="glass-card p-6">
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
                <span className="text-white/70 text-sm">Seat Utilization</span>
                <span className="text-white font-bold">{stats.seatUtilization}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
