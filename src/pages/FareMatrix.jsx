import { useState, useEffect } from 'react';
import { DollarSign, Plus, Edit, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const FareMatrix = () => {
  const [fareMatrix, setFareMatrix] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFare, setEditingFare] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState('all');
  const [newFare, setNewFare] = useState({
    route_from: '',
    route_to: '',
    km_distance: 0,
    regular_fare: 0,
    discounted_fare: 0
  });

  useEffect(() => {
    fetchFareMatrix();
  }, []);

  const fetchFareMatrix = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('fare_matrix')
        .select('*')
        .order('route_from, route_to');

      if (error) throw error;
      console.log('Fare Matrix Data:', data);
      console.log('Route from values:', data?.map(f => f.route_from));
      console.log('Route to values:', data?.map(f => f.route_to));
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
          <p className="text-white/60">Manage fare rates for different routes</p>
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
            {/* Route Selection Dropdown */}
            <div className="flex items-center gap-4">
              <label className="text-white/60 text-sm">Select Route Direction:</label>
              <select
                value={selectedRoute}
                onChange={(e) => {
                  const newValue = e.target.value;
                  console.log('Dropdown changed to:', newValue);
                  console.log('Is agora-to-manolo?', newValue === 'agora-to-manolo');
                  console.log('Previous value:', selectedRoute);
                  setSelectedRoute(newValue);
                }}
                className="bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
                style={{ backgroundColor: '#1f2937', color: 'white' }}
              >
                <option value="all" style={{ backgroundColor: '#1f2937', color: 'white' }}>All Routes</option>
                <option value="manolo-to-agora" style={{ backgroundColor: '#1f2937', color: 'white' }}>Routes Ending in Agora Terminal</option>
                <option value="agora-to-manolo" style={{ backgroundColor: '#1f2937', color: 'white' }}>Routes Starting from Agora Terminal</option>
              </select>
            </div>

            {/* Dynamic Table based on selection */}
            {(() => {
              console.log('Current selectedRoute:', selectedRoute);
              console.log('Is manolo-to-agora?', selectedRoute === 'manolo-to-agora');
              
              if (selectedRoute === 'all') {
                console.log('Showing all routes');
                return (
                  <div>
                    <h3 className="text-white text-lg font-bold mb-4">All Routes</h3>
                    <p className="text-white/50 text-sm mb-4">Showing all available routes in the system</p>
                    {fareMatrix.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-white/60">No routes available</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left text-white/60 py-3 px-4">Route From</th>
                              <th className="text-left text-white/60 py-3 px-4">Route To</th>
                              <th className="text-left text-white/60 py-3 px-4">KM Distance</th>
                              <th className="text-left text-white/60 py-3 px-4">Regular Fare</th>
                              <th className="text-left text-white/60 py-3 px-4">Elderly / Disabled & Student Fare</th>
                              <th className="text-left text-white/60 py-3 px-4">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fareMatrix.map((fare) => (
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
                    )}
                  </div>
                );
              } else if (selectedRoute === 'manolo-to-agora') {
                console.log('Processing manolo-to-agora selection');
                console.log('Total fareMatrix items:', fareMatrix.length);
                console.log('All route_to values:', fareMatrix.map(f => f.route_to));
                
                const filteredFares = fareMatrix.filter(fare => {
                  const routeTo = (fare.route_to || '').toLowerCase().trim();
                  // Handle various ways Agora might be spelled: "agora", "agora terminal", "agora terminal, cdo", etc.
                  const includesAgora = routeTo.includes('agora');
                  console.log('Checking route_to:', fare.route_to, 'normalized:', routeTo, 'includes agora:', includesAgora);
                  return includesAgora;
                });
                console.log('Filtered fares for Agora destination:', filteredFares);
                console.log('Filtered count:', filteredFares.length);
                
                return (
                  <div>
                    <h3 className="text-white text-lg font-bold mb-4">Routes Ending in Agora Terminal</h3>
                    <p className="text-white/50 text-sm mb-4">Showing all routes that end at Agora Terminal</p>
                    {filteredFares.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-white/60">No routes found ending in Agora Terminal</p>
                        <p className="text-white/40 text-sm mt-2">Check if routes have "Agora Terminal" as destination. Total routes: {fareMatrix.length}</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left text-white/60 py-3 px-4">Route From</th>
                              <th className="text-left text-white/60 py-3 px-4">Route To</th>
                              <th className="text-left text-white/60 py-3 px-4">KM Distance</th>
                              <th className="text-left text-white/60 py-3 px-4">Regular Fare</th>
                              <th className="text-left text-white/60 py-3 px-4">Elderly / Disabled & Student Fare</th>
                              <th className="text-left text-white/60 py-3 px-4">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredFares.map((fare) => (
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
                    )}
              </div>
                );
              } else if (selectedRoute === 'agora-to-manolo') {
                console.log('Processing agora-to-manolo selection');
                console.log('Total fareMatrix items:', fareMatrix.length);
                console.log('All route_from values:', fareMatrix.map(f => f.route_from));
                
                const filteredFares = fareMatrix.filter(fare => {
                  const routeFrom = (fare.route_from || '').toLowerCase().trim();
                  // Handle various ways Agora might be spelled: "agora", "agora terminal", "agora terminal, cdo", etc.
                  const includesAgora = routeFrom.includes('agora');
                  console.log('Checking route_from:', fare.route_from, 'normalized:', routeFrom, 'includes agora:', includesAgora);
                  return includesAgora;
                });
                console.log('Filtered fares for Agora origin:', filteredFares);
                console.log('Filtered count:', filteredFares.length);
                
                return (
                  <div>
                    <h3 className="text-white text-lg font-bold mb-4">Routes Starting from Agora Terminal</h3>
                    <p className="text-white/50 text-sm mb-4">Showing all routes that start from Agora Terminal</p>
                    {filteredFares.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-white/60">No routes found starting from Agora Terminal</p>
                        <p className="text-white/40 text-sm mt-2">Check if routes have "Agora Terminal" as origin. Total routes: {fareMatrix.length}</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left text-white/60 py-3 px-4">Route From</th>
                              <th className="text-left text-white/60 py-3 px-4">Route To</th>
                              <th className="text-left text-white/60 py-3 px-4">KM Distance</th>
                              <th className="text-left text-white/60 py-3 px-4">Regular Fare</th>
                              <th className="text-left text-white/60 py-3 px-4">Elderly / Disabled & Student Fare</th>
                              <th className="text-left text-white/60 py-3 px-4">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredFares.map((fare) => (
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
                    )}
              </div>
                );
              } else {
                console.log('Unknown route selection:', selectedRoute);
                return (
                  <div className="text-center py-8">
                    <p className="text-white/60">Please select a valid route direction</p>
                  </div>
                );
              }
            })()}
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
        <p className="text-white/60 mb-6">Standard baggage fees for different weight categories</p>
        
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
