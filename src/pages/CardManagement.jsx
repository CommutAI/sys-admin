import { useState, useEffect } from 'react';
import { CreditCard, Ticket, Plus, Search, Edit, X, MoreHorizontal, TrendingUp, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import AuditService from '../services/auditService';

const CardManagement = () => {
  const [activeTab, setActiveTab] = useState('qr-cards');
  const [qrCards, setQrCards] = useState([]);
  const [tempTickets, setTempTickets] = useState([]);
  const [cardReservations, setCardReservations] = useState([]);
  const [cardSalesStats, setCardSalesStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    fetchData();
    fetchCardSalesStats();
    // Log page view to audit logs when tab changes
    AuditService.logPageView(`Card Management - ${activeTab}`);
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'qr-cards') {
        await fetchQrCards();
      } else if (activeTab === 'temp-tickets') {
        await fetchTempTickets();
      } else if (activeTab === 'card-reservations') {
        await fetchCardReservations();
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

  const fetchCardReservations = async () => {
    const { data, error } = await supabase
      .from('card_reservations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    setCardReservations(data || []);
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
    { id: 'card-reservations', label: 'Card Reservations', icon: Calendar },
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

  const reservationStatusColors = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    approved: 'bg-green-500/20 text-green-400 border-green-500/50',
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/50',
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

  const filteredCardReservations = cardReservations.filter(reservation => {
    const matchesSearch = reservation.reservation_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         reservation.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         reservation.contact?.includes(searchTerm);
    const matchesStatus = filterStatus === 'all' || reservation.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Get current data based on active tab
  const getCurrentData = () => {
    switch (activeTab) {
      case 'qr-cards': return filteredQrCards;
      case 'temp-tickets': return filteredTempTickets;
      case 'card-reservations': return filteredCardReservations;
      default: return [];
    }
  };

  const currentData = getCurrentData();
  const totalPages = Math.ceil(currentData.length / itemsPerPage);
  const paginatedData = currentData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, activeTab]);

  // Handler functions for card/ticket actions with audit logging
  const handleEditQrCard = async (card) => {
    // Placeholder for edit functionality
    await AuditService.logQrCardUpdated(card.id, `Edit initiated for card ${card.card_uid}`);
    alert('Edit functionality to be implemented');
  };

  const handleDeleteQrCard = async (card) => {
    if (!confirm(`Are you sure you want to delete QR card ${card.card_uid}?`)) return;
    
    try {
      const { error } = await supabase
        .from('qr_cards')
        .delete()
        .eq('id', card.id);

      if (error) throw error;

      await AuditService.logQrCardDeleted(card.id, card.card_uid);
      fetchQrCards();
    } catch (error) {
      console.error('Error deleting QR card:', error);
      alert('Error deleting QR card: ' + error.message);
    }
  };

  const handleEditTempTicket = async (ticket) => {
    // Placeholder for edit functionality
    await AuditService.logTempTicketValidated(ticket.id, ticket.ticket_uid);
    alert('Edit functionality to be implemented');
  };

  const handleDeleteTempTicket = async (ticket) => {
    if (!confirm(`Are you sure you want to delete temporary ticket ${ticket.ticket_uid}?`)) return;

    try {
      const { error } = await supabase
        .from('temporary_tickets')
        .delete()
        .eq('id', ticket.id);

      if (error) throw error;

      await AuditService.logAuditEvent({
        action: 'DELETE',
        module: 'Card Management',
        details: `Deleted temporary ticket ${ticket.ticket_uid} (${ticket.id})`,
      });

      fetchTempTickets();
    } catch (error) {
      console.error('Error deleting temporary ticket:', error);
      alert('Error deleting temporary ticket: ' + error.message);
    }
  };

  const handleEditReservation = async (reservation) => {
    // Placeholder for edit functionality
    await AuditService.logAuditEvent({
      action: 'UPDATE',
      module: 'Card Management',
      details: `Edit initiated for reservation ${reservation.reservation_id}`,
    });
    alert('Edit functionality to be implemented');
  };

  const handleDeleteReservation = async (reservation) => {
    if (!confirm(`Are you sure you want to delete reservation ${reservation.reservation_id}?`)) return;

    try {
      const { error } = await supabase
        .from('card_reservations')
        .delete()
        .eq('id', reservation.id);

      if (error) throw error;

      await AuditService.logAuditEvent({
        action: 'DELETE',
        module: 'Card Management',
        details: `Deleted reservation ${reservation.reservation_id} (${reservation.id})`,
      });

      fetchCardReservations();
    } catch (error) {
      console.error('Error deleting reservation:', error);
      alert('Error deleting reservation: ' + error.message);
    }
  };

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
          <p className="text-white/60">Manage QR cards, temporary tickets, and card reservations</p>
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <Calendar className="w-4 h-4 text-orange-400" />
            </div>
            <p className="text-white/60 text-xs">Reservations</p>
          </div>
          <p className="text-white text-xl font-bold">{cardReservations.length}</p>
          <p className="text-white/40 text-xs">Pending: {cardReservations.filter(r => r.status === 'pending').length}</p>
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
                       'Search by reservation ID, name, or contact...'}
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
            {activeTab === 'card-reservations' && (
              <>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
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
                {paginatedData.length > 0 ? (
                  paginatedData.map((card) => (
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
                          <button
                            onClick={() => handleEditQrCard(card)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <Edit size={16} className="text-white/70" />
                          </button>
                          <button
                            onClick={() => handleDeleteQrCard(card)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          >
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                <p className="text-white/60 text-sm">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, currentData.length)} of {currentData.length} cards
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
                {paginatedData.length > 0 ? (
                  paginatedData.map((ticket) => (
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
                          <button
                            onClick={() => handleEditTempTicket(ticket)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <Edit size={16} className="text-white/70" />
                          </button>
                          <button
                            onClick={() => handleDeleteTempTicket(ticket)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          >
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                <p className="text-white/60 text-sm">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, currentData.length)} of {currentData.length} tickets
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
        )}

        {/* Card Reservations Table */}
        {activeTab === 'card-reservations' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-white/60 border-b border-white/10">
                  <th className="pb-3 font-medium">Reservation ID</th>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Contact</th>
                  <th className="pb-3 font-medium">Card Type</th>
                  <th className="pb-3 font-medium">Pickup Terminal</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length > 0 ? (
                  paginatedData.map((reservation) => (
                    <tr key={reservation.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-4 text-white font-medium">{reservation.reservation_id}</td>
                      <td className="py-4 text-white/70">{reservation.name}</td>
                      <td className="py-4 text-white/70">{reservation.contact}</td>
                      <td className="py-4 text-white/70">{reservation.card_type}</td>
                      <td className="py-4 text-white/70">{reservation.pickup_terminal}</td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs border ${reservationStatusColors[reservation.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/50'}`}>
                          {reservation.status}
                        </span>
                      </td>
                      <td className="py-4 text-white/70 text-sm">
                        {new Date(reservation.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditReservation(reservation)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <Edit size={16} className="text-white/70" />
                          </button>
                          <button
                            onClick={() => handleDeleteReservation(reservation)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <X size={16} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-white/60">
                      No card reservations found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                <p className="text-white/60 text-sm">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, currentData.length)} of {currentData.length} reservations
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
        )}
      </div>
    </div>
  );
};

export default CardManagement;