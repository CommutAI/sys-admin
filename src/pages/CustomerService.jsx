import { useState, useEffect } from 'react';
import { HeadphonesIcon, Plus, Search, Filter, MessageSquare, Calendar, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CustomerService = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLog, setNewLog] = useState({
    action: 'inquiry',
    description: '',
    trip_id: null
  });

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customer_service_logs')
        .select('*, trips(*, buses(*)), handler:staff_users!handled_by(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching customer service logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLog = async (e) => {
    e.preventDefault();
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('customer_service_logs')
        .insert([{
          ...newLog,
          handled_by: userData.user?.id
        }]);

      if (error) throw error;

      alert('Customer service log added successfully!');
      setShowAddModal(false);
      setNewLog({ action: 'inquiry', description: '', trip_id: null });
      fetchLogs();
    } catch (error) {
      console.error('Error adding log:', error);
      alert('Error adding log: ' + error.message);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.handler?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.trips?.buses?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    return matchesSearch && matchesAction;
  });

  const actionColors = {
    complaint: 'bg-red-500/20 text-red-400 border-red-500/50',
    inquiry: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    refund: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    lost_card: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    other: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };

  const actionLabels = {
    complaint: 'Complaint',
    inquiry: 'Inquiry',
    refund: 'Refund',
    lost_card: 'Lost Card',
    other: 'Other',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Customer Service</h1>
        <p className="text-white/60">Loading customer service logs...</p>
      </div>
    );
  }

  const actionCounts = {
    complaint: logs.filter(l => l.action === 'complaint').length,
    inquiry: logs.filter(l => l.action === 'inquiry').length,
    refund: logs.filter(l => l.action === 'refund').length,
    lost_card: logs.filter(l => l.action === 'lost_card').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Customer Service</h1>
          <p className="text-white/60">Manage customer service logs and actions</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Add Log
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6 border border-red-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Complaints</p>
              <p className="text-white text-2xl font-bold">{actionCounts.complaint}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 border border-blue-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Inquiries</p>
              <p className="text-white text-2xl font-bold">{actionCounts.inquiry}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 border border-yellow-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Refunds</p>
              <p className="text-white text-2xl font-bold">{actionCounts.refund}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 border border-purple-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Lost Cards</p>
              <p className="text-white text-2xl font-bold">{actionCounts.lost_card}</p>
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
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Actions</option>
            <option value="complaint">Complaint</option>
            <option value="inquiry">Inquiry</option>
            <option value="refund">Refund</option>
            <option value="lost_card">Lost Card</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-white/60 border-b border-white/10">
                <th className="pb-3 font-medium">Action</th>
                <th className="pb-3 font-medium">Description</th>
                <th className="pb-3 font-medium">Trip/Bus</th>
                <th className="pb-3 font-medium">Handled By</th>
                <th className="pb-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-4">
                      <span className={`px-3 py-1 rounded-full text-xs border ${actionColors[log.action]}`}>
                        {actionLabels[log.action]}
                      </span>
                    </td>
                    <td className="py-4 text-white/70">{log.description || '-'}</td>
                    <td className="py-4 text-white/60 text-sm">
                      {log.trips?.buses?.plate_number || 'N/A'}
                    </td>
                    <td className="py-4 text-white/70">
                      <div className="flex items-center gap-2">
                        <User size={14} />
                        {log.handler?.full_name || 'Unknown'}
                      </div>
                    </td>
                    <td className="py-4 text-white/60 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} />
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <HeadphonesIcon className="w-16 h-16 text-white/20 mx-auto mb-4" />
                    <p className="text-white/60">No customer service logs found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">Add Customer Service Log</h2>
            <form onSubmit={handleAddLog} className="space-y-4">
              <div>
                <label className="text-white/60 text-sm mb-1 block">Action Type</label>
                <select
                  value={newLog.action}
                  onChange={(e) => setNewLog({ ...newLog, action: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="inquiry">Inquiry</option>
                  <option value="complaint">Complaint</option>
                  <option value="refund">Refund</option>
                  <option value="lost_card">Lost Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Description</label>
                <textarea
                  required
                  value={newLog.description}
                  onChange={(e) => setNewLog({ ...newLog, description: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  Add Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerService;
