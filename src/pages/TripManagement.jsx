import { useState, useEffect } from 'react';
import { Search, Trash2, Filter, Calendar, Clock, User, StopCircle, Bus, MapPin, X, Plus, Edit, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TripManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [trips, setTrips] = useState([]);
  const [conductors, setConductors] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [newTrip, setNewTrip] = useState({
    bus_id: '',
    conductor_id: '',
    current_lat: 14.5995,
    current_lng: 120.9842
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
    status: 'active'
  });

  useEffect(() => {
    fetchTrips();
    fetchConductors();
    fetchBuses();
    
    // Set up real-time subscription for trips
    const tripsSubscription = supabase
      .channel('trips-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchTrips();
      })
      .subscribe();

    // Set up real-time subscription for buses
    const busesSubscription = supabase
      .channel('buses-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' }, () => {
        fetchBuses();
      })
      .subscribe();

    return () => {
      tripsSubscription.unsubscribe();
      busesSubscription.unsubscribe();
    };
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

  const fetchBuses = async () => {
    try {
      const { data, error } = await supabase
        .from('buses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBuses(data || []);
    } catch (error) {
      console.error('Error fetching buses:', error);
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

  const handleAddTrip = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('trips')
        .insert([{
          bus_id: newTrip.bus_id,
          conductor_id: newTrip.conductor_id,
          current_lat: newTrip.current_lat,
          current_lng: newTrip.current_lng,
          status: 'in_progress',
          started_at: new Date().toISOString()
        }]);

      if (error) throw error;
      alert('Trip started successfully!');
      setShowAddModal(false);
      setNewTrip({ bus_id: '', conductor_id: '', current_lat: 14.5995, current_lng: 120.9842 });
      fetchTrips();
    } catch (error) {
      console.error('Error adding trip:', error);
      alert('Error adding trip: ' + error.message);
    }
  };

  const handleEditTrip = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('trips')
        .update({
          current_lat: newTrip.current_lat,
          current_lng: newTrip.current_lng
        })
        .eq('id', selectedTrip.id);

      if (error) throw error;
      alert('Trip location updated successfully!');
      setShowEditModal(false);
      setSelectedTrip(null);
      setNewTrip({ bus_id: '', conductor_id: '', current_lat: 14.5995, current_lng: 120.9842 });
      fetchTrips();
    } catch (error) {
      console.error('Error editing trip:', error);
      alert('Error editing trip: ' + error.message);
    }
  };

  const handleDeleteTrip = async (tripId) => {
    if (!confirm('Are you sure you want to delete this trip? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', tripId);

      if (error) throw error;
      alert('Trip deleted successfully!');
      fetchTrips();
    } catch (error) {
      console.error('Error deleting trip:', error);
      alert('Error deleting trip: ' + error.message);
    }
  };

  const openEditModal = (trip) => {
    setSelectedTrip(trip);
    setNewTrip({
      bus_id: trip.bus_id,
      conductor_id: trip.conductor_id,
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

  // Bus management handlers
  const handleAddBus = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('buses')
        .insert([newBus]);

      if (error) throw error;

      alert('Bus added successfully!');
      setShowAddBusModal(false);
      setNewBus({ plate_number: '', bus_number: '', route: '', seat_capacity: 35, status: 'active' });
      fetchBuses();
    } catch (error) {
      console.error('Error adding bus:', error);
      alert('Error adding bus: ' + error.message);
    }
  };

  const handleUpdateBus = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('buses')
        .update(newBus)
        .eq('id', editingBus.id);

      if (error) throw error;

      alert('Bus updated successfully!');
      setEditingBus(null);
      setNewBus({ plate_number: '', bus_number: '', route: '', seat_capacity: 35, status: 'active' });
      fetchBuses();
    } catch (error) {
      console.error('Error updating bus:', error);
      alert('Error updating bus: ' + error.message);
    }
  };

  const handleUpdateBusStatus = async (busId, newStatus) => {
    try {
      const { error } = await supabase
        .from('buses')
        .update({ status: newStatus })
        .eq('id', busId);

      if (error) throw error;
      fetchBuses();
    } catch (error) {
      console.error('Error updating bus status:', error);
    }
  };

  const handleDeleteBus = async (busId) => {
    if (!confirm('Are you sure you want to delete this bus?')) return;

    try {
      const { error } = await supabase
        .from('buses')
        .delete()
        .eq('id', busId);

      if (error) throw error;
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
      status: bus.status
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
        <button
          onClick={() => setShowAddBusModal(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Add Bus
        </button>
      </div>

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
                  <span>{trip.conductor_staff?.full_name || 'N/A'}</span>
                </div>
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
                <div className="flex items-center gap-2 text-white/70 text-sm mb-3">
                  <span>Capacity: {bus.seat_capacity}</span>
                </div>
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

      {/* Active Conductors */}
      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <User className="text-orange-400" />
          Active Conductors
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

      {/* Edit Trip Modal - GPS Location Update */}
      {showEditModal && selectedTrip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">Update GPS Location</h2>
            <p className="text-white/60 text-sm mb-4">Update the current GPS location for this trip</p>
            <form onSubmit={handleEditTrip} className="space-y-4">
              <div className="bg-white/5 p-3 rounded-xl mb-4">
                <p className="text-white/60 text-xs">Bus: {selectedTrip.buses?.plate_number}</p>
                <p className="text-white/60 text-xs">Conductor: {selectedTrip.conductor_staff?.full_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-sm mb-1 block">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newTrip.current_lat}
                    onChange={(e) => setNewTrip({ ...newTrip, current_lat: parseFloat(e.target.value) })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-white/60 text-sm mb-1 block">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newTrip.current_lng}
                    onChange={(e) => setNewTrip({ ...newTrip, current_lng: parseFloat(e.target.value) })}
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
                  <p className="text-white font-medium">{selectedTrip.conductor_staff?.full_name}</p>
                </div>
              </div>
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
      {(showAddBusModal || editingBus) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">
              {editingBus ? 'Edit Bus' : 'Add New Bus'}
            </h2>
            <form onSubmit={editingBus ? handleUpdateBus : handleAddBus} className="space-y-4">
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
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBusModal(false);
                    setEditingBus(null);
                    setNewBus({ plate_number: '', bus_number: '', route: '', seat_capacity: 35, status: 'active' });
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
