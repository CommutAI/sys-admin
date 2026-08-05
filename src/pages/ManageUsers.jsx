import { useState, useEffect } from 'react';
import { UserPlus, Search, Edit, Trash2, Shield, HeadphonesIcon, UserCheck, MoreVertical } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ManageUsers = () => {
  const [userType, setUserType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    role: 'conductor',
    password: ''
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            full_name: newUser.full_name,
            role: newUser.role
          }
        }
      });

      if (authError) throw authError;

      alert('User created successfully!');
      setShowAddModal(false);
      setNewUser({ email: '', full_name: '', role: 'conductor', password: '' });
      fetchUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Error creating user: ' + error.message);
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      const { error } = await supabase
        .from('staff_users')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      fetchUsers();
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = userType === 'all' || user.role === userType;
    return matchesSearch && matchesType;
  });

  const statusColors = {
    active: 'bg-green-500/20 text-green-400',
    inactive: 'bg-red-500/20 text-red-400',
  };

  const roleColors = {
    admin: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    conductor: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    cs_desk: 'bg-green-500/20 text-green-400 border-green-500/50',
  };

  const userTypes = [
    { id: 'all', label: 'All Users', icon: UserCheck },
    { id: 'admin', label: 'Admin', icon: Shield },
    { id: 'cs_desk', label: 'Customer Service', icon: HeadphonesIcon },
    { id: 'conductor', label: 'Conductors', icon: UserCheck },
  ];

  const roleCounts = {
    admin: users.filter(u => u.role === 'admin').length,
    cs_desk: users.filter(u => u.role === 'cs_desk').length,
    conductor: users.filter(u => u.role === 'conductor').length,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Manage Users</h1>
        <p className="text-white/60">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Manage Users</h1>
          <p className="text-white/60">Manage admin, customer service, and conductor accounts</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
        >
          <UserPlus size={20} />
          Add User
        </button>
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex gap-2">
            {userTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => setUserType(type.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${
                    userType === type.id
                      ? 'bg-orange-500 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  <Icon size={18} />
                  {type.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-white/60 border-b border-white/10">
                <th className="pb-3 font-medium">Name</th>
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">Role</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Created</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-4 text-white font-medium">{user.full_name}</td>
                  <td className="py-4 text-white/70">{user.email}</td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-xs border ${roleColors[user.role]}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-xs ${statusColors[user.is_active ? 'active' : 'inactive']}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-4 text-white/70 text-sm">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleStatus(user.id, user.is_active)}
                        className="text-white/70 hover:text-orange-400 transition-colors text-sm"
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Admin Users</p>
              <p className="text-white text-2xl font-bold">{roleCounts.admin}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <HeadphonesIcon className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Customer Service</p>
              <p className="text-white text-2xl font-bold">{roleCounts.cs_desk}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Conductors</p>
              <p className="text-white text-2xl font-bold">{roleCounts.conductor}</p>
            </div>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">Add New User</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="text-white/60 text-sm mb-1 block">Full Name</label>
                <input
                  type="text"
                  required
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Email</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Password</label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="conductor">Conductor</option>
                  <option value="cs_desk">CS Desk</option>
                  <option value="admin">Admin</option>
                </select>
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
                  Add User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;
