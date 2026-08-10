import { useState, useEffect } from 'react';
import { CreditCard, Ticket, Plus, Search, Filter, Edit, X, MoreHorizontal, HeadphonesIcon, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CardManagement = () => {
  const [activeTab, setActiveTab] = useState('qr-cards');
  const [qrCards, setQrCards] = useState([]);
  const [tempTickets, setTempTickets] = useState([]);
  const [customerServiceLogs, setCustomerServiceLogs] = useState([]);
  const [cardSalesStats, setCardSalesStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  useEffect(() => {
    fetchData();
    fetchCardSalesStats();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'qr-cards') {
        await fetchQrCards();
      } else if (activeTab === 'temp-tickets') {
        await fetchTempTickets();
      } else if (activeTab === 'customer-service') {
        await fetchCustomerServiceLogs();
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchQrCards = async () => {
    const { data, error } = await supabase
      .from('qr_cards')
      .select('*, issuer:staff_users!issued_by(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    setQrCards(data || []);
  };

  const fetchTempTickets = async () => {
    const { data, error } = await supabase
      .from('temporary_tickets')
      .select('*, issuer:staff_users!issued_by(*), trips(*, buses(*))')
      .order('issued_at', { ascending: false });
    if (error) throw error;
    setTempTickets(data || []);
  };

  const fetchCustomerServiceLogs = async () => {
    const { data, error } = await supabase
      .from('customer_service_logs')
      .select('*, trips(*, buses(*)), handler:staff_users!handled_by(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    setCustomerServiceLogs(data || []);
  };

  const fetchCardSalesStats = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/cards/sales-stats`);
      if (response.ok) {
        const stats = await response.json();
        setCardSalesStats(stats);
      }
    } catch (error) {
      console.error('Error fetching card sales stats:', error);
    }
  };

  const tabs = [
    { id: 'qr-cards', label: 'QR Cards', icon: CreditCard },
    { id: 'temp-tickets', label: 'Temporary Tickets', icon: Ticket },
    { id: 'customer-service', label: 'Customer Service', icon: HeadphonesIcon },
  ];

  const qrCardStatusColors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/50',
    lost: 'bg-red-500/20 text-red-400 border-red-500/50',
    replaced: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    deactivated: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };

  const ticketStatusColors = {
    issued: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    validated: 'bg-green-500/20 text-green-400 border-green-500/50',
    expired: 'bg-red-500/20 text-red-400 border-red-500/50',
  };

  const csActionColors = {
    complaint: 'bg-red-500/20 text-red-400 border-red-500/50',
    inquiry: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    refund: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    lost_card: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    other: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };

  const csActionLabels = {
    complaint: 'Complaint',
    inquiry: 'Inquiry',
    refund: 'Refund',
    lost_card: 'Lost Card',
    other: 'Other',
  };

  const filteredQrCards = qrCards.filter(card => {
    const matchesSearch = card.card_uid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         card.owner_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         card.contact_number?.includes(searchTerm);
    const matchesStatus = filterStatus === 'all' || card.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const filteredTempTickets = tempTickets.filter(ticket => {
    const matchesSearch = ticket.ticket_uid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.passenger_id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const filteredCustomerServiceLogs = customerServiceLogs.filter(log => {
    const matchesSearch = log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.handler?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.trips?.buses?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterType === 'all' || log.action === filterType;
    return matchesSearch && matchesAction;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Card Management</h1>
        <p className="text-white/60">Loading card management data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Card Management</h1>
          <p className="text-white/60">Manage QR cards, temporary tickets, and customer service</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Add New
        </button>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="glass-card p-4 border border-blue-500/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-white/60 text-xs">QR Cards</p>
          </div>
          <p className="text-white text-xl font-bold">{qrCards.length}</p>
          <p className="text-white/40 text-xs">Active: {qrCards.filter(c => c.status === 'active').length}</p>
        </div>

        <div className="glass-card p-4 border border-purple-500/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Ticket className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-white/60 text-xs">Temp Tickets</p>
          </div>
          <p className="text-white text-xl font-bold">{tempTickets.length}</p>
          <p className="text-white/40 text-xs">Validated: {tempTickets.filter(t => t.status === 'validated').length}</p>
        </div>

        <div className="glass-card p-4 border border-orange-500/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <HeadphonesIcon className="w-4 h-4 text-orange-400" />
            </div>
            <p className="text-white/60 text-xs">CS Logs</p>
          </div>
          <p className="text-white text-xl font-bold">{customerServiceLogs.length}</p>
          <p className="text-white/40 text-xs">Today: {customerServiceLogs.filter(t => new Date(t.created_at) > new Date().setHours(0,0,0,0)).length}</p>
        </div>

        <div className="glass-card p-4 border border-emerald-500/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-white/60 text-xs">Card Sales</p>
          </div>
          <p className="text-white text-xl font-bold">{cardSalesStats?.total_cards_sold || 0}</p>
          <p className="text-white/40 text-xs">Revenue: ₱{cardSalesStats?.total_revenue?.toFixed(2) || '0.00'}</p>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="glass-card p-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearchTerm('');
                  setFilterStatus('all');
                  setFilterType('all');
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder={activeTab === 'qr-cards' ? 'Search by card UID or owner name...' :
                       activeTab === 'temp-tickets' ? 'Search by ticket UID or passenger ID...' :
                       'Search by description, handler, or bus...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>
          <select
            value={activeTab === 'customer-service' ? filterType : filterStatus}
            onChange={(e) => {
              if (activeTab === 'customer-service') {
                setFilterType(e.target.value);
              } else {
                setFilterStatus(e.target.value);
              }
            }}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Status</option>
            {activeTab === 'qr-cards' && (
              <>
                <option value="active">Active</option>
                <option value="lost">Lost</option>
                <option value="replaced">Replaced</option>
                <option value="deactivated">Deactivated</option>
              </>
            )}
            {activeTab === 'temp-tickets' && (
              <>
                <option value="issued">Issued</option>
                <option value="validated">Validated</option>
                <option value="expired">Expired</option>
              </>
            )}
            {activeTab === 'customer-service' && (
              <>
                <option value="complaint">Complaint</option>
                <option value="inquiry">Inquiry</option>
                <option value="refund">Refund</option>
                <option value="lost_card">Lost Card</option>
                <option value="other">Other</option>
              </>
            )}
          </select>
        </div>

        {/* QR Cards Table */}
        {activeTab === 'qr-cards' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-white/60 border-b border-white/10">
                  <th className="pb-3 font-medium">Card UID</th>
                  <th className="pb-3 font-medium">Owner Name</th>
                  <th className="pb-3 font-medium">Contact</th>
                  <th className="pb-3 font-medium">Balance</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Issued By</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQrCards.length > 0 ? (
                  filteredQrCards.map((card) => (
                    <tr key={card.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-4 text-white font-medium">{card.card_uid}</td>
                      <td className="py-4 text-white/70">{card.owner_name}</td>
                      <td className="py-4 text-white/70">{card.contact_number || 'N/A'}</td>
                      <td className="py-4 text-white font-medium">₱{parseFloat(card.balance).toFixed(2)}</td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs border ${qrCardStatusColors[card.status]}`}>
                          {card.status}
                        </span>
                      </td>
                      <td className="py-4 text-white/70">{card.issuer?.full_name || 'N/A'}</td>
                      <td className="py-4 text-white/70 text-sm">
                        {new Date(card.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4">
                        <div className="flex gap-2">
                          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <Edit size={16} className="text-white/70" />
                          </button>
                          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <X size={16} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-white/60">
                      No QR cards found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Temporary Tickets Table */}
        {activeTab === 'temp-tickets' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-white/60 border-b border-white/10">
                  <th className="pb-3 font-medium">Ticket UID</th>
                  <th className="pb-3 font-medium">Fare Amount</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Trip/Bus</th>
                  <th className="pb-3 font-medium">Issued By</th>
                  <th className="pb-3 font-medium">Issued At</th>
                  <th className="pb-3 font-medium">Validated At</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTempTickets.length > 0 ? (
                  filteredTempTickets.map((ticket) => (
                    <tr key={ticket.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-4 text-white font-medium">{ticket.ticket_uid}</td>
                      <td className="py-4 text-white font-medium">₱{parseFloat(ticket.fare_amount).toFixed(2)}</td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs border ${ticketStatusColors[ticket.status]}`}>
                          {ticket.status}
                        </span>
                      </td>
                      <td className="py-4 text-white/70">
                        {ticket.trips?.buses?.plate_number || 'N/A'}
                      </td>
                      <td className="py-4 text-white/70">{ticket.issuer?.full_name || 'N/A'}</td>
                      <td className="py-4 text-white/70 text-sm">
                        {new Date(ticket.issued_at).toLocaleString()}
                      </td>
                      <td className="py-4 text-white/70 text-sm">
                        {ticket.validated_at ? new Date(ticket.validated_at).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-4">
                        <div className="flex gap-2">
                          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <Edit size={16} className="text-white/70" />
                          </button>
                          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <X size={16} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-white/60">
                      No temporary tickets found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Customer Service Table */}
        {activeTab === 'customer-service' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-white/60 border-b border-white/10">
                  <th className="pb-3 font-medium">Action</th>
                  <th className="pb-3 font-medium">Description</th>
                  <th className="pb-3 font-medium">Trip/Bus</th>
                  <th className="pb-3 font-medium">Handled By</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomerServiceLogs.length > 0 ? (
                  filteredCustomerServiceLogs.map((log) => (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs border ${csActionColors[log.action]}`}>
                          {csActionLabels[log.action]}
                        </span>
                      </td>
                      <td className="py-4 text-white/70">{log.description}</td>
                      <td className="py-4 text-white/70">{log.trips?.buses?.plate_number || 'N/A'}</td>
                      <td className="py-4 text-white/70">{log.handler?.full_name || 'N/A'}</td>
                      <td className="py-4 text-white/70 text-sm">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-4">
                        <div className="flex gap-2">
                          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <Edit size={16} className="text-white/70" />
                          </button>
                          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <X size={16} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-white/60">
                      No customer service logs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CardManagement;