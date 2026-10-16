import { useState, useEffect } from 'react';
import { DollarSign, Plus, Edit, X, ChevronLeft, ChevronRight, Search, ArrowUpDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import AuditService from '../services/auditService';

const FareMatrix = () => {
  const [fareMatrix, setFareMatrix] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFare, setEditingFare] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState('route_from');
  const [sortDirection, setSortDirection] = useState('asc');
  const [newFare, setNewFare] = useState({
    route_from: '',
    route_to: '',
    km_distance: 0,
    regular_fare: 0,
    discounted_fare: 0
  });

  useEffect(() => {
    fetchFareMatrix();
    // Log page view to audit logs
    AuditService.logPageView('Fare Matrix');
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedRoute, searchTerm]);

  const fetchFareMatrix = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('fare_matrix')
        .select('*')
        .order('route_from, route_to');

      if (error) throw error;
      setFareMatrix(data || []);
    } catch (error) {
      console.error('Error fetching fare matrix:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFare = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('fare_matrix')
        .insert([newFare]);

      if (error) throw error;

      // Log fare addition to audit logs
      await AuditService.logFareMatrixUpdated(newFare.route_from, newFare.route_to, `Added new fare: Regular ₱${newFare.regular_fare}, Discounted ₱${newFare.discounted_fare}`);

      alert('Fare added successfully!');
      setShowAddModal(false);
      setNewFare({ route_from: '', route_to: '', km_distance: 0, regular_fare: 0, discounted_fare: 0 });
      fetchFareMatrix();
    } catch (error) {
      console.error('Error adding fare:', error);
      alert('Error adding fare: ' + error.message);
    }
  };

  const handleUpdateFare = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('fare_matrix')
        .update(newFare)
        .eq('id', editingFare.id);

      if (error) throw error;

      // Log fare update to audit logs
      await AuditService.logFareMatrixUpdated(newFare.route_from, newFare.route_to, `Updated fare: Regular ₱${newFare.regular_fare}, Discounted ₱${newFare.discounted_fare}`);

      alert('Fare updated successfully!');
      setEditingFare(null);
      setNewFare({ route_from: '', route_to: '', km_distance: 0, regular_fare: 0, discounted_fare: 0 });
      fetchFareMatrix();
    } catch (error) {
      console.error('Error updating fare:', error);
      alert('Error updating fare: ' + error.message);
    }
  };

  const handleDeleteFare = async (fareId) => {
    if (!confirm('Are you sure you want to delete this fare entry?')) return;

    try {
      const { error } = await supabase
        .from('fare_matrix')
        .delete()
        .eq('id', fareId);

      if (error) throw error;
      fetchFareMatrix();
    } catch (error) {
      console.error('Error deleting fare:', error);
      alert('Error deleting fare: ' + error.message);
    }
  };

  const openEditFareModal = (fare) => {
    setEditingFare(fare);
    setNewFare({
      route_from: fare.route_from,
      route_to: fare.route_to,
      km_distance: fare.km_distance,
      regular_fare: fare.regular_fare,
      discounted_fare: fare.discounted_fare
    });
  };

  const getFilteredFares = () => {
    let fares = fareMatrix;

    // Apply bus stop category filter
    if (selectedRoute === 'manolo-to-agora') {
      fares = fares.filter(fare => {
        const routeTo = (fare.route_to || '').toLowerCase().trim();
        return routeTo.includes('agora');
      });
    } else if (selectedRoute === 'agora-to-manolo') {
      fares = fares.filter(fare => {
        const routeFrom = (fare.route_from || '').toLowerCase().trim();
        return routeFrom.includes('agora');
      });
    }

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      fares = fares.filter(fare =>
        (fare.route_from || '').toLowerCase().includes(searchLower) ||
        (fare.route_to || '').toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    fares = [...fares].sort((a, b) => {
      let comparison = 0;
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (sortColumn === 'km_distance' || sortColumn === 'regular_fare' || sortColumn === 'discounted_fare') {
        comparison = parseFloat(aValue) - parseFloat(bValue);
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return fares;
  };

  const filteredFares = getFilteredFares();
  const totalPages = Math.ceil(filteredFares.length / itemsPerPage);
  const paginatedFares = filteredFares.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Fare Matrix</h1>
        <p className="text-white/60">Loading fare matrix...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
            <DollarSign className="text-orange-400" />
            Fare Matrix
          </h1>
          <p className="text-white/60">Manage fare rates for different bus stops</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Add Fare
        </button>
      </div>

      <div className="glass-card p-6">
        {fareMatrix.length > 0 ? (
          <div className="space-y-6">
            {/* Route Selection Dropdown and Search */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <label className="text-white/60 text-sm">Select Bus Stops:</label>
                <select
                  value={selectedRoute}
                  onChange={(e) => setSelectedRoute(e.target.value)}
                  className="bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
                  style={{ backgroundColor: '#1f2937', color: 'white' }}
                >
                  <option value="all" style={{ backgroundColor: '#1f2937', color: 'white' }}>All Bus Stops</option>
                  <option value="manolo-to-agora" style={{ backgroundColor: '#1f2937', color: 'white' }}>Bus Stops Ending in Agora Terminal</option>
                  <option value="agora-to-manolo" style={{ backgroundColor: '#1f2937', color: 'white' }}>Bus Stops Starting from Agora Terminal</option>
                </select>
              </div>

              <div className="flex-1 relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  placeholder="Search by bus stop name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                />
              </div>

              <span className="text-white/40 text-sm">
                Showing {filteredFares.length} {filteredFares.length === 1 ? 'stop' : 'stops'}
              </span>
            </div>

            {/* Category Header */}
            <div>
              <h3 className="text-white text-lg font-bold mb-2">
                {selectedRoute === 'all' ? 'All Bus Stops' :
                 selectedRoute === 'manolo-to-agora' ? 'Bus Stops Ending in Agora Terminal' :
                 'Bus Stops Starting from Agora Terminal'}
              </h3>
              <p className="text-white/50 text-sm">
                {selectedRoute === 'all' ? 'Showing all available bus stops in the system' :
                 selectedRoute === 'manolo-to-agora' ? 'Showing all bus stops that end at Agora Terminal' :
                 'Showing all bus stops that start from Agora Terminal'}
              </p>
            </div>

            {/* Table */}
            {paginatedFares.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th
                          className="text-left text-white/60 py-3 px-4 cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('route_from')}
                        >
                          <div className="flex items-center gap-2">
                            Stop From
                            {sortColumn === 'route_from' && (
                              <ArrowUpDown size={14} className={`transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                            )}
                          </div>
                        </th>
                        <th
                          className="text-left text-white/60 py-3 px-4 cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('route_to')}
                        >
                          <div className="flex items-center gap-2">
                            Stop To
                            {sortColumn === 'route_to' && (
                              <ArrowUpDown size={14} className={`transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                            )}
                          </div>
                        </th>
                        <th
                          className="text-left text-white/60 py-3 px-4 cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('km_distance')}
                        >
                          <div className="flex items-center gap-2">
                            KM Distance
                            {sortColumn === 'km_distance' && (
                              <ArrowUpDown size={14} className={`transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                            )}
                          </div>
                        </th>
                        <th
                          className="text-left text-white/60 py-3 px-4 cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('regular_fare')}
                        >
                          <div className="flex items-center gap-2">
                            Regular Fare
                            {sortColumn === 'regular_fare' && (
                              <ArrowUpDown size={14} className={`transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                            )}
                          </div>
                        </th>
                        <th
                          className="text-left text-white/60 py-3 px-4 cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('discounted_fare')}
                        >
                          <div className="flex items-center gap-2">
                            Elderly / Disabled & Student Fare
                            {sortColumn === 'discounted_fare' && (
                              <ArrowUpDown size={14} className={`transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                            )}
                          </div>
                        </th>
                        <th className="text-left text-white/60 py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedFares.map((fare) => (
                        <tr key={fare.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-3 px-4 text-white font-medium">{fare.route_from}</td>
                          <td className="py-3 px-4 text-white font-medium">{fare.route_to}</td>
                          <td className="py-3 px-4 text-white/70">{fare.km_distance}</td>
                          <td className="py-3 px-4 text-white/70">₱{parseFloat(fare.regular_fare).toFixed(2)}</td>
                          <td className="py-3 px-4 text-white/70">₱{parseFloat(fare.discounted_fare).toFixed(2)}</td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => openEditFareModal(fare)}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                              >
                                <Edit size={16} className="text-white/70" />
                              </button>
                              <button
                                onClick={() => handleDeleteFare(fare.id)}
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                    <span className="text-white/60 text-sm">
                      Page {currentPage} of {totalPages} ({filteredFares.length} total)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={16} className="text-white/70" />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`px-3 py-1 rounded-lg transition-colors ${
                            currentPage === page
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/10 text-white/70 hover:bg-white/20'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRight size={16} className="text-white/70" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-white/60">No bus stops found in this category</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <DollarSign className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/60">No fare entries available</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 mx-auto transition-colors"
            >
              <Plus size={20} />
              Add First Fare
            </button>
          </div>
        )}
      </div>

      {/* Baggage Fee Section */}
      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-3">
          <DollarSign className="text-orange-400" />
          Baggage Fee Matrix
        </h2>
        <p className="text-white/60 mb-6">Standard baggage fees for different weight categories per bus stop</p>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-white/60 py-3 px-4">ID</th>
                <th className="text-left text-white/60 py-3 px-4">Category</th>
                <th className="text-left text-white/60 py-3 px-4">Max Weight (kg)</th>
                <th className="text-left text-white/60 py-3 px-4">Fee (₱)</th>
                <th className="text-left text-white/60 py-3 px-4">Remarks</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 px-4 text-white font-medium">1</td>
                <td className="py-3 px-4 text-white font-medium">Free Carry-on</td>
                <td className="py-3 px-4 text-white/70">7</td>
                <td className="py-3 px-4 text-white/70">₱0</td>
                <td className="py-3 px-4 text-white/70">Included in passenger fare</td>
              </tr>
              <tr className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 px-4 text-white font-medium">2</td>
                <td className="py-3 px-4 text-white font-medium">Small</td>
                <td className="py-3 px-4 text-white/70">10</td>
                <td className="py-3 px-4 text-white/70">₱20</td>
                <td className="py-3 px-4 text-white/70">Fits under seat or overhead area</td>
              </tr>
              <tr className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 px-4 text-white font-medium">3</td>
                <td className="py-3 px-4 text-white font-medium">Medium</td>
                <td className="py-3 px-4 text-white/70">20</td>
                <td className="py-3 px-4 text-white/70">₱40</td>
                <td className="py-3 px-4 text-white/70">Stored in baggage compartment</td>
              </tr>
              <tr className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 px-4 text-white font-medium">4</td>
                <td className="py-3 px-4 text-white font-medium">Large</td>
                <td className="py-3 px-4 text-white/70">30</td>
                <td className="py-3 px-4 text-white/70">₱60</td>
                <td className="py-3 px-4 text-white/70">Requires larger storage space</td>
              </tr>
              <tr className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 px-4 text-white font-medium">5</td>
                <td className="py-3 px-4 text-white font-medium">Oversized</td>
                <td className="py-3 px-4 text-white/70">&gt;30</td>
                <td className="py-3 px-4 text-white/70">₱100</td>
                <td className="py-3 px-4 text-white/70">Subject to conductor approval</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Fare Modal */}
      {(showAddModal || editingFare) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">
              {editingFare ? 'Edit Fare' : 'Add New Fare'}
            </h2>
            <form onSubmit={editingFare ? handleUpdateFare : handleAddFare} className="space-y-4">
              <div>
                <label className="text-white/60 text-sm mb-1 block">From</label>
                <input
                  type="text"
                  required
                  value={newFare.route_from}
                  onChange={(e) => setNewFare({ ...newFare, route_from: e.target.value })}
                  className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  style={{ backgroundColor: '#1f2937', color: 'white' }}
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">To</label>
                <input
                  type="text"
                  required
                  value={newFare.route_to}
                  onChange={(e) => setNewFare({ ...newFare, route_to: e.target.value })}
                  className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  style={{ backgroundColor: '#1f2937', color: 'white' }}
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Distance (KM)</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={newFare.km_distance}
                  onChange={(e) => setNewFare({ ...newFare, km_distance: parseFloat(e.target.value) })}
                  className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  style={{ backgroundColor: '#1f2937', color: 'white' }}
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Regular Fare (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newFare.regular_fare}
                  onChange={(e) => setNewFare({ ...newFare, regular_fare: parseFloat(e.target.value) })}
                  className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  style={{ backgroundColor: '#1f2937', color: 'white' }}
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Discounted Fare (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newFare.discounted_fare}
                  onChange={(e) => setNewFare({ ...newFare, discounted_fare: parseFloat(e.target.value) })}
                  className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  style={{ backgroundColor: '#1f2937', color: 'white' }}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingFare(null);
                    setNewFare({ route_from: '', route_to: '', km_distance: 0, regular_fare: 0, discounted_fare: 0 });
                  }}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  {editingFare ? 'Update' : 'Add'} Fare
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FareMatrix;
