import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Clock, MapPin, Search, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';

const EmergencyAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAlerts();
    // Set up real-time subscription
    const subscription = supabase
      .channel('emergency-alerts-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('emergency_alerts')
        .select('*, trips(*, buses(*)), conductor_staff:staff_users!conductor_id(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error('Error fetching emergency alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (alertId) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ 
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (error) throw error;
      fetchAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      alert('Error acknowledging alert: ' + error.message);
    }
  };

  const handleResolve = async (alertId) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ 
          status: 'resolved',
          resolved_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (error) throw error;
      fetchAlerts();
    } catch (error) {
      console.error('Error resolving alert:', error);
      alert('Error resolving alert: ' + error.message);
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = alert.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alert.trips?.buses?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alert.conductor_staff?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || alert.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const statusColors = {
    active: 'bg-red-500/20 text-red-400 border-red-500/50',
    acknowledged: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    resolved: 'bg-green-500/20 text-green-400 border-green-500/50',
  };

  const statusIcons = {
    active: AlertTriangle,
    acknowledged: Clock,
    resolved: CheckCircle,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Emergency Alerts</h1>
        <p className="text-white/60">Loading alerts...</p>
      </div>
    );
  }

  const activeCount = alerts.filter(a => a.status === 'active').length;
  const acknowledgedCount = alerts.filter(a => a.status === 'acknowledged').length;
  const resolvedCount = alerts.filter(a => a.status === 'resolved').length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Emergency Alerts</h1>
          <p className="text-white/60">Monitor and manage emergency incidents</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 border border-red-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Active Alerts</p>
              <p className="text-white text-2xl font-bold">{activeCount}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 border border-yellow-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Acknowledged</p>
              <p className="text-white text-2xl font-bold">{acknowledgedCount}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 border border-green-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Resolved</p>
              <p className="text-white text-2xl font-bold">{resolvedCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search alerts..."
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
            <option value="active">Active</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <div className="space-y-4">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => {
              const StatusIcon = statusIcons[alert.status];
              return (
                <div key={alert.id} className={`p-4 rounded-xl border ${statusColors[alert.status]}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10">
                        <StatusIcon size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-bold">Emergency Alert</h3>
                          <span className={`px-2 py-1 rounded-full text-xs border ${statusColors[alert.status]}`}>
                            {alert.status}
                          </span>
                        </div>
                        <p className="text-white/70 mb-2">{alert.notes || 'No description provided'}</p>
                        <div className="flex items-center gap-4 text-white/60 text-sm">
                          <div className="flex items-center gap-2">
                            <MapPin size={14} />
                            <span>{alert.trips?.buses?.plate_number || 'Unknown Bus'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock size={14} />
                            <span>{new Date(alert.created_at).toLocaleString()}</span>
                          </div>
                          {alert.conductor_staff && (
                            <span>Conductor: {alert.conductor_staff.full_name}</span>
                          )}
                        </div>
                        {alert.lat && alert.lng && (
                          <div className="mt-2 text-white/60 text-sm">
                            GPS: {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {alert.status === 'active' && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors"
                        >
                          Acknowledge
                        </button>
                      )}
                      {alert.status === 'acknowledged' && (
                        <button
                          onClick={() => handleResolve(alert.id)}
                          className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
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
            <div className="text-center py-12">
              <AlertTriangle className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <p className="text-white/60">No emergency alerts found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmergencyAlerts;
