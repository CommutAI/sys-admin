import { useState, useEffect } from 'react';
import { Search, Trash2, Filter, Calendar, Clock, User, StopCircle, Bus, MapPin, X, Plus, Edit, Wrench, BarChart3, TrendingUp, Users, ArrowLeft } from 'lucide-react';
import { supabaseAdmin } from '../lib/supabase';
import { clearPiTrip } from '../services/raspberryPiApi';
import AuditService from '../services/auditService';

const TripManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [trips, setTrips] = useState([]);
  const [buses, setBuses] = useState([]);
  const [conductors, setConductors] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

  // Trip history state
  const [showHistory, setShowHistory] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState('daily'); // daily, weekly, monthly, yearly, custom
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStats, setHistoryStats] = useState({
    totalTrips: 0,
    totalPassengers: 0,
    avgPassengers: 0,
    totalDistance: 0
  });
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  // Bus management state
  const [busSearchTerm, setBusSearchTerm] = useState('');
  const [busStatusFilter, setBusStatusFilter] = useState('all');
  const [showAddBusModal, setShowAddBusModal] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [newBus, setNewBus] = useState({
    plate_number: '',
    bus_number: '',
    route: '',
    seat_capacity: 35,
    status: 'active',
    conductor_id: '',
    driver_id: ''
  });

  useEffect(() => {
    fetchTrips();
    fetchBuses();
    fetchConductors();
    fetchDrivers();
    
    // Set up real-time subscription for trips
    const tripsSubscription = supabaseAdmin
      .channel('trips-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchTrips();
      })
      .subscribe();

    // Set up real-time subscription for buses
    const busesSubscription = supabaseAdmin
      .channel('buses-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' }, () => {
        fetchBuses();
      })
      .subscribe();

    // Set up real-time subscription for staff_users
    const staffSubscription = supabaseAdmin
      .channel('staff-users-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_users' }, () => {
        fetchConductors();
        fetchDrivers();
      })
      .subscribe();

    // Log page view to audit logs
    AuditService.logPageView('Trip Management');

    return () => {
      tripsSubscription.unsubscribe();
      busesSubscription.unsubscribe();
      staffSubscription.unsubscribe();
    };
  }, []);

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseAdmin
        .from('trips')
        .select('*, buses(*), conductor:staff_users!conductor_id(*), driver:staff_users!driver_id(*)')
        .order('started_at', { ascending: false });

      if (error) throw error;
      setTrips(data || []);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBuses = async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from('buses')
        .select('*, conductor:staff_users!conductor_id(*), driver:staff_users!driver_id(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBuses(data || []);
    } catch (error) {
      console.error('Error fetching buses:', error);
    }
  };

  const fetchConductors = async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from('staff_users')
        .select('*')
        .eq('role', 'conductor')
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (error) throw error;
      setConductors(data || []);
    } catch (error) {
      console.error('Error fetching conductors:', error);
    }
  };

  const fetchDrivers = async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from('staff_users')
        .select('*')
        .eq('role', 'driver')
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (error) throw error;
      setDrivers(data || []);
    } catch (error) {
      console.error('Error fetching drivers:', error);
    }
  };

  const handleEndTrip = async (tripId) => {
    if (!confirm('Are you sure you want to end this trip?')) return;

    try {
      const trip = trips.find(t => t.id === tripId);
      const busInfo = trip?.buses?.plate_number || 'Unknown bus';

      const { error } = await supabaseAdmin
        .from('trips')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', tripId);

      if (error) throw error;

      // Log trip end to audit logs
      await AuditService.logTripEnded(tripId, busInfo);

      // Tell the Pi the trip is over so it stops linking counts to this trip
      await clearPiTrip();

      fetchTrips();
    } catch (error) {
      console.error('Error ending trip:', error);
      alert('Error ending trip: ' + error.message);
    }
  };

  const handleCancelTrip = async (tripId) => {
    if (!confirm('Are you sure you want to cancel this trip?')) return;

    try {
      const trip = trips.find(t => t.id === tripId);
      const busInfo = trip?.buses?.plate_number || 'Unknown bus';

      const { error } = await supabaseAdmin
        .from('trips')
        .update({ status: 'cancelled', ended_at: new Date().toISOString() })
        .eq('id', tripId);

      if (error) throw error;

      // Log trip cancellation to audit logs
      await AuditService.logTripCancelled(tripId, busInfo);

      // Tell the Pi the trip is cancelled
      await clearPiTrip();

      fetchTrips();
    } catch (error) {
      console.error('Error cancelling trip:', error);
      alert('Error cancelling trip: ' + error.message);
    }
  };



  const handleEditTrip = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabaseAdmin
        .from('trips')
        .update({
          current_lat: selectedTrip.current_lat,
          current_lng: selectedTrip.current_lng
        })
        .eq('id', selectedTrip.id);

      if (error) throw error;

      // Log trip update to audit logs
      await AuditService.logTripUpdated(selectedTrip.id, `Updated GPS location to ${selectedTrip.current_lat}, ${selectedTrip.current_lng}`);

      alert('Trip location updated successfully!');
      setShowEditModal(false);
      setSelectedTrip(null);
      fetchTrips();
    } catch (error) {
      console.error('Error editing trip:', error);
      alert('Error editing trip: ' + error.message);
    }
  };

  const handleDeleteTrip = async (tripId) => {
    if (!confirm('Are you sure you want to delete this trip? This action cannot be undone.')) return;

    try {
      const trip = trips.find(t => t.id === tripId);
      const busInfo = trip?.buses?.plate_number || 'Unknown bus';

      const { error } = await supabaseAdmin
        .from('trips')
        .delete()
        .eq('id', tripId);

      if (error) throw error;

      // Log trip deletion to audit logs
      await AuditService.logTripDeleted(tripId, busInfo);

      alert('Trip deleted successfully!');
      fetchTrips();
    } catch (error) {
      console.error('Error deleting trip:', error);
      alert('Error deleting trip: ' + error.message);
    }
  };

  const openEditModal = (trip) => {
    setSelectedTrip({
      ...trip,
      current_lat: trip.current_lat || 14.5995,
      current_lng: trip.current_lng || 120.9842
    });
    setShowEditModal(true);
  };

  const openViewModal = (trip) => {
    setSelectedTrip(trip);
    setShowViewModal(true);
  };

  const fetchTripPassengers = async (tripId) => {
    try {
      const { data, error } = await supabaseAdmin
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

  // Trip history functions
  const fetchTripHistory = async (period) => {
    try {
      setHistoryLoading(true);
      let startDate, endDate;
      const now = new Date();

      switch (period) {
        case 'daily':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          endDate = new Date();
          break;
        case 'weekly':
          startDate = new Date(now.setDate(now.getDate() - 7));
          endDate = new Date();
          break;
        case 'monthly':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          endDate = new Date();
          break;
        case 'yearly':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          endDate = new Date();
          break;
        case 'custom':
          if (customDateRange.startDate && customDateRange.endDate) {
            startDate = new Date(customDateRange.startDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(customDateRange.endDate);
            endDate.setHours(23, 59, 59, 999);
          } else {
            startDate = new Date(now.setHours(0, 0, 0, 0));
            endDate = new Date();
          }
          break;
        default:
          startDate = new Date(now.setHours(0, 0, 0, 0));
          endDate = new Date();
      }

      let query = supabaseAdmin
        .from('trips')
        .select('*, buses(*), conductor:staff_users!conductor_id(*), driver:staff_users!driver_id(*), passenger_counts(count)')
        .gte('started_at', startDate.toISOString())
        .order('started_at', { ascending: false });

      if (endDate) {
        query = query.lte('started_at', endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      setHistoryData(data || []);

      // Calculate statistics
      const stats = {
        totalTrips: data?.length || 0,
        totalPassengers: 0,
        avgPassengers: 0,
        totalDistance: 0
      };

      if (data && data.length > 0) {
        const allPassengerCounts = data.flatMap(trip => 
          trip.passenger_counts?.map(pc => pc.count) || []
        );
        stats.totalPassengers = allPassengerCounts.reduce((sum, count) => sum + count, 0);
        stats.avgPassengers = allPassengerCounts.length > 0 
          ? Math.round(stats.totalPassengers / allPassengerCounts.length)
          : 0;
      }

      setHistoryStats(stats);
    } catch (error) {
      console.error('Error fetching trip history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHistoryPeriodChange = (period) => {
    setHistoryPeriod(period);
    fetchTripHistory(period);
  };

  const toggleHistoryView = () => {
    setShowHistory(!showHistory);
    if (!showHistory) {
      fetchTripHistory(historyPeriod);
    }
  };

  const filteredTrips = trips.filter(trip => {
    const matchesSearch = trip.buses?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         trip.buses?.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         trip.conductor?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         trip.driver?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || trip.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Bus management handlers
  const handleAddBus = async (e) => {
    e.preventDefault();
    try {
      const busData = {
        plate_number: newBus.plate_number,
        bus_number: newBus.bus_number ? parseInt(newBus.bus_number) : null,
        route: newBus.route,
        seat_capacity: newBus.seat_capacity,
        status: newBus.status
      };

      // Only include conductor_id if one is selected
      if (newBus.conductor_id) {
        busData.conductor_id = newBus.conductor_id;
      }

      // Only include driver_id if one is selected
      if (newBus.driver_id) {
        busData.driver_id = newBus.driver_id;
      }

      const { error } = await supabaseAdmin
        .from('buses')
        .insert([busData]);

      if (error) throw error;

      // Log bus creation to audit logs
      await AuditService.logBusCreated(newBus.bus_number || 'N/A', newBus.plate_number);

      alert('Bus added successfully!');
      setShowAddBusModal(false);
      setNewBus({ plate_number: '', bus_number: '', route: '', seat_capacity: 35, status: 'active', conductor_id: '', driver_id: '' });
      fetchBuses();
    } catch (error) {
      console.error('Error adding bus:', error);
      alert('Error adding bus: ' + error.message);
    }
  };

  const handleUpdateBus = async (e) => {
    e.preventDefault();
    try {
      const busData = {
        plate_number: newBus.plate_number,
        bus_number: newBus.bus_number ? parseInt(newBus.bus_number) : null,
        route: newBus.route,
        seat_capacity: newBus.seat_capacity,
        status: newBus.status
      };

      // Only include conductor_id if one is selected
      if (newBus.conductor_id) {
        busData.conductor_id = newBus.conductor_id;
      }

      // Only include driver_id if one is selected
      if (newBus.driver_id) {
        busData.driver_id = newBus.driver_id;
      }

      const { error } = await supabaseAdmin
        .from('buses')
        .update(busData)
        .eq('id', editingBus.id);

      if (error) throw error;

      // Log bus update to audit logs
      await AuditService.logBusUpdated(editingBus.id, `Updated bus #${newBus.bus_number} (${newBus.plate_number})`);

      alert('Bus updated successfully!');
      setEditingBus(null);
      setNewBus({ plate_number: '', bus_number: '', route: '', seat_capacity: 35, status: 'active', conductor_id: '', driver_id: '' });
      fetchBuses();
    } catch (error) {
      console.error('Error updating bus:', error);
      alert('Error updating bus: ' + error.message);
    }
  };

  const handleUpdateBusStatus = async (busId, newStatus) => {
    try {
      const bus = buses.find(b => b.id === busId);
      const oldStatus = bus?.status || 'unknown';

      const { error } = await supabaseAdmin
        .from('buses')
        .update({ status: newStatus })
        .eq('id', busId);

      if (error) throw error;

      // Log bus status change to audit logs
      await AuditService.logBusStatusChanged(busId, oldStatus, newStatus);

      fetchBuses();
    } catch (error) {
      console.error('Error updating bus status:', error);
    }
  };

  const handleDeleteBus = async (busId) => {
    if (!confirm('Are you sure you want to delete this bus?')) return;

    try {
      const bus = buses.find(b => b.id === busId);
      const plateNumber = bus?.plate_number || 'Unknown';

      const { error } = await supabaseAdmin
        .from('buses')
        .delete()
        .eq('id', busId);

      if (error) throw error;

      // Log bus deletion to audit logs
      await AuditService.logBusDeleted(busId, plateNumber);

      fetchBuses();
    } catch (error) {
      console.error('Error deleting bus:', error);
      alert('Error deleting bus: ' + error.message);
    }
  };

  const openEditBusModal = (bus) => {
    setEditingBus(bus);
    setNewBus({
      plate_number: bus.plate_number,
      bus_number: bus.bus_number || '',
      route: bus.route,
      seat_capacity: bus.seat_capacity,
      status: bus.status,
      conductor_id: bus.conductor_id || '',
      driver_id: bus.driver_id || ''
    });
  };

  const filteredBuses = buses.filter(bus => {
    const matchesSearch = bus.plate_number?.toLowerCase().includes(busSearchTerm.toLowerCase()) ||
                         bus.route?.toLowerCase().includes(busSearchTerm.toLowerCase());
    const matchesStatus = busStatusFilter === 'all' || bus.status === busStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const busStatusColors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/50',
    maintenance: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    inactive: 'bg-red-500/20 text-red-400 border-red-500/50',
  };

  const statusColors = {
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    'in_progress': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Trip & Bus Management</h1>
        <p className="text-white/60">Loading data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Trip & Bus Management</h1>
          <p className="text-white/60">Monitor trips and manage bus fleet</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={toggleHistoryView}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
              showHistory 
                ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {showHistory ? <ArrowLeft size={20} /> : <BarChart3 size={20} />}
            {showHistory ? 'Back to Trips' : 'Trip History'}
          </button>
          <button
            onClick={() => setShowAddBusModal(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            Add Bus
          </button>
        </div>
      </div>

      {/* Trip History View */}
      {showHistory && (
        <div className="space-y-6">
          {/* Period Selector */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-xl font-bold flex items-center gap-2">
                <Calendar className="text-orange-400" />
                Trip History
              </h2>
              <div className="flex gap-2">
                {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((period) => (
                  <button
                    key={period}
                    onClick={() => handleHistoryPeriodChange(period)}
                    className={`px-4 py-2 rounded-lg capitalize transition-colors ${
                      historyPeriod === period
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Range Picker */}
            {historyPeriod === 'custom' && (
              <div className="mt-6 mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-white/60 text-sm mb-2 block">Start Date</label>
                  <input
                    type="date"
                    value={customDateRange.startDate}
                    onChange={(e) => setCustomDateRange({...customDateRange, startDate: e.target.value})}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-white/60 text-sm mb-2 block">End Date</label>
                  <input
                    type="date"
                    value={customDateRange.endDate}
                    onChange={(e) => setCustomDateRange({...customDateRange, endDate: e.target.value})}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => fetchTripHistory('custom')}
                    className="w-full px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            )}

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Bus className="text-orange-400" size={20} />
                  <span className="text-white/60 text-sm">Total Trips</span>
                </div>
                <p className="text-white text-2xl font-bold">{historyStats.totalTrips}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="text-green-400" size={20} />
                  <span className="text-white/60 text-sm">Total Passengers</span>
                </div>
                <p className="text-white text-2xl font-bold">{historyStats.totalPassengers}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="text-blue-400" size={20} />
                  <span className="text-white/60 text-sm">Avg Passengers</span>
                </div>
                <p className="text-white text-2xl font-bold">{historyStats.avgPassengers}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="text-purple-400" size={20} />
                  <span className="text-white/60 text-sm">Period</span>
                </div>
                <p className="text-white text-2xl font-bold capitalize">{historyPeriod}</p>
              </div>
            </div>

            {/* History Table */}
            {historyLoading ? (
              <div className="text-center py-8">
                <p className="text-white/60">Loading trip history...</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-white/60">No trips found for this period</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {historyData.map((trip) => (
                  <div key={trip.id} className="bg-white/5 p-4 rounded-xl">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-white font-medium">{trip.buses?.plate_number || 'N/A'}</p>
                        <p className="text-white/60 text-sm">{trip.buses?.route || 'N/A'}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs border ${statusColors[trip.status]}`}>
                        {trip.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
                      <User size={14} />
                      <span>Conductor: {trip.conductor?.full_name || 'N/A'}</span>
                    </div>
                    {trip.driver && (
                      <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
                        <User size={14} />
                        <span>Driver: {trip.driver.full_name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-white/60 text-sm mb-3">
                      <div className="flex items-center gap-1">
                        <Clock size={14} />
                        <span>{new Date(trip.started_at).toLocaleString()}</span>
                      </div>
                      {trip.passenger_counts && trip.passenger_counts.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Users size={14} />
                          <span>{trip.passenger_counts[0].count} passengers</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => openViewModal(trip)}
                      className="w-full px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
                    >
                      View Details
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!showHistory && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trips Section */}
        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
            <Clock className="text-orange-400" />
            Active Trips
          </h2>
          <div className="flex items-center gap-4 mb-4">
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

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filteredTrips.slice(0, 10).map((trip) => (
              <div key={trip.id} className="bg-white/5 p-4 rounded-xl">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-white font-medium">{trip.buses?.plate_number || 'N/A'}</p>
                    <p className="text-white/60 text-sm">{trip.buses?.route || 'N/A'}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs border ${statusColors[trip.status]}`}>
                    {trip.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
                  <User size={14} />
                  <span>Conductor: {trip.conductor?.full_name || 'N/A'}</span>
                </div>
                {trip.driver && (
                  <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
                    <User size={14} />
                    <span>Driver: {trip.driver.full_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-white/60 text-sm mb-3">
                  <Clock size={14} />
                  <span>{new Date(trip.started_at).toLocaleString()}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openViewModal(trip)}
                    className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => openEditModal(trip)}
                    className="flex-1 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors"
                  >
                    Edit Location
                  </button>
                  {trip.status === 'in_progress' && (
                    <button
                      onClick={() => handleEndTrip(trip.id)}
                      className="flex-1 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm transition-colors"
                    >
                      End Trip
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Buses Section */}
        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
            <Bus className="text-orange-400" />
            Bus Fleet
          </h2>
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
              <input
                type="text"
                placeholder="Search buses..."
                value={busSearchTerm}
                onChange={(e) => setBusSearchTerm(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
              />
            </div>
            <select
              value={busStatusFilter}
              onChange={(e) => setBusStatusFilter(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filteredBuses.slice(0, 10).map((bus) => (
              <div key={bus.id} className="bg-white/5 p-4 rounded-xl">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                      <Bus size={20} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white font-medium">#{bus.bus_number || 'N/A'} - {bus.plate_number}</p>
                      <p className="text-white/60 text-sm">{bus.route}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs border ${busStatusColors[bus.status]}`}>
                    {bus.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
                  <span>Capacity: {bus.seat_capacity}</span>
                </div>
                {bus.conductor && (
                  <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
                    <User size={14} />
                    <span>Conductor: {bus.conductor.full_name}</span>
                  </div>
                )}
                {bus.driver && (
                  <div className="flex items-center gap-2 text-white/70 text-sm mb-3">
                    <User size={14} />
                    <span>Driver: {bus.driver.full_name}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditBusModal(bus)}
                    className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
                  >
                    Edit
                  </button>
                  {bus.status === 'active' && (
                    <button
                      onClick={() => handleUpdateBusStatus(bus.id, 'maintenance')}
                      className="flex-1 px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-sm transition-colors"
                    >
                      Maintenance
                    </button>
                  )}
                  {bus.status === 'maintenance' && (
                    <button
                      onClick={() => handleUpdateBusStatus(bus.id, 'active')}
                      className="flex-1 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm transition-colors"
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Edit Trip Modal - GPS Location Update */}
      {!showHistory && showEditModal && selectedTrip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">Update GPS Location</h2>
            <p className="text-white/60 text-sm mb-4">Update the current GPS location for this trip</p>
            <form onSubmit={handleEditTrip} className="space-y-4">
              <div className="bg-white/5 p-3 rounded-xl mb-4">
                <p className="text-white/60 text-xs">Bus: {selectedTrip.buses?.plate_number}</p>
                <p className="text-white/60 text-xs">Conductor: {selectedTrip.conductor?.full_name}</p>
                {selectedTrip.driver && (
                  <p className="text-white/60 text-xs">Driver: {selectedTrip.driver.full_name}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-sm mb-1 block">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={selectedTrip.current_lat || 14.5995}
                    onChange={(e) => setSelectedTrip({ ...selectedTrip, current_lat: parseFloat(e.target.value) })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-white/60 text-sm mb-1 block">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={selectedTrip.current_lng || 120.9842}
                    onChange={(e) => setSelectedTrip({ ...selectedTrip, current_lng: parseFloat(e.target.value) })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedTrip(null);
                  }}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  Update Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Trip Modal */}
      {showViewModal && selectedTrip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-xl font-bold">Trip Details</h2>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedTrip(null);
                }}
                className="text-white/60 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <Bus className="text-orange-400" />
                <div>
                  <p className="text-white/60 text-sm">Bus</p>
                  <p className="text-white font-medium">{selectedTrip.buses?.plate_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <User className="text-orange-400" />
                <div>
                  <p className="text-white/60 text-sm">Conductor</p>
                  <p className="text-white font-medium">{selectedTrip.conductor?.full_name || 'N/A'}</p>
                </div>
              </div>
              {selectedTrip.driver && (
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                  <User className="text-orange-400" />
                  <div>
                    <p className="text-white/60 text-sm">Driver</p>
                    <p className="text-white font-medium">{selectedTrip.driver.full_name}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <Clock className="text-orange-400" />
                <div>
                  <p className="text-white/60 text-sm">Start Time</p>
                  <p className="text-white font-medium">{new Date(selectedTrip.started_at).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <Clock className="text-orange-400" />
                <div>
                  <p className="text-white/60 text-sm">End Time</p>
                  <p className="text-white font-medium">{selectedTrip.ended_at ? new Date(selectedTrip.ended_at).toLocaleString() : 'Not ended'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <MapPin className="text-orange-400" />
                <div>
                  <p className="text-white/60 text-sm">GPS Location</p>
                  <p className="text-white font-medium">
                    {selectedTrip.current_lat && selectedTrip.current_lng
                      ? `${selectedTrip.current_lat.toFixed(4)}, ${selectedTrip.current_lng.toFixed(4)}`
                      : 'No GPS data'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <span className="text-orange-400 text-sm">S</span>
                </div>
                <div>
                  <p className="text-white/60 text-sm">Status</p>
                  <p className="text-white font-medium">{selectedTrip.status.replace('_', ' ')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Bus Modal */}
      {!showHistory && (showAddBusModal || editingBus) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-2xl">
            <h2 className="text-white text-xl font-bold mb-4">
              {editingBus ? 'Edit Bus' : 'Add New Bus'}
            </h2>
            <form onSubmit={editingBus ? handleUpdateBus : handleAddBus} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Pane - Basic Bus Info */}
                <div className="space-y-4">
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">Bus Number</label>
                    <input
                      type="number"
                      value={newBus.bus_number}
                      onChange={(e) => setNewBus({ ...newBus, bus_number: parseInt(e.target.value) || '' })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">Plate Number</label>
                    <input
                      type="text"
                      required
                      value={newBus.plate_number}
                      onChange={(e) => setNewBus({ ...newBus, plate_number: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">Route</label>
                    <input
                      type="text"
                      required
                      value={newBus.route}
                      onChange={(e) => setNewBus({ ...newBus, route: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">Seat Capacity</label>
                    <input
                      type="number"
                      required
                      value={newBus.seat_capacity}
                      onChange={(e) => setNewBus({ ...newBus, seat_capacity: parseInt(e.target.value) })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">Status</label>
                    <select
                      value={newBus.status}
                      onChange={(e) => setNewBus({ ...newBus, status: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    >
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Right Pane - Staff Assignment */}
                <div className="space-y-4">
                  <div className="bg-white/5 p-4 rounded-xl">
                    <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                      <User size={16} className="text-blue-400" />
                      Staff Assignment
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-white/60 text-sm mb-1 block">Conductor</label>
                        <select
                          value={newBus.conductor_id}
                          onChange={(e) => setNewBus({ ...newBus, conductor_id: e.target.value })}
                          className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                        >
                          <option value="">No Conductor Assigned</option>
                          {conductors.map(conductor => (
                            <option key={conductor.id} value={conductor.id}>
                              {conductor.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-white/60 text-sm mb-1 block">Driver</label>
                        <select
                          value={newBus.driver_id}
                          onChange={(e) => setNewBus({ ...newBus, driver_id: e.target.value })}
                          className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                        >
                          <option value="">No Driver Assigned</option>
                          {drivers.map(driver => (
                            <option key={driver.id} value={driver.id}>
                              {driver.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBusModal(false);
                    setEditingBus(null);
                    setNewBus({ plate_number: '', bus_number: '', route: '', seat_capacity: 35, status: 'active', conductor_id: '', driver_id: '' });
                  }}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  {editingBus ? 'Update' : 'Add'} Bus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripManagement;
