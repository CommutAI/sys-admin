import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, Search, Filter, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const FareIrregularities = () => {
  const [irregularities, setIrregularities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchIrregularities();
    // Set up real-time subscription
    const subscription = supabase
      .channel('fare-irregularities-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fare_irregularities' }, () => {
        fetchIrregularities();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchIrregularities = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('fare_irregularities')
        .select('*, trips(*, buses(*)), resolver:staff_users!resolved_by(*)')
        .order('detected_at', { ascending: false });

      if (error) throw error;
      setIrregularities(data || []);
    } catch (error) {
      console.error('Error fetching fare irregularities:', error);
    } finally {
      setLoading(false);
    }
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
      fetchIrregularities();
    } catch (error) {
      console.error('Error resolving irregularity:', error);
      alert('Error resolving irregularity: ' + error.message);
    }
  };

  const filteredIrregularities = irregularities.filter(irr => {
    const matchesSearch = irr.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         irr.trips?.buses?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'resolved' ? irr.resolved : !irr.resolved);
    const matchesType = filterType === 'all' || irr.type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

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
        <h1 className="text-white text-3xl font-bold mb-2">Fare Irregularities</h1>
        <p className="text-white/60">Loading irregularities...</p>
      </div>
    );
  }

  const unresolvedCount = irregularities.filter(i => !i.resolved).length;
  const resolvedCount = irregularities.filter(i => i.resolved).length;
  const fareEvasionCount = irregularities.filter(i => i.type === 'fare_evasion').length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Fare Irregularities</h1>
          <p className="text-white/60">Monitor and resolve fare compliance issues</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 border border-red-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Unresolved</p>
              <p className="text-white text-2xl font-bold">{unresolvedCount}</p>
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

        <div className="glass-card p-6 border border-purple-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <X className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Fare Evasion</p>
              <p className="text-white text-2xl font-bold">{fareEvasionCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
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
                <th className="pb-3 font-medium">Resolved By</th>
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
                            <Clock size={14} />
                            Unresolved
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-4 text-white/60 text-sm">
                      {irr.resolver?.full_name || '-'}
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
                  <td colSpan={7} className="py-12 text-center">
                    <AlertTriangle className="w-16 h-16 text-white/20 mx-auto mb-4" />
                    <p className="text-white/60">No fare irregularities found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FareIrregularities;
