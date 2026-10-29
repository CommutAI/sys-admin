import { useState, useEffect } from 'react';
import { UserPlus, Search, Edit, Trash2, Shield, UserCheck, ChevronLeft, ChevronRight, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import AuditService from '../services/auditService';

const ManageUsers = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    role: 'conductor',
    password: '',
    branch: '',
    phone: '',
    license_number: '',
    license_expiry: '',
    emergency_contact: ''
  });
  const [editUser, setEditUser] = useState({
    id: '',
    full_name: '',
    email: '',
    role: 'conductor',
    is_active: true,
    branch: '',
    phone: '',
    license_number: '',
    license_expiry: '',
    emergency_contact: ''
  });

  useEffect(() => {
    fetchUsers();
    AuditService.logPageView('Manage Users');
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
      const { data: existingUser } = await supabase
        .from('staff_users')
        .select('email')
        .eq('email', newUser.email)
        .single();

      if (existingUser) {
        throw new Error(`User with email ${newUser.email} already exists`);
      }

      const userId = crypto.randomUUID();

      // Create user in auth.users first
      console.log('Creating auth user for:', newUser.email);
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newUser.email,
        password: newUser.password,
        email_confirm: true,
        user_metadata: {
          full_name: newUser.full_name,
          role: newUser.role
        }
      });

      if (authError) {
        console.error('Auth user creation error:', authError);
        console.error('Error details:', JSON.stringify(authError, null, 2));

        // Check for common issues
        if (authError.message.includes('User not allowed') || authError.message.includes('Email not allowed')) {
          throw new Error(`Email domain is not allowed. Please check Supabase Authentication settings → Email Settings and add "${newUser.email.split('@')[1]}" to allowed domains.`);
        }

        throw new Error(`Failed to create auth user: ${authError.message}`);
      }

      const authUserId = authData.user.id;
      console.log('Auth user created successfully, ID:', authUserId);

      // Then create user in staff_users table
      const { error: insertError } = await supabase
        .from('staff_users')
        .insert({
          id: authUserId,
          email: newUser.email,
          full_name: newUser.full_name,
          role: newUser.role,
          is_active: true,
          branch: newUser.role === 'cs_desk' ? newUser.branch : null,
          phone: newUser.phone || null,
          license_number: newUser.role === 'driver' ? newUser.license_number : null,
          license_expiry: newUser.role === 'driver' ? newUser.license_expiry : null,
          emergency_contact: newUser.emergency_contact || null
        });

      if (insertError) {
        console.error('Staff users insert error:', insertError);
        // Rollback: delete from auth.users if staff_users insert fails
        await supabase.auth.admin.deleteUser(authUserId);
        throw new Error(`Failed to create staff user: ${insertError.message}`);
      }

      console.log('User created successfully in both auth.users and staff_users');

      await AuditService.logUserCreated(newUser.email, newUser.role, newUser.full_name);

      setSuccessMessage('User created successfully!');
      setShowSuccessModal(true);
      setShowAddModal(false);
      setNewUser({ email: '', full_name: '', role: 'conductor', password: '', branch: '', phone: '', license_number: '', license_expiry: '', emergency_contact: '' });
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

      const { error } = await supabase
        .from('staff_users')
        .update({ is_active: newStatus })
        .eq('id', userId);

      if (error) throw error;

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
      is_active: user.is_active,
      branch: user.branch || '',
      phone: user.phone || '',
      license_number: user.license_number || '',
      license_expiry: user.license_expiry || '',
      emergency_contact: user.emergency_contact || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      // Update auth.users metadata
      const { error: authError } = await supabase.auth.admin.updateUserById(
        editUser.id,
        {
          email: editUser.email,
          user_metadata: {
            full_name: editUser.full_name,
            role: editUser.role
          }
        }
      );

      if (authError) {
        console.warn('Auth user update failed:', authError);
        // Continue with staff_users update even if auth update fails
      }

      // Update staff_users table
      const { error } = await supabase
        .from('staff_users')
        .update({
          full_name: editUser.full_name,
          email: editUser.email,
          role: editUser.role,
          is_active: editUser.is_active,
          branch: editUser.role === 'cs_desk' ? editUser.branch : null,
          phone: editUser.phone || null,
          license_number: editUser.role === 'driver' ? editUser.license_number : null,
          license_expiry: editUser.role === 'driver' ? editUser.license_expiry : null,
          emergency_contact: editUser.emergency_contact || null
        })
        .eq('id', editUser.id);

      if (error) throw error;

      setSuccessMessage('User updated successfully!');
      setShowSuccessModal(true);
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
      console.log('Attempting to delete user:', selectedUser.id, selectedUser.email);

      // Try to delete from auth.users first
      try {
        const { error: authError } = await supabase.auth.admin.deleteUser(selectedUser.id);
        if (authError) {
          console.warn('Auth user deletion failed (user may not exist in auth.users):', authError);
          // This is expected for orphaned records - continue with staff_users deletion
        } else {
          console.log('Auth user deleted successfully');
        }
      } catch (authErr) {
        console.warn('Auth deletion threw exception:', authErr);
        // Continue with staff_users deletion
      }

      // Delete from staff_users table
      const { error: staffError } = await supabase
        .from('staff_users')
        .delete()
        .eq('id', selectedUser.id);

      if (staffError) {
        console.error('Staff users deletion failed:', staffError);
        throw new Error(`Failed to delete staff user: ${staffError.message}`);
      }

      console.log('Staff user deleted successfully');

      setSuccessMessage('User deleted successfully!');
      setShowSuccessModal(true);
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
    return matchesSearch;
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const roleColors = {
    admin: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    operator: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50',
    driver: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    conductor: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    cs_desk: 'bg-green-500/20 text-green-400 border-green-500/50',
  };

  const roleLabels = {
    admin: 'System Admin',
    operator: 'Operator',
    driver: 'Driver',
    conductor: 'Conductor',
    cs_desk: 'Customer Service Staff',
  };

  const roleCounts = {
    admin: users.filter(u => u.role === 'admin').length,
    operator: users.filter(u => u.role === 'operator').length,
    driver: users.filter(u => u.role === 'driver').length,
    conductor: users.filter(u => u.role === 'conductor').length,
    cs_desk: users.filter(u => u.role === 'cs_desk').length,
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
              <p className="text-white/60 text-xs">System Admin</p>
              <p className="text-white text-lg font-bold">{roleCounts.admin}</p>
            </div>
          </div>
        </div>

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
            <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-white/60 text-xs">Drivers</p>
              <p className="text-white text-lg font-bold">{roleCounts.driver}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-white/60 text-xs">Conductors</p>
              <p className="text-white text-lg font-bold">{roleCounts.conductor}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-white/60 text-xs">Customer Service</p>
              <p className="text-white text-lg font-bold">{roleCounts.cs_desk}</p>
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
        <div className="mb-4">
          <div className="relative">
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

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-white/60 text-sm py-3 px-4">Name</th>
                <th className="text-left text-white/60 text-sm py-3 px-4">Email</th>
                <th className="text-left text-white/60 text-sm py-3 px-4">Role</th>
                <th className="text-left text-white/60 text-sm py-3 px-4">Branch</th>
                <th className="text-left text-white/60 text-sm py-3 px-4">Status</th>
                <th className="text-left text-white/60 text-sm py-3 px-4">Created</th>
                <th className="text-left text-white/60 text-sm py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="text-white py-3 px-4">{user.full_name}</td>
                  <td className="text-white/70 py-3 px-4">{user.email}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs border ${roleColors[user.role] || 'bg-gray-500/20 text-gray-400 border-gray-500/50'}`}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="text-white/70 py-3 px-4">
                    {user.role === 'cs_desk' ? (
                      user.branch === 'manolo_fortich_terminal' ? 'Manolo Fortich' :
                      user.branch === 'agora_terminal' ? 'Agora' : '-'
                    ) : '-'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs ${user.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-white/60 py-3 px-4">{new Date(user.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="p-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
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
            <p className="text-white/60 text-sm">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} users
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-sm transition-colors ${
                      currentPage === page
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white/70'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
                  <option value="admin">System Admin</option>
                  <option value="operator">Operator</option>
                  <option value="driver">Driver</option>
                  <option value="conductor">Conductor</option>
                  <option value="cs_desk">Customer Service Staff</option>
                </select>
              </div>
              {newUser.role === 'cs_desk' && (
                <div>
                  <label className="text-white/60 text-sm mb-1 block">Branch</label>
                  <select
                    value={newUser.branch}
                    onChange={(e) => setNewUser({ ...newUser, branch: e.target.value })}
                    className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="">Select Branch</option>
                    <option value="manolo_fortich_terminal">Manolo Fortich Terminal</option>
                    <option value="agora_terminal">Agora Terminal</option>
                  </select>
                </div>
              )}
              <div>
                <label className="text-white/60 text-sm mb-1 block">Phone</label>
                <input
                  type="text"
                  value={newUser.phone}
                  onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              {newUser.role === 'driver' && (
                <>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">License Number</label>
                    <input
                      type="text"
                      value={newUser.license_number}
                      onChange={(e) => setNewUser({ ...newUser, license_number: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">License Expiry</label>
                    <input
                      type="date"
                      value={newUser.license_expiry}
                      onChange={(e) => setNewUser({ ...newUser, license_expiry: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-white/60 text-sm mb-1 block">Emergency Contact</label>
                <input
                  type="text"
                  value={newUser.emergency_contact}
                  onChange={(e) => setNewUser({ ...newUser, emergency_contact: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewUser({ email: '', full_name: '', role: 'conductor', password: '', branch: '', phone: '', license_number: '', license_expiry: '', emergency_contact: '' });
                  }}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors"
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
          <div className="glass-card p-6 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
                  className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="admin">System Admin</option>
                  <option value="operator">Operator</option>
                  <option value="driver">Driver</option>
                  <option value="conductor">Conductor</option>
                  <option value="cs_desk">Customer Service Staff</option>
                </select>
              </div>
              {editUser.role === 'cs_desk' && (
                <div>
                  <label className="text-white/60 text-sm mb-1 block">Branch</label>
                  <select
                    value={editUser.branch}
                    onChange={(e) => setEditUser({ ...editUser, branch: e.target.value })}
                    className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="">Select Branch</option>
                    <option value="manolo_fortich_terminal">Manolo Fortich Terminal</option>
                    <option value="agora_terminal">Agora Terminal</option>
                  </select>
                </div>
              )}
              <div>
                <label className="text-white/60 text-sm mb-1 block">Phone</label>
                <input
                  type="text"
                  value={editUser.phone}
                  onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              {editUser.role === 'driver' && (
                <>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">License Number</label>
                    <input
                      type="text"
                      value={editUser.license_number}
                      onChange={(e) => setEditUser({ ...editUser, license_number: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">License Expiry</label>
                    <input
                      type="date"
                      value={editUser.license_expiry}
                      onChange={(e) => setEditUser({ ...editUser, license_expiry: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-white/60 text-sm mb-1 block">Emergency Contact</label>
                <input
                  type="text"
                  value={editUser.emergency_contact}
                  onChange={(e) => setEditUser({ ...editUser, emergency_contact: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editUser.is_active}
                  onChange={(e) => setEditUser({ ...editUser, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isActive" className="text-white/60 text-sm">Active</label>
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
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors"
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
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Confirm Delete</h2>
            </div>

            <div className="mb-6">
              <p className="text-white/80 mb-2">
                Are you sure you want to delete this user?
              </p>
              <p className="text-white/60 text-sm">
                {selectedUser.full_name} ({selectedUser.email})
              </p>
              <p className="text-red-400 text-sm mt-2">This action cannot be undone.</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Success</h2>
            </div>

            <div className="mb-6">
              <p className="text-white/80">
                {successMessage}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSuccessModal(false)}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;
