import { useState } from 'react';
import { Search, Filter, Shield, Clock, User, FileText, Download } from 'lucide-react';

const AuditLogs = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterUser, setFilterUser] = useState('all');

  const logs = [
    { id: 1, timestamp: '2024-01-15 10:30:45', user: 'Admin User', action: 'UPDATE', module: 'Fare Matrix', details: 'Updated fare for Route 1', ip: '192.168.1.100' },
    { id: 2, timestamp: '2024-01-15 10:28:12', user: 'Admin User', action: 'CREATE', module: 'Users', details: 'Created new conductor account', ip: '192.168.1.100' },
    { id: 3, timestamp: '2024-01-15 10:15:33', user: 'System Admin', action: 'DELETE', module: 'Trips', details: 'Deleted trip #12345', ip: '192.168.1.101' },
    { id: 4, timestamp: '2024-01-15 09:45:18', user: 'CS Agent 1', action: 'UPDATE', module: 'Passengers', details: 'Updated passenger record', ip: '192.168.1.102' },
    { id: 5, timestamp: '2024-01-15 09:30:55', user: 'Admin User', action: 'LOGIN', module: 'Auth', details: 'Successful login', ip: '192.168.1.100' },
    { id: 6, timestamp: '2024-01-15 09:15:22', user: 'System Admin', action: 'UPDATE', module: 'Settings', details: 'Changed system configuration', ip: '192.168.1.101' },
    { id: 7, timestamp: '2024-01-15 08:55:41', user: 'CS Agent 2', action: 'VIEW', module: 'Reports', details: 'Viewed revenue report', ip: '192.168.1.103' },
    { id: 8, timestamp: '2024-01-15 08:30:15', user: 'Admin User', action: 'EXPORT', module: 'Reports', details: 'Exported passenger data', ip: '192.168.1.100' },
  ];

  const actionColors = {
    CREATE: 'bg-green-500/20 text-green-400',
    UPDATE: 'bg-blue-500/20 text-blue-400',
    DELETE: 'bg-red-500/20 text-red-400',
    LOGIN: 'bg-purple-500/20 text-purple-400',
    VIEW: 'bg-gray-500/20 text-gray-400',
    EXPORT: 'bg-orange-500/20 text-orange-400',
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.details.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    const matchesUser = filterUser === 'all' || log.user === filterUser;
    return matchesSearch && matchesAction && matchesUser;
  });

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
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="LOGIN">Login</option>
            <option value="VIEW">View</option>
            <option value="EXPORT">Export</option>
          </select>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Users</option>
            <option value="Admin User">Admin User</option>
            <option value="System Admin">System Admin</option>
            <option value="CS Agent 1">CS Agent 1</option>
            <option value="CS Agent 2">CS Agent 2</option>
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
              {filteredLogs.map((log) => (
                <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-4 text-white/70 text-sm">{log.timestamp}</td>
                  <td className="py-4 text-white">{log.user}</td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-xs ${actionColors[log.action]}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-4 text-white/70">{log.module}</td>
                  <td className="py-4 text-white/70">{log.details}</td>
                  <td className="py-4 text-white/40 text-sm font-mono">{log.ip}</td>
                </tr>
              ))}
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Logs</p>
              <p className="text-white text-2xl font-bold">1,234</p>
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
              <p className="text-white text-2xl font-bold">12</p>
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
              <p className="text-white text-2xl font-bold">23</p>
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
              <p className="text-white text-2xl font-bold">156</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
