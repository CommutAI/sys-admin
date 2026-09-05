import { useState, useEffect } from 'react';
<<<<<<< HEAD
import { UserPlus, Search, Edit, Trash2, Shield, UserCheck, MoreVertical } from 'lucide-react';
import { supabase, supabaseAdmin } from '../lib/supabase';
import AuditService from '../services/auditService';
=======
import { UserPlus, Search, Edit, Trash2, Shield, UserCheck, MoreVertical, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
>>>>>>> 4559f34aad17821beeaf3ff5af0a0853ffb32bb8

const ManageUsers = () => {
  const [userType, setUserType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    role: 'conductor',
    password: ''
  });
  const [editUser, setEditUser] = useState({
    id: '',
    full_name: '',
    email: '',
    role: 'conductor',
    is_active: true
  });

  useEffect(() => {
    fetchUsers();
    // Log page view to audit logs
    AuditService.logPageView('Manage Users');
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      // Use supabaseAdmin (service_role) to bypass RLS and read all staff users
      // Must call .auth.signOut() equivalent — service role client has no session by default
      const { data, error } = await supabaseAdmin
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
      console.log('Creating user with:', newUser);
      
      // Check if user already exists
      const { data: existingUser, error: checkError } = await supabaseAdmin
        .from('staff_users')
        .select('email')
        .eq('email', newUser.email)
        .single();

      if (existingUser) {
        throw new Error(`User with email ${newUser.email} already exists`);
      }
      
      // Try using the direct creation function first
      const userId = crypto.randomUUID();
      console.log('Generated user ID:', userId);
      
      const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('create_user_direct', {
        user_id: userId,
        user_email: newUser.email,
        user_password: newUser.password,
        user_full_name: newUser.full_name,
        user_role: newUser.role
      });

      console.log('RPC Result:', { data: rpcData, error: rpcError });

      if (rpcError) {
        // Check if it's a duplicate email error
        if (rpcError.code === '23505' && rpcError.message.includes('email')) {
          throw new Error(`User with email ${newUser.email} already exists`);
        }
        
        console.error('RPC Error:', rpcError);
        
        // Fallback to standard Supabase auth if RPC fails
        console.warn('RPC not available, trying standard auth signup...');
        const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
          email: newUser.email,
          password: newUser.password,
          options: {
            data: {
              full_name: newUser.full_name,
              role: newUser.role
            }
          }
        });

        if (authError) {
          throw new Error(`Email validation failed: ${authError.message}. Try using a valid email format like user@gmail.com`);
        }
        
        console.log('Auth signup successful:', authData);
        
        // Manually create staff_users record since trigger might not have fired
        if (authData?.user?.id) {
          console.log('Creating staff_users record manually for user:', authData.user.id);
          const { error: staffError } = await supabaseAdmin
            .from('staff_users')
            .insert({
              id: authData.user.id,
              full_name: newUser.full_name,
              email: newUser.email,
              role: newUser.role,
              is_active: true
            });
            
          if (staffError) {
            console.error('Error creating staff_users record:', staffError);
            // Try update instead if insert fails (user might already exist)
            const { error: updateError } = await supabaseAdmin
              .from('staff_users')
              .update({
                full_name: newUser.full_name,
                role: newUser.role,
                is_active: true
              })
              .eq('id', authData.user.id);
              
            if (updateError) {
              console.error('Error updating staff_users record:', updateError);
            } else {
              console.log('Staff_users record updated successfully');
            }
          } else {
            console.log('Staff_users record created successfully');
          }
        }
      } else {
        console.log('RPC creation successful:', rpcData);
      }

      // Log user creation to audit logs
      await AuditService.logUserCreated(newUser.email, newUser.role, newUser.full_name);

      alert('User created successfully!');
      setShowAddModal(false);
      setNewUser({ email: '', full_name: '', role: 'conductor', password: '' });
      
      // Force refresh to show the new user
      setTimeout(() => fetchUsers(), 1000);
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Error creating user: ' + error.message);
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      const user = users.find(u => u.id === userId);
      const email = user?.email || 'unknown';
      const newStatus = !currentStatus;

      const { error } = await supabaseAdmin
        .from('staff_users')
        .update({ is_active: newStatus })
        .eq('id', userId);

      if (error) throw error;

      // Log user status change to audit logs
      await AuditService.logUserStatusChanged(userId, email, currentStatus ? 'active' : 'inactive', newStatus ? 'active' : 'inactive');

      fetchUsers();
    } catch (error) {
      console.error('Error updating user status:', error);
      alert('Error updating user status: ' + error.message);
    }
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setEditUser({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      is_active: user.is_active
    });
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('staff_users')
        .update({
          full_name: editUser.full_name,
          email: editUser.email,
          role: editUser.role,
          is_active: editUser.is_active
        })
        .eq('id', editUser.id);

      if (error) throw error;

      alert('User updated successfully!');
      setShowEditModal(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error updating user: ' + error.message);
    }
  };

  const handleDeleteUser = (user) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    try {
      // First delete from auth.users
      const { error: authError } = await supabase.auth.admin.deleteUser(
        selectedUser.id
      );

      if (authError) {
        console.warn('Auth user deletion failed, attempting staff_users deletion:', authError);
      }

      // Then delete from staff_users
      const { error } = await supabase
        .from('staff_users')
        .delete()
        .eq('id', selectedUser.id);

      if (error) throw error;

      alert('User deleted successfully!');
      setShowDeleteModal(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error deleting user: ' + error.message);
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
    operator: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50',
    driver: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    conductor: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    cs_desk: 'bg-green-500/20 text-green-400 border-green-500/50',
  };

  const roleLabels = {
    admin: 'System Admin',
    conductor: 'Conductor',
    cs_desk: 'Customer Service Staff',
  };

  const userTypes = [
    { id: 'all', label: 'All Users', icon: UserCheck },
<<<<<<< HEAD
    { id: 'admin', label: 'Admin Users', icon: Shield },
    { id: 'operator', label: 'Operators', icon: Shield },
    { id: 'driver', label: 'Drivers', icon: UserCheck },
=======
    { id: 'admin', label: 'System Admin', icon: Shield },
    { id: 'cs_desk', label: 'Customer Service Staff', icon: UserCheck },
>>>>>>> 4559f34aad17821beeaf3ff5af0a0853ffb32bb8
    { id: 'conductor', label: 'Conductors', icon: UserCheck },
    { id: 'cs_desk', label: 'Customer Service', icon: UserCheck },
  ];

  const roleCounts = {
    admin: users.filter(u => u.role === 'admin').length,
    operator: users.filter(u => u.role === 'operator').length,
    driver: users.filter(u => u.role === 'driver').length,
    cs_desk: users.filter(u => u.role === 'cs_desk').length,
    conductor: users.filter(u => u.role === 'conductor').length,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Manage Users</h1>
        <p className="text-white/60">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Manage Users</h1>
          <p className="text-white/60">Manage staff users and their roles</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
        >
          <UserPlus size={20} />
          Add User
        </button>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-purple-400" />
            </div>
            <div>
<<<<<<< HEAD
              <p className="text-white/60 text-xs">Admin Users</p>
              <p className="text-white text-lg font-bold">{roleCounts.admin}</p>
=======
              <p className="text-white/60 text-sm">System Admin</p>
              <p className="text-white text-2xl font-bold">{roleCounts.admin}</p>
>>>>>>> 4559f34aad17821beeaf3ff5af0a0853ffb32bb8
            </div>
          </div>
        </div>

<<<<<<< HEAD
        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-white/60 text-xs">Operators</p>
              <p className="text-white text-lg font-bold">{roleCounts.operator}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-white/60 text-xs">Customer Service</p>
              <p className="text-white text-lg font-bold">{roleCounts.cs_desk}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-white/60 text-xs">Conductors</p>
              <p className="text-white text-lg font-bold">{roleCounts.conductor}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-white/60 text-xs">Drivers</p>
              <p className="text-white text-lg font-bold">{roleCounts.driver}</p>
=======
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Customer Service Staff</p>
              <p className="text-white text-2xl font-bold">{roleCounts.cs_desk}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Conductors</p>
              <p className="text-white text-2xl font-bold">{roleCounts.conductor}</p>
>>>>>>> 4559f34aad17821beeaf3ff5af0a0853ffb32bb8
            </div>
          </div>
        </div>
      </div>

      {/* Users Section */}
      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <UserCheck className="text-orange-400" />
          All Staff Users
        </h2>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex gap-2">
            {userTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => setUserType(type.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    userType === type.id
                      ? 'bg-orange-500 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  <Icon size={16} />
                  {type.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={18} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500 text-sm"
            />
          </div>
        </div>

<<<<<<< HEAD
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
                  <td className="py-4">
                    <p className="text-white font-medium">{user.full_name}</p>
                  </td>
                  <td className="py-4">
                    <p className="text-white/70 text-sm">{user.email}</p>
                  </td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded-full text-xs border ${roleColors[user.role] || 'bg-gray-500/20 text-gray-400 border-gray-500/50'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded text-xs ${user.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-4">
                    <p className="text-white/60 text-sm">{new Date(user.created_at).toLocaleDateString()}</p>
                  </td>
                  <td className="py-4">
                    <button
                      onClick={() => handleToggleStatus(user.id, user.is_active)}
                      className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
=======
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {filteredUsers.slice(0, 10).map((user) => (
            <div key={user.id} className="bg-white/5 p-4 rounded-xl">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-white font-medium">{user.full_name}</p>
                  <p className="text-white/60 text-sm">{user.email}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs border ${roleColors[user.role]}`}>
                  {roleLabels[user.role] || user.role}
                </span>
              </div>
              <div className="flex items-center gap-2 text-white/70 text-sm mb-3">
                <span className={`px-2 py-1 rounded text-xs ${user.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className="text-white/60">{new Date(user.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEditUser(user)}
                  className="flex-1 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center justify-center gap-1"
                >
                  <Edit size={14} />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteUser(user)}
                  className="flex-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors flex items-center justify-center gap-1"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          ))}
>>>>>>> 4559f34aad17821beeaf3ff5af0a0853ffb32bb8
        </div>
      </div>

      {/* Add User Modal */}
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
                <label className="text-white/60 text-sm mb-1 block">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                >
<<<<<<< HEAD
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                  <option value="driver">Driver</option>
=======
                  <option value="admin">System Admin</option>
                  <option value="cs_desk">Customer Service Staff</option>
>>>>>>> 4559f34aad17821beeaf3ff5af0a0853ffb32bb8
                  <option value="conductor">Conductor</option>
                  <option value="cs_desk">Customer Service</option>
                </select>
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
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewUser({ email: '', full_name: '', role: 'conductor', password: '' });
                  }}
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

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">Edit User</h2>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="text-white/60 text-sm mb-1 block">Full Name</label>
                <input
                  type="text"
                  required
                  value={editUser.full_name}
                  onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Email</label>
                <input
                  type="email"
                  required
                  value={editUser.email}
                  onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Role</label>
                <select
                  value={editUser.role}
                  onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="admin">System Admin</option>
                  <option value="cs_desk">Customer Service Staff</option>
                  <option value="conductor">Conductor</option>
                </select>
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Status</label>
                <select
                  value={editUser.is_active ? 'true' : 'false'}
                  onChange={(e) => setEditUser({ ...editUser, is_active: e.target.value === 'true' })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                  }}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  Update User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h2 className="text-white text-xl font-bold">Delete User</h2>
            </div>
            <p className="text-white/60 mb-6">
              Are you sure you want to delete <span className="text-white font-medium">{selectedUser.full_name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedUser(null);
                }}
                className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl transition-colors"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;
