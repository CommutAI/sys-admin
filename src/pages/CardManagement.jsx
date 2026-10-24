import { useState, useEffect } from 'react';
import { CreditCard, Ticket, Plus, Search, Edit, X, MoreHorizontal, TrendingUp, Calendar, ChevronLeft, ChevronRight, Check, AlertCircle, Trash2 } from 'lucide-react';
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

  // Approval/Decline Modal State
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [approvalAction, setApprovalAction] = useState(null); // 'approve' or 'decline'
  const [declineReason, setDeclineReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'qr-card' | 'temp-ticket' | 'reservation', item: object }
  const [isDeleting, setIsDeleting] = useState(false);

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
    declined: 'bg-red-500/20 text-red-400 border-red-500/50',
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
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
    setDeleteTarget({ type: 'qr-card', item: card });
    setShowDeleteModal(true);
  };

  const handleDeleteTempTicket = async (ticket) => {
    setDeleteTarget({ type: 'temp-ticket', item: ticket });
    setShowDeleteModal(true);
  };

  const handleDeleteReservation = async (reservation) => {
    setDeleteTarget({ type: 'reservation', item: reservation });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'qr-card') {
        const card = deleteTarget.item;
        const { error } = await supabase
          .from('qr_cards')
          .delete()
          .eq('id', card.id);

        if (error) throw error;

        await AuditService.logQrCardDeleted(card.id, card.card_uid);
        fetchQrCards();
      } else if (deleteTarget.type === 'temp-ticket') {
        const ticket = deleteTarget.item;
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
      } else if (deleteTarget.type === 'reservation') {
        const reservation = deleteTarget.item;
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
      }

      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Error deleting item: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditTempTicket = async (ticket) => {
    // Placeholder for edit functionality
    await AuditService.logTempTicketValidated(ticket.id, ticket.ticket_uid);
    alert('Edit functionality to be implemented');
  };

  const handleApproveReservation = async (reservation) => {
    setSelectedReservation(reservation);
    setApprovalAction('approve');
    setDeclineReason('');
    setShowApprovalModal(true);
  };

  const handleDeclineReservation = async (reservation) => {
    setSelectedReservation(reservation);
    setApprovalAction('decline');
    setDeclineReason('');
    setShowApprovalModal(true);
  };

  const confirmApproval = async () => {
    if (!selectedReservation) return;

    setIsProcessing(true);
    try {
      if (approvalAction === 'approve') {
        const { error } = await supabase
          .from('card_reservations')
          .update({ status: 'approved' })
          .eq('id', selectedReservation.id);

        if (error) throw error;

        await AuditService.logAuditEvent({
          action: 'APPROVE',
          module: 'Card Management',
          details: `Approved card reservation ${selectedReservation.reservation_id} for ${selectedReservation.name}`,
        });

        // Send SMS notification
        try {
          const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
          await fetch(`${API_URL}/api/sms/card-approval`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone_number: selectedReservation.contact,
              card_id: selectedReservation.reservation_id,
              card_holder: selectedReservation.name,
              status: 'approved'
            })
          });
        } catch (smsError) {
          console.error('Failed to send SMS notification:', smsError);
        }
      } else if (approvalAction === 'decline') {
        const { error } = await supabase
          .from('card_reservations')
          .update({ status: 'declined', decline_reason: declineReason || 'No reason provided' })
          .eq('id', selectedReservation.id);

        if (error) throw error;

        await AuditService.logAuditEvent({
          action: 'DECLINE',
          module: 'Card Management',
          details: `Declined card reservation ${selectedReservation.reservation_id} for ${selectedReservation.name}. Reason: ${declineReason || 'No reason'}`,
        });

        // Send SMS notification
        try {
          const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
          await fetch(`${API_URL}/api/sms/card-approval`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone_number: selectedReservation.contact,
              card_id: selectedReservation.reservation_id,
              card_holder: selectedReservation.name,
              status: 'declined',
              reason: declineReason || 'No reason provided'
            })
          });
        } catch (smsError) {
          console.error('Failed to send SMS notification:', smsError);
        }
      }

      fetchCardReservations();
      setShowApprovalModal(false);
      setSelectedReservation(null);
    } catch (error) {
      console.error('Error processing reservation:', error);
      alert('Error processing reservation: ' + error.message);
    } finally {
      setIsProcessing(false);
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
                            <Trash2 size={16} className="text-red-400" />
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
                            <Trash2 size={16} className="text-red-400" />
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
                  <th className="pb-3 font-medium">Reason</th>
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
                        {reservation.decline_reason || '-'}
                      </td>
                      <td className="py-4 text-white/70 text-sm">
                        {new Date(reservation.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4">
                        <div className="flex gap-2">
                          {reservation.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApproveReservation(reservation)}
                                className="p-2 hover:bg-green-500/20 rounded-lg transition-colors"
                                title="Approve"
                              >
                                <Check size={16} className="text-green-400" />
                              </button>
                              <button
                                onClick={() => handleDeclineReservation(reservation)}
                                className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                                title="Decline"
                              >
                                <X size={16} className="text-red-400" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDeleteReservation(reservation)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9" className="py-8 text-center text-white/60">
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

      {/* Approval/Decline Modal */}
      {showApprovalModal && selectedReservation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card rounded-2xl p-6 max-w-md w-full mx-4 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              {approvalAction === 'approve' ? (
                <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-400" />
                </div>
              ) : (
                <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
              )}
              <h2 className="text-xl font-bold text-white">
                {approvalAction === 'approve' ? 'Approve Reservation' : 'Decline Reservation'}
              </h2>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Reservation ID:</span>
                <span className="text-white font-medium">{selectedReservation.reservation_id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Name:</span>
                <span className="text-white font-medium">{selectedReservation.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Contact:</span>
                <span className="text-white font-medium">{selectedReservation.contact}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Card Type:</span>
                <span className="text-white font-medium">{selectedReservation.card_type}</span>
              </div>
            </div>

            {approvalAction === 'decline' && (
              <div className="mb-6">
                <label className="block text-white/60 text-sm mb-2">
                  Reason for declining (optional):
                </label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Enter reason for declining this reservation..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-orange-500/50 resize-none"
                  rows="3"
                />
              </div>
            )}

            <p className="text-white/60 text-sm mb-6">
              {approvalAction === 'approve'
                ? 'This will approve the reservation and send an SMS notification to the contact number.'
                : 'This will decline the reservation and send an SMS notification with the reason.'}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowApprovalModal(false);
                  setSelectedReservation(null);
                  setDeclineReason('');
                }}
                disabled={isProcessing}
                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmApproval}
                disabled={isProcessing}
                className={`flex-1 px-4 py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  approvalAction === 'approve'
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {isProcessing ? 'Processing...' : approvalAction === 'approve' ? 'Approve' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card rounded-2xl p-6 max-w-md w-full mx-4 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Confirm Delete</h2>
            </div>

            <div className="mb-6">
              <p className="text-white/80 mb-2">
                Are you sure you want to delete this {deleteTarget.type === 'qr-card' ? 'QR card' : deleteTarget.type === 'temp-ticket' ? 'temporary ticket' : 'reservation'}?
              </p>
              {deleteTarget.type === 'qr-card' && (
                <p className="text-white/60 text-sm">
                  Card ID: <span className="text-white font-medium">{deleteTarget.item.card_uid}</span>
                </p>
              )}
              {deleteTarget.type === 'temp-ticket' && (
                <p className="text-white/60 text-sm">
                  Ticket ID: <span className="text-white font-medium">{deleteTarget.item.ticket_uid}</span>
                </p>
              )}
              {deleteTarget.type === 'reservation' && (
                <p className="text-white/60 text-sm">
                  Reservation ID: <span className="text-white font-medium">{deleteTarget.item.reservation_id}</span>
                </p>
              )}
              <p className="text-red-400 text-sm mt-2">This action cannot be undone.</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                }}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardManagement;