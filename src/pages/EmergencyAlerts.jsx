import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Clock, MapPin, Search, Filter, Phone, Mail, User, Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const EmergencyAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState([]);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
    relationship: '',
    is_active: true
  });

  useEffect(() => {
    fetchAlerts();
    fetchContacts();
    // Set up real-time subscription
    const subscription = supabase
      .channel('emergency-alerts-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    const contactsSubscription = supabase
      .channel('emergency-contacts-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_contacts' }, () => {
        fetchContacts();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
      contactsSubscription.unsubscribe();
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('emergency_alerts')
        .select('*, trips(*, buses(*)), conductor_staff:staff_users!conductor_id(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error('Error fetching emergency alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error fetching emergency contacts:', error);
    }
  };

  const handleAcknowledge = async (alertId) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ 
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (error) throw error;
      fetchAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      alert('Error acknowledging alert: ' + error.message);
    }
  };

  const handleResolve = async (alertId) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ 
          status: 'resolved',
          resolved_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (error) throw error;
      fetchAlerts();
    } catch (error) {
      console.error('Error resolving alert:', error);
      alert('Error resolving alert: ' + error.message);
    }
  };

  const handleAddContact = () => {
    setEditingContact(null);
    setContactForm({
      name: '',
      phone: '',
      email: '',
      relationship: '',
      is_active: true
    });
    setShowContactForm(true);
  };

  const handleEditContact = (contact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name,
      phone: contact.phone,
      email: contact.email || '',
      relationship: contact.relationship || '',
      is_active: contact.is_active
    });
    setShowContactForm(true);
  };

  const handleDeleteContact = async (contactId) => {
    if (!confirm('Are you sure you want to delete this emergency contact?')) return;

    try {
      const { error } = await supabase
        .from('emergency_contacts')
        .delete()
        .eq('id', contactId);

      if (error) throw error;
      fetchContacts();
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert('Error deleting contact: ' + error.message);
    }
  };

  const handleSaveContact = async () => {
    try {
      if (!contactForm.name || !contactForm.phone) {
        alert('Name and phone number are required');
        return;
      }

      if (editingContact) {
        const { error } = await supabase
          .from('emergency_contacts')
          .update(contactForm)
          .eq('id', editingContact.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('emergency_contacts')
          .insert(contactForm);

        if (error) throw error;
      }

      setShowContactForm(false);
      setEditingContact(null);
      fetchContacts();
    } catch (error) {
      console.error('Error saving contact:', error);
      alert('Error saving contact: ' + error.message);
    }
  };

  const handleCancelContact = () => {
    setShowContactForm(false);
    setEditingContact(null);
    setContactForm({
      name: '',
      phone: '',
      email: '',
      relationship: '',
      is_active: true
    });
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = alert.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alert.trips?.buses?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alert.conductor_staff?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || alert.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const statusColors = {
    active: 'bg-red-500/20 text-red-400 border-red-500/50',
    acknowledged: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    resolved: 'bg-green-500/20 text-green-400 border-green-500/50',
  };

  const statusIcons = {
    active: AlertTriangle,
    acknowledged: Clock,
    resolved: CheckCircle,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Emergency Alerts</h1>
        <p className="text-white/60">Loading alerts...</p>
      </div>
    );
  }

  const activeCount = alerts.filter(a => a.status === 'active').length;
  const acknowledgedCount = alerts.filter(a => a.status === 'acknowledged').length;
  const resolvedCount = alerts.filter(a => a.status === 'resolved').length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Emergency Alerts</h1>
          <p className="text-white/60">Monitor and manage emergency incidents</p>
        </div>
        <button
          onClick={handleAddContact}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Add Emergency Contact
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 border border-red-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Active Alerts</p>
              <p className="text-white text-2xl font-bold">{activeCount}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 border border-yellow-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Acknowledged</p>
              <p className="text-white text-2xl font-bold">{acknowledgedCount}</p>
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
      </div>

      {/* Emergency Contacts Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white text-xl font-bold">Emergency Contacts</h2>
          <span className="text-white/60 text-sm">{contacts.length} contact(s)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <div key={contact.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{contact.name}</h3>
                    {contact.relationship && (
                      <p className="text-white/60 text-sm">{contact.relationship}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditContact(contact)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteContact(contact.id)}
                    className="text-white/60 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <Phone size={14} />
                  <span>{contact.phone}</span>
                </div>
                {contact.email && (
                  <div className="flex items-center gap-2 text-white/70 text-sm">
                    <Mail size={14} />
                    <span>{contact.email}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-white/10">
                <span className={`text-xs px-2 py-1 rounded-full ${contact.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {contact.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
          {contacts.length === 0 && (
            <div className="col-span-full text-center py-8">
              <User className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/60">No emergency contacts configured</p>
              <button
                onClick={handleAddContact}
                className="mt-3 text-orange-400 hover:text-orange-300 text-sm"
              >
                Add your first emergency contact
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contact Form Modal */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white text-xl font-bold">
                {editingContact ? 'Edit Emergency Contact' : 'Add Emergency Contact'}
              </h2>
              <button
                onClick={handleCancelContact}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-white/80 text-sm mb-2 block">Name *</label>
                <input
                  type="text"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                  placeholder="Contact name"
                />
              </div>

              <div>
                <label className="text-white/80 text-sm mb-2 block">Phone Number *</label>
                <input
                  type="text"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                  placeholder="+639123456789"
                />
              </div>

              <div>
                <label className="text-white/80 text-sm mb-2 block">Email</label>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="text-white/80 text-sm mb-2 block">Relationship</label>
                <input
                  type="text"
                  value={contactForm.relationship}
                  onChange={(e) => setContactForm({ ...contactForm, relationship: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                  placeholder="Family, Friend, etc."
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={contactForm.is_active}
                  onChange={(e) => setContactForm({ ...contactForm, is_active: e.target.checked })}
                  className="w-4 h-4 rounded bg-white/10 border-white/20"
                />
                <label htmlFor="is_active" className="text-white/80 text-sm">Active</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCancelContact}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveContact}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Save size={16} />
                {editingContact ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search alerts..."
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
            <option value="active">Active</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <div className="space-y-4">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => {
              const StatusIcon = statusIcons[alert.status];
              return (
                <div key={alert.id} className={`p-4 rounded-xl border ${statusColors[alert.status]}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10">
                        <StatusIcon size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-bold">Emergency Alert</h3>
                          <span className={`px-2 py-1 rounded-full text-xs border ${statusColors[alert.status]}`}>
                            {alert.status}
                          </span>
                        </div>
                        <p className="text-white/70 mb-2">{alert.notes || 'No description provided'}</p>
                        <div className="flex items-center gap-4 text-white/60 text-sm">
                          <div className="flex items-center gap-2">
                            <MapPin size={14} />
                            <span>{alert.trips?.buses?.plate_number || 'Unknown Bus'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock size={14} />
                            <span>{new Date(alert.created_at).toLocaleString()}</span>
                          </div>
                          {alert.conductor_staff && (
                            <span>Conductor: {alert.conductor_staff.full_name}</span>
                          )}
                        </div>
                        {alert.lat && alert.lng && (
                          <div className="mt-2 text-white/60 text-sm">
                            GPS: {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {alert.status === 'active' && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors"
                        >
                          Acknowledge
                        </button>
                      )}
                      {alert.status === 'acknowledged' && (
                        <button
                          onClick={() => handleResolve(alert.id)}
                          className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12">
              <AlertTriangle className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <p className="text-white/60">No emergency alerts found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmergencyAlerts;
