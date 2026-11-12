import { useState, useEffect, useMemo } from 'react';
import { Search, Shield, Clock, User, FileText, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

const AuditLogs = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);

      // Try SECURITY DEFINER RPC first (works regardless of RLS/session state)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_audit_logs');

      if (!rpcError) {
        setLogs(rpcData || []);
        return;
      }

      // RPC not available yet (migration not run) — fall back to direct query
      console.warn('get_audit_logs RPC not available, falling back to direct query:', rpcError.message);

      let allRows = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) {
          console.error('Direct query also failed:', error.message);
          break;
        }
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      setLogs(allRows);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
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

  // Derive stats from the full dataset
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayActivity = logs.filter(l => l.created_at?.startsWith(today)).length;
    const securityEvents = logs.filter(l => l.action === 'DELETE' || l.action === 'LOGIN').length;
    const uniqueUsers = new Set(logs.map(l => l.username).filter(Boolean)).size;
    return {
      totalLogs: logs.length,
      activeUsers: uniqueUsers,
      securityEvents,
      todayActivity,
    };
  }, [logs]);

  const uniqueUsers = useMemo(
    () => [...new Set(logs.map(l => l.username).filter(Boolean))].sort(),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch =
        !searchTerm ||
        log.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.module?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesAction = filterAction === 'all' || log.action === filterAction;
      const matchesUser = filterUser === 'all' || log.username === filterUser;

      const logDate = log.created_at ? new Date(log.created_at) : null;
      const matchesStart = !dateRange.start || (logDate && logDate >= new Date(dateRange.start));
      const matchesEnd = !dateRange.end || (logDate && logDate <= new Date(dateRange.end + 'T23:59:59'));

      return matchesSearch && matchesAction && matchesUser && matchesStart && matchesEnd;
    });
  }, [logs, searchTerm, filterAction, filterUser, dateRange]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterAction, filterUser, dateRange]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleExport = () => {
    const headers = ['Timestamp', 'User', 'Action', 'Module', 'Details', 'IP Address'];
    const rows = filteredLogs.map(log => [
      log.created_at ? new Date(log.created_at).toLocaleString() : '',
      log.username || '',
      log.action || '',
      log.module || '',
      log.details || '',
      log.ip_address || '',
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <button
          onClick={handleExport}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
        >
          <Download size={20} />
          Export CSV
        </button>
      </div>

      {loading ? (
        <div className="glass-card p-6 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
          <p className="text-white/60">Loading audit logs...</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
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
              <div className="flex items-center gap-3">
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
              <div className="flex items-center gap-3">
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
              <div className="flex items-center gap-3">
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

          {/* Table */}
          <div className="glass-card p-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex-1 min-w-48 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  placeholder="Search user, module, details..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                />
              </div>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
              >
                <option value="all">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="LOGIN">Login</option>
                <option value="LOGOUT">Logout</option>
                <option value="VIEW">View</option>
                <option value="EXPORT">Export</option>
              </select>
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
              >
                <option value="all">All Users</option>
                {uniqueUsers.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(d => ({ ...d, start: e.target.value }))}
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                title="Start date"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(d => ({ ...d, end: e.target.value }))}
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                title="End date"
              />
              {(searchTerm || filterAction !== 'all' || filterUser !== 'all' || dateRange.start || dateRange.end) && (
                <button
                  onClick={() => { setSearchTerm(''); setFilterAction('all'); setFilterUser('all'); setDateRange({ start: '', end: '' }); }}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white/70 rounded-xl text-sm transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-white/60 border-b border-white/10 text-sm">
                    <th className="pb-3 font-medium pr-4">
                      <div className="flex items-center gap-2"><Clock size={14} />Timestamp</div>
                    </th>
                    <th className="pb-3 font-medium pr-4">
                      <div className="flex items-center gap-2"><User size={14} />User</div>
                    </th>
                    <th className="pb-3 font-medium pr-4">Action</th>
                    <th className="pb-3 font-medium pr-4">Module</th>
                    <th className="pb-3 font-medium pr-4">Details</th>
                    <th className="pb-3 font-medium">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.length > 0 ? (
                    paginatedLogs.map((log) => (
                      <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 pr-4 text-white/60 text-sm whitespace-nowrap">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-3 pr-4 text-white font-medium">{log.username || 'N/A'}</td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${actionColors[log.action] || 'bg-gray-500/20 text-gray-400'}`}>
                            {log.action || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-white/70 text-sm">{log.module || 'N/A'}</td>
                        <td className="py-3 pr-4 text-white/70 text-sm max-w-xs truncate" title={log.details}>
                          {log.details || 'N/A'}
                        </td>
                        <td className="py-3 text-white/40 text-xs font-mono">{log.ip_address || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-16 text-center">
                        <Shield className="w-12 h-12 text-white/20 mx-auto mb-3" />
                        <p className="text-white/40">No audit logs found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-white/50 text-xs sm:text-sm">
                {filteredLogs.length === 0
                  ? 'No results'
                  : `Showing ${((currentPage - 1) * itemsPerPage) + 1}–${Math.min(currentPage * itemsPerPage, filteredLogs.length)} of ${filteredLogs.length.toLocaleString()} logs`
                }
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex gap-1 overflow-x-auto">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let p;
                      if (totalPages <= 5) p = i + 1;
                      else if (currentPage <= 3) p = i + 1;
                      else if (currentPage >= totalPages - 2) p = totalPages - 4 + i;
                      else p = currentPage - 2 + i;
                      return (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`min-w-[32px] w-8 h-8 rounded-lg text-xs sm:text-sm transition-colors ${
                            currentPage === p
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/10 hover:bg-white/20 text-white/70'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AuditLogs;
