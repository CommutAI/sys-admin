import { useState, useEffect } from 'react';
import { Bus, Plus, Search, Edit, Wrench, X, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

const BusManagement = () => {
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [showConductorModal, setShowConductorModal] = useState(false);
  const [selectedBusForConductor, setSelectedBusForConductor] = useState(null);
  const [conductors, setConductors] = useState([]);
  const [selectedConductor, setSelectedConductor] = useState('');
  const [newBus, setNewBus] = useState({
    plate_number: '',
    bus_number: '',
    route: '',
    seat_capacity: 35,
    status: 'active'
  });

  useEffect(() => {
    fetchBuses();
    fetchConductors();
  }, []);

  const fetchBuses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('buses')
        .select('*, conductor:staff_users(id, full_name, email)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBuses(data || []);
    } catch (error) {
      console.error('Error fetching buses:', error);
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

  const handleAddBus = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('buses')
        .insert([newBus]);

      if (error) throw error;

      alert('Bus added successfully!');
      setShowAddModal(false);
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

  const handleUpdateStatus = async (busId, newStatus) => {
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

  const openEditModal = (bus) => {
    setEditingBus(bus);
    setNewBus({
      plate_number: bus.plate_number,
      bus_number: bus.bus_number || '',
      route: bus.route,
      seat_capacity: bus.seat_capacity,
      status: bus.status
    });
    setShowAddModal(true);
  };

  const openConductorModal = (bus) => {
    setSelectedBusForConductor(bus);
    setSelectedConductor(bus.conductor?.id || '');
    setShowConductorModal(true);
  };

  const handleAssignConductor = async () => {
    try {
      // First, remove conductor assignment from any other bus
      if (selectedConductor) {
        await supabase
          .from('staff_users')
          .update({ bus_id: null })
          .eq('id', selectedConductor);
      }

      // Assign the conductor to the selected bus
      const { error } = await supabase
        .from('staff_users')
        .update({ bus_id: selectedBusForConductor.id })
        .eq('id', selectedConductor);

      if (error) throw error;

      alert('Conductor assigned successfully!');
      setShowConductorModal(false);
      setSelectedBusForConductor(null);
      setSelectedConductor('');
      fetchBuses();
    } catch (error) {
      console.error('Error assigning conductor:', error);
      alert('Error assigning conductor: ' + error.message);
    }
  };

  const handleRemoveConductor = async (busId) => {
    if (!confirm('Are you sure you want to remove the conductor from this bus?')) return;

    try {
      const { error } = await supabase
        .from('staff_users')
        .update({ bus_id: null })
        .eq('bus_id', busId);

      if (error) throw error;
      fetchBuses();
    } catch (error) {
      console.error('Error removing conductor:', error);
      alert('Error removing conductor: ' + error.message);
    }
  };

  const filteredBuses = buses.filter(bus => {
    const matchesSearch = bus.plate_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         bus.route?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || bus.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/50',
    maintenance: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    inactive: 'bg-red-500/20 text-red-400 border-red-500/50',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Bus Management</h1>
        <p className="text-white/60">Loading buses...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Bus Management</h1>
          <p className="text-white/60">Manage bus fleet and routes</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Add Bus
        </button>
      </div>

      <div className="glass-card p-6">
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search buses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-white/60 py-3 px-4">Bus Number</th>
                <th className="text-left text-white/60 py-3 px-4">Plate Number</th>
                <th className="text-left text-white/60 py-3 px-4">Route</th>
                <th className="text-left text-white/60 py-3 px-4">Seat Capacity</th>
                <th className="text-left text-white/60 py-3 px-4">Conductor</th>
                <th className="text-left text-white/60 py-3 px-4">Status</th>
                <th className="text-left text-white/60 py-3 px-4">Created</th>
                <th className="text-left text-white/60 py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBuses.map((bus) => (
                <tr key={bus.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 px-4 text-white font-medium">{bus.bus_number || 'N/A'}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                        <Bus size={20} className="text-white" />
                      </div>
                      <span className="text-white font-medium">{bus.plate_number}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-white/70">{bus.route}</td>
                  <td className="py-3 px-4 text-white/70">{bus.seat_capacity}</td>
                  <td className="py-3 px-4">
                    {bus.conductor ? (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                          <User size={14} className="text-white" />
                        </div>
                        <div>
                          <span className="text-white text-sm">{bus.conductor.full_name}</span>
                          <span className="text-white/50 text-xs block">{bus.conductor.email}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-white/40 text-sm">No conductor assigned</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-3 py-1 rounded-full text-xs border ${statusColors[bus.status]}`}>
                      {bus.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-white/60 text-sm">
                    {new Date(bus.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openConductorModal(bus)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="Assign Conductor"
                      >
                        <User size={16} className="text-blue-400" />
                      </button>
                      {bus.conductor && (
                        <button
                          onClick={() => handleRemoveConductor(bus.id)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          title="Remove Conductor"
                        >
                          <X size={16} className="text-red-400" />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(bus)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <Edit size={16} className="text-white/70" />
                      </button>
                      {bus.status === 'active' && (
                        <button
                          onClick={() => handleUpdateStatus(bus.id, 'maintenance')}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          title="Send to maintenance"
                        >
                          <Wrench size={16} className="text-yellow-400" />
                        </button>
                      )}
                      {bus.status === 'maintenance' && (
                        <button
                          onClick={() => handleUpdateStatus(bus.id, 'active')}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          title="Activate"
                        >
                          <Bus size={16} className="text-green-400" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteBus(bus.id)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <X size={16} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
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
                    setShowAddModal(false);
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

      {showConductorModal && selectedBusForConductor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">
              Assign Conductor to {selectedBusForConductor.plate_number}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-white/60 text-sm mb-1 block">Select Conductor</label>
                <select
                  value={selectedConductor}
                  onChange={(e) => setSelectedConductor(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="">-- No Conductor --</option>
                  {conductors.map(conductor => (
                    <option key={conductor.id} value={conductor.id}>
                      {conductor.full_name} ({conductor.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowConductorModal(false);
                    setSelectedBusForConductor(null);
                    setSelectedConductor('');
                  }}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignConductor}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  Assign Conductor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusManagement;
