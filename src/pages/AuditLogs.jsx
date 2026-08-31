import { useState, useEffect } from 'react';
import { Search, Filter, Shield, Clock, User, FileText, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';

const AuditLogs = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLogs: 0,
    activeUsers: 0,
    securityEvents: 0,
    todayActivity: 0,
  });

  useEffect(() => {
    fetchAuditLogs();
    fetchStats();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: logsData } = await supabase
        .from('audit_logs')
        .select('*');

      const today = new Date().toISOString().split('T')[0];
      const todayLogs = (logsData || []).filter(log => 
        log.created_at?.startsWith(today)
      );
      const securityEvents = (logsData || []).filter(log => 
        log.action === 'DELETE' || log.action === 'LOGIN'
      );
      const uniqueUsers = [...new Set((logsData || []).map(log => log.username))];

      setStats({
        totalLogs: (logsData || []).length,
        activeUsers: uniqueUsers.length,
        securityEvents: securityEvents.length,
        todayActivity: todayLogs.length,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const actionColors = {
    CREATE: 'bg-green-500/20 text-green-400',
    UPDATE: 'bg-blue-500/20 text-blue-400',
    DELETE: 'bg-red-500/20 text-red-400',
    LOGIN: 'bg-purple-500/20 text-purple-400',
    LOGOUT: 'bg-pink-500/20 text-pink-400',
    VIEW: 'bg-gray-500/20 text-gray-400',
    EXPORT: 'bg-orange-500/20 text-orange-400',
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.details?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    const matchesUser = filterUser === 'all' || log.username === filterUser;
    return matchesSearch && matchesAction && matchesUser;
  });

  const uniqueUsers = [...new Set(logs.map(log => log.username))];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
            <Shield className="text-orange-400" />
            Audit Logs
          </h1>
          <p className="text-white/60">Track all system activities and changes</p>
        </div>
        <button className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors">
          <Download size={20} />
          Export Logs
        </button>
      </div>

      {loading ? (
        <div className="glass-card p-6">
          <p className="text-white/60">Loading audit logs...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Total Logs</p>
                  <p className="text-white text-2xl font-bold">{stats.totalLogs.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Active Users</p>
                  <p className="text-white text-2xl font-bold">{stats.activeUsers}</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Security Events</p>
                  <p className="text-white text-2xl font-bold">{stats.securityEvents}</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-orange-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Today's Activity</p>
                  <p className="text-white text-2xl font-bold">{stats.todayActivity}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="flex-1 relative">
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
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
              >
                <option value="all" className="bg-gray-800 text-white">All Actions</option>
                <option value="CREATE" className="bg-gray-800 text-white">Create</option>
                <option value="UPDATE" className="bg-gray-800 text-white">Update</option>
                <option value="DELETE" className="bg-gray-800 text-white">Delete</option>
                <option value="LOGIN" className="bg-gray-800 text-white">Login</option>
                <option value="LOGOUT" className="bg-gray-800 text-white">Logout</option>
                <option value="VIEW" className="bg-gray-800 text-white">View</option>
                <option value="EXPORT" className="bg-gray-800 text-white">Export</option>
              </select>
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
              >
                <option value="all" className="bg-gray-800 text-white">All Users</option>
                {uniqueUsers.map(user => (
                  <option key={user} value={user} className="bg-gray-800 text-white">{user}</option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-white/60 border-b border-white/10">
                    <th className="pb-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Clock size={16} />
                        Timestamp
                      </div>
                    </th>
                    <th className="pb-3 font-medium">
                      <div className="flex items-center gap-2">
                        <User size={16} />
                        User
                      </div>
                    </th>
                    <th className="pb-3 font-medium">Action</th>
                    <th className="pb-3 font-medium">Module</th>
                    <th className="pb-3 font-medium">Details</th>
                    <th className="pb-3 font-medium">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length > 0 ? (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-4 text-white/70 text-sm">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-4 text-white">{log.username || 'N/A'}</td>
                        <td className="py-4">
                          <span className={`px-3 py-1 rounded-full text-xs ${actionColors[log.action] || 'bg-gray-500/20 text-gray-400'}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-4 text-white/70">{log.module || 'N/A'}</td>
                        <td className="py-4 text-white/70">{log.details || 'N/A'}</td>
                        <td className="py-4 text-white/40 text-sm font-mono">{log.ip_address || 'N/A'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <Shield className="w-16 h-16 text-white/20 mx-auto mb-4" />
                        <p className="text-white/60">No audit logs found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-white/60 text-sm">Showing {filteredLogs.length} of {logs.length} logs</p>
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-white/10 text-white/70 rounded-xl hover:bg-white/20 transition-colors">
                  Previous
                </button>
                <button className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors">
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AuditLogs;
