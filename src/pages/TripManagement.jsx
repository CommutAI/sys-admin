import { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, Filter, Calendar, Clock, User, StopCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TripManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [trips, setTrips] = useState([]);
  const [conductors, setConductors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState(null);

  useEffect(() => {
    fetchTrips();
    fetchConductors();
  }, []);

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('trips')
        .select('*, buses(*), conductor_staff:staff_users!conductor_id(*)')
        .order('started_at', { ascending: false });

      if (error) throw error;
      setTrips(data || []);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConductors = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('role', 'conductor')
        .eq('is_active', true);

      if (error) throw error;
      setConductors(data || []);
    } catch (error) {
      console.error('Error fetching conductors:', error);
    }
  };

  const handleEndTrip = async (tripId) => {
    if (!confirm('Are you sure you want to end this trip?')) return;

    try {
      const { error } = await supabase
        .from('trips')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', tripId);

      if (error) throw error;
      fetchTrips();
    } catch (error) {
      console.error('Error ending trip:', error);
      alert('Error ending trip: ' + error.message);
    }
  };

  const handleCancelTrip = async (tripId) => {
    if (!confirm('Are you sure you want to cancel this trip?')) return;

    try {
      const { error } = await supabase
        .from('trips')
        .update({ status: 'cancelled', ended_at: new Date().toISOString() })
        .eq('id', tripId);

      if (error) throw error;
      fetchTrips();
    } catch (error) {
      console.error('Error cancelling trip:', error);
      alert('Error cancelling trip: ' + error.message);
    }
  };

  const fetchTripPassengers = async (tripId) => {
    try {
      const { data, error } = await supabase
        .from('passenger_counts')
        .select('count')
        .eq('trip_id', tripId)
        .order('recorded_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      return data?.[0]?.count || 0;
    } catch (error) {
      console.error('Error fetching passenger count:', error);
      return 0;
    }
  };

  const filteredTrips = trips.filter(trip => {
    const matchesSearch = trip.buses?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         trip.buses?.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         trip.conductor_staff?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || trip.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const statusColors = {
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    'in_progress': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Trip Management</h1>
        <p className="text-white/60">Loading trips...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Trip Management</h1>
          <p className="text-white/60">Manage trips and conductors</p>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search trips..."
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
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-white/60 border-b border-white/10">
                <th className="pb-3 font-medium">Bus Plate</th>
                <th className="pb-3 font-medium">Route</th>
                <th className="pb-3 font-medium">Conductor</th>
                <th className="pb-3 font-medium">Start Time</th>
                <th className="pb-3 font-medium">End Time</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrips.map((trip) => (
                <tr key={trip.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-4 text-white">{trip.buses?.plate_number || 'N/A'}</td>
                  <td className="py-4 text-white/70">{trip.buses?.route || 'N/A'}</td>
                  <td className="py-4 text-white/70">{trip.conductor_staff?.full_name || 'N/A'}</td>
                  <td className="py-4 text-white/70">
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      {new Date(trip.started_at).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="py-4 text-white/70">
                    {trip.ended_at ? new Date(trip.ended_at).toLocaleTimeString() : '-'}
                  </td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-xs border ${statusColors[trip.status]}`}>
                      {trip.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      {trip.status === 'in_progress' && (
                        <>
                          <button
                            onClick={() => handleEndTrip(trip.id)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title="End Trip"
                          >
                            <StopCircle size={16} className="text-green-400" />
                          </button>
                          <button
                            onClick={() => handleCancelTrip(trip.id)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title="Cancel Trip"
                          >
                            <Trash2 size={16} className="text-red-400" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <User className="text-orange-400" />
          Active Conductors
        </h2>
        <div className="space-y-3">
          {conductors.map((conductor) => (
            <div key={conductor.id} className="bg-white/5 p-4 rounded-xl flex justify-between items-center">
              <div>
                <p className="text-white font-medium">{conductor.full_name}</p>
                <p className="text-white/60 text-sm">{conductor.email}</p>
              </div>
              <div className="text-right">
                <span className={`px-2 py-1 rounded text-xs ${conductor.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {conductor.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TripManagement;
