import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, TrendingUp, Users, DollarSign, Bus, Activity, ArrowUp, ArrowDown, ArrowLeftRight, Search, Filter, MoreHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Reports = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [reportType, setReportType] = useState('trips');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalTrips: 0,
    totalPassengers: 0,
    activeBuses: 0,
    revenueGrowth: 0,
    tripGrowth: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  
  // Transaction state
  const [transactions, setTransactions] = useState([]);
  const [transactionSearchTerm, setTransactionSearchTerm] = useState('');
  const [transactionFilterType, setTransactionFilterType] = useState('all');
  const [showTransactions, setShowTransactions] = useState(false);
  
  // GCash transaction state
  const [gcashTransactions, setGcashTransactions] = useState([]);
  const [gcashSearchTerm, setGcashSearchTerm] = useState('');
  const [gcashFilterStatus, setGcashFilterStatus] = useState('all');
  const [showGcashTransactions, setShowGcashTransactions] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();
  }, []);

  const fetchStats = async () => {
    try {
      const [revenueData, tripsData, passengersData, busesData] = await Promise.all([
        supabase.from('transactions').select('amount').eq('status', 'completed'),
        supabase.from('trips').select('*'),
        supabase.from('passenger_counts').select('count'),
        supabase.from('buses').select('*').eq('status', 'active'),
      ]);

      const totalRevenue = (revenueData.data || []).reduce((sum, t) => sum + (t.amount || 0), 0);
      const totalTrips = tripsData.data?.length || 0;
      const totalPassengers = (passengersData.data || []).reduce((sum, p) => sum + (p.count || 0), 0);
      const activeBuses = busesData.data?.length || 0;

      setStats({
        totalRevenue,
        totalTrips,
        totalPassengers,
        activeBuses,
        revenueGrowth: 12.5,
        tripGrowth: 8.3,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const { data } = await supabase
        .from('trips')
        .select('*, buses(*), conductor_staff:staff_users(*)')
        .order('started_at', { ascending: false })
        .limit(5);

      setRecentActivity(data || []);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, staff:staff_users(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const transactionTypeColors = {
    fare_validation: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    balance_topup: 'bg-green-500/20 text-green-400 border-green-500/50',
    card_issuance: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  };

  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = transaction.channel?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                         transaction.staff?.full_name?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                         transaction.fare?.toString().includes(transactionSearchTerm) ||
                         transaction.baggage?.toString().includes(transactionSearchTerm);
    const matchesType = transactionFilterType === 'all' || transaction.type === transactionFilterType;
    return matchesSearch && matchesType;
  });

  const fetchGcashTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('gcash_transactions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setGcashTransactions(data || []);
    } catch (error) {
      console.error('Error fetching GCash transactions:', error);
    }
  };

  const gcashStatusColors = {
    completed: 'bg-green-500/20 text-green-400 border-green-500/50',
    failed: 'bg-red-500/20 text-red-400 border-red-500/50',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  };

  const filteredGcashTransactions = gcashTransactions.filter(transaction => {
    const matchesSearch = transaction.phone_number?.includes(gcashSearchTerm) ||
                         transaction.stripe_payment_id?.toLowerCase().includes(gcashSearchTerm.toLowerCase());
    const matchesStatus = gcashFilterStatus === 'all' || transaction.status === gcashFilterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleExportExcel = async () => {
    setLoading(true);
    try {
      let data = [];
      let fileName = '';

      switch (reportType) {
        case 'trips':
          const { data: trips } = await supabase
            .from('trips')
            .select('*, buses(*), conductor_staff:staff_users(*)')
            .gte('started_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('started_at', dateRange.end || new Date().toISOString())
            .order('started_at', { ascending: false });

          data = (trips || []).map(trip => ({
            'Trip ID': trip.id,
            'Bus Plate': trip.buses?.plate_number,
            'Route': trip.buses?.route,
            'Conductor': trip.conductor_staff?.full_name,
            'Start Time': new Date(trip.started_at).toLocaleString(),
            'End Time': trip.ended_at ? new Date(trip.ended_at).toLocaleString() : 'N/A',
            'Status': trip.status,
            'GPS Latitude': trip.current_lat || 'N/A',
            'GPS Longitude': trip.current_lng || 'N/A',
          }));
          fileName = 'trips_report';
          break;

        case 'passengers':
          const { data: passengerCounts } = await supabase
            .from('passenger_counts')
            .select('*, trips(*, buses(*))')
            .gte('recorded_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('recorded_at', dateRange.end || new Date().toISOString())
            .order('recorded_at', { ascending: false });

          data = (passengerCounts || []).map(pc => ({
            'Count ID': pc.id,
            'Trip ID': pc.trip_id,
            'Bus Plate': pc.trips?.buses?.plate_number,
            'Route': pc.trips?.buses?.route,
            'Count': pc.count,
            'AI Count': pc.ai_count || 'N/A',
            'Source': pc.source,
            'Recorded At': new Date(pc.recorded_at).toLocaleString(),
          }));
          fileName = 'passenger_counts_report';
          break;

        case 'revenue':
          const { data: transactions } = await supabase
            .from('transactions')
            .select('*, trips(*, buses(*))')
            .gte('created_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('created_at', dateRange.end || new Date().toISOString())
            .order('created_at', { ascending: false });

          data = (transactions || []).map(tx => ({
            'Transaction ID': tx.id,
            'Type': tx.type,
            'Amount': tx.amount,
            'Channel': tx.channel,
            'Bus Plate': tx.trips?.buses?.plate_number,
            'Route': tx.trips?.buses?.route,
            'Created At': new Date(tx.created_at).toLocaleString(),
          }));
          fileName = 'revenue_report';
          break;

        case 'buses':
          const { data: buses } = await supabase
            .from('buses')
            .select('*')
            .order('created_at', { ascending: false });

          data = (buses || []).map(bus => ({
            'Bus ID': bus.id,
            'Plate Number': bus.plate_number,
            'Route': bus.route,
            'Seat Capacity': bus.seat_capacity,
            'Status': bus.status,
            'Created At': new Date(bus.created_at).toLocaleString(),
          }));
          fileName = 'buses_report';
          break;

        case 'irregularities':
          const { data: irregularities } = await supabase
            .from('fare_irregularities')
            .select('*, trips(*, buses(*))')
            .gte('detected_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('detected_at', dateRange.end || new Date().toISOString())
            .order('detected_at', { ascending: false });

          data = (irregularities || []).map(irr => ({
            'Irregularity ID': irr.id,
            'Type': irr.type,
            'Description': irr.description,
            'Bus Plate': irr.trips?.buses?.plate_number,
            'Route': irr.trips?.buses?.route,
            'Detected At': new Date(irr.detected_at).toLocaleString(),
            'Resolved': irr.resolved ? 'Yes' : 'No',
            'Resolved At': irr.resolved_at ? new Date(irr.resolved_at).toLocaleString() : 'N/A',
          }));
          fileName = 'fare_irregularities_report';
          break;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);

    } catch (error) {
      console.error('Error exporting Excel:', error);
      alert('Error exporting report: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    setLoading(true);
    try {
      let data = [];
      let fileName = '';
      let columns = [];

      switch (reportType) {
        case 'trips':
          const { data: trips } = await supabase
            .from('trips')
            .select('*, buses(*), conductor_staff:staff_users(*)')
            .gte('started_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('started_at', dateRange.end || new Date().toISOString())
            .order('started_at', { ascending: false });

          data = (trips || []).map(trip => [
            trip.buses?.plate_number || 'N/A',
            trip.buses?.route || 'N/A',
            trip.conductor_staff?.full_name || 'N/A',
            new Date(trip.started_at).toLocaleString(),
            trip.ended_at ? new Date(trip.ended_at).toLocaleString() : 'N/A',
            trip.status,
          ]);
          columns = ['Bus Plate', 'Route', 'Conductor', 'Start Time', 'End Time', 'Status'];
          fileName = 'trips_report';
          break;

        case 'passengers':
          const { data: passengerCounts } = await supabase
            .from('passenger_counts')
            .select('*, trips(*, buses(*))')
            .gte('recorded_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('recorded_at', dateRange.end || new Date().toISOString())
            .order('recorded_at', { ascending: false });

          data = (passengerCounts || []).map(pc => [
            pc.trips?.buses?.plate_number || 'N/A',
            pc.trips?.buses?.route || 'N/A',
            pc.count,
            pc.ai_count || 'N/A',
            pc.source,
            new Date(pc.recorded_at).toLocaleString(),
          ]);
          columns = ['Bus Plate', 'Route', 'Count', 'AI Count', 'Source', 'Recorded At'];
          fileName = 'passenger_counts_report';
          break;

        case 'revenue':
          const { data: transactions } = await supabase
            .from('transactions')
            .select('*, trips(*, buses(*))')
            .gte('created_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('created_at', dateRange.end || new Date().toISOString())
            .order('created_at', { ascending: false });

          data = (transactions || []).map(tx => [
            tx.type,
            tx.amount,
            tx.channel,
            tx.trips?.buses?.plate_number || 'N/A',
            tx.trips?.buses?.route || 'N/A',
            new Date(tx.created_at).toLocaleString(),
          ]);
          columns = ['Type', 'Amount', 'Channel', 'Bus Plate', 'Route', 'Created At'];
          fileName = 'revenue_report';
          break;

        case 'buses':
          const { data: buses } = await supabase
            .from('buses')
            .select('*')
            .order('created_at', { ascending: false });

          data = (buses || []).map(bus => [
            bus.plate_number,
            bus.route,
            bus.seat_capacity,
            bus.status,
            new Date(bus.created_at).toLocaleString(),
          ]);
          columns = ['Plate Number', 'Route', 'Seat Capacity', 'Status', 'Created At'];
          fileName = 'buses_report';
          break;

        case 'irregularities':
          const { data: irregularities } = await supabase
            .from('fare_irregularities')
            .select('*, trips(*, buses(*))')
            .gte('detected_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('detected_at', dateRange.end || new Date().toISOString())
            .order('detected_at', { ascending: false });

          data = (irregularities || []).map(irr => [
            irr.type,
            irr.description,
            irr.trips?.buses?.plate_number || 'N/A',
            irr.trips?.buses?.route || 'N/A',
            new Date(irr.detected_at).toLocaleString(),
            irr.resolved ? 'Yes' : 'No',
          ]);
          columns = ['Type', 'Description', 'Bus Plate', 'Route', 'Detected At', 'Resolved'];
          fileName = 'fare_irregularities_report';
          break;
      }

      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text(`${reportType.replace('_', ' ').toUpperCase()} Report`, 14, 22);
      doc.setFontSize(11);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

      autoTable(doc, {
        head: [columns],
        body: data,
        startY: 40,
        theme: 'grid',
        headStyles: { fillColor: [249, 115, 22] },
        styles: { fontSize: 8 },
      });

      doc.save(`${fileName}_${new Date().toISOString().split('T')[0]}.pdf`);

    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Error exporting report: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const reportTypes = [
    { id: 'trips', label: 'Trips', icon: Bus, description: 'Trip records with bus and conductor info' },
    { id: 'passengers', label: 'Passenger Counts', icon: Users, description: 'Passenger count snapshots' },
    { id: 'revenue', label: 'Revenue', icon: DollarSign, description: 'Financial transactions' },
    { id: 'buses', label: 'Buses', icon: Bus, description: 'Bus fleet information' },
    { id: 'irregularities', label: 'Fare Irregularities', icon: Activity, description: 'Fare compliance issues' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Reports Dashboard</h1>
          <p className="text-white/60">System analytics and report generation</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportExcel}
            disabled={loading}
            className="bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
          >
            <Download size={18} />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={loading}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
          >
            <FileText size={18} />
            PDF
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${stats.revenueGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.revenueGrowth >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {Math.abs(stats.revenueGrowth)}%
            </div>
          </div>
          <p className="text-white/60 text-sm mb-1">Total Revenue</p>
          <p className="text-white text-2xl font-bold">₱{stats.totalRevenue.toLocaleString()}</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <Bus className="w-6 h-6 text-blue-400" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${stats.tripGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.tripGrowth >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {Math.abs(stats.tripGrowth)}%
            </div>
          </div>
          <p className="text-white/60 text-sm mb-1">Total Trips</p>
          <p className="text-white text-2xl font-bold">{stats.totalTrips.toLocaleString()}</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex items-center gap-1 text-sm text-green-400">
              <ArrowUp size={14} />
              5.2%
            </div>
          </div>
          <p className="text-white/60 text-sm mb-1">Total Passengers</p>
          <p className="text-white text-2xl font-bold">{stats.totalPassengers.toLocaleString()}</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-orange-400" />
            </div>
            <div className="flex items-center gap-1 text-sm text-green-400">
              <ArrowUp size={14} />
              2.1%
            </div>
          </div>
          <p className="text-white/60 text-sm mb-1">Active Buses</p>
          <p className="text-white text-2xl font-bold">{stats.activeBuses}</p>
        </div>
      </div>

      {/* Report Configuration */}
      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4">Generate Report</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-white/60 text-sm mb-2 block">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
            >
              {reportTypes.map(type => (
                <option key={type.id} value={type.id} className="bg-gray-800 text-white">{type.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-white/60 text-sm mb-2 block">Start Date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
            />
          </div>
          <div>
            <label className="text-white/60 text-sm mb-2 block">End Date</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="text-green-400" />
          Revenue Overview
        </h2>
        <div className="h-64 flex items-end gap-4">
          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'].map((month, i) => {
            const heights = [65, 80, 45, 90, 70, 85, 95];
            return (
              <div key={month} className="flex-1 flex flex-col items-center gap-2">
                <div 
                  className="w-full bg-gradient-to-t from-green-500 to-emerald-400 rounded-t-lg transition-all duration-300 hover:from-green-400 hover:to-emerald-300"
                  style={{ height: `${heights[i]}%` }}
                />
                <span className="text-white/60 text-xs">{month}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <Activity className="text-blue-400" />
          Recent Trips
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-white/60 border-b border-white/10">
                <th className="pb-3 font-medium">Bus</th>
                <th className="pb-3 font-medium">Route</th>
                <th className="pb-3 font-medium">Conductor</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.slice(0, 5).map((trip) => (
                <tr key={trip.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-4 text-white">{trip.buses?.plate_number || 'N/A'}</td>
                  <td className="py-4 text-white/70">{trip.buses?.route || 'N/A'}</td>
                  <td className="py-4 text-white/70">{trip.conductor_staff?.full_name || 'N/A'}</td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-xs ${
                      trip.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      trip.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {trip.status}
                    </span>
                  </td>
                  <td className="py-4 text-white/60 text-sm">
                    {new Date(trip.started_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transactions Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="text-orange-400" />
            Transactions
          </h2>
          <button
            onClick={() => {
              setShowTransactions(!showTransactions);
              if (!showTransactions) fetchTransactions();
            }}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
          >
            {showTransactions ? 'Hide' : 'Show Transactions'}
          </button>
        </div>

        {showTransactions && (
          <>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={transactionSearchTerm}
                  onChange={(e) => setTransactionSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                />
              </div>
              <select
                value={transactionFilterType}
                onChange={(e) => setTransactionFilterType(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
              >
                <option value="all">All Types</option>
                <option value="fare_validation">Fare Validation</option>
                <option value="balance_topup">Balance Top-up</option>
                <option value="card_issuance">Card Issuance</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-white/60 border-b border-white/10">
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Fare</th>
                    <th className="pb-3 font-medium">Baggage</th>
                    <th className="pb-3 font-medium">Total Amount</th>
                    <th className="pb-3 font-medium">Channel</th>
                    <th className="pb-3 font-medium">Staff</th>
                    <th className="pb-3 font-medium">Created At</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length > 0 ? (
                    filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-4">
                          <span className={`px-3 py-1 rounded-full text-xs border ${transactionTypeColors[transaction.type]}`}>
                            {transaction.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-4 text-white font-medium">₱{parseFloat(transaction.fare || 0).toFixed(2)}</td>
                        <td className="py-4 text-white font-medium">₱{parseFloat(transaction.baggage || 0).toFixed(2)}</td>
                        <td className="py-4 text-white font-medium">₱{parseFloat(transaction.amount).toFixed(2)}</td>
                        <td className="py-4 text-white/70">{transaction.channel}</td>
                        <td className="py-4 text-white/70">{transaction.staff?.full_name || 'N/A'}</td>
                        <td className="py-4 text-white/70 text-sm">
                          {new Date(transaction.created_at).toLocaleString()}
                        </td>
                        <td className="py-4">
                          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <MoreHorizontal size={16} className="text-white/70" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-white/60">
                        No transactions found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* GCash Transactions Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <DollarSign className="text-green-400" />
            GCash Transactions
          </h2>
          <button
            onClick={() => {
              setShowGcashTransactions(!showGcashTransactions);
              if (!showGcashTransactions) fetchGcashTransactions();
            }}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors"
          >
            {showGcashTransactions ? 'Hide' : 'Show GCash Transactions'}
          </button>
        </div>

        {showGcashTransactions && (
          <>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
                <input
                  type="text"
                  placeholder="Search GCash transactions..."
                  value={gcashSearchTerm}
                  onChange={(e) => setGcashSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-green-500"
                />
              </div>
              <select
                value={gcashFilterStatus}
                onChange={(e) => setGcashFilterStatus(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-green-500"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-white/60 border-b border-white/10">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Phone Number</th>
                    <th className="pb-3 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Payment ID</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGcashTransactions.length > 0 ? (
                    filteredGcashTransactions.map((transaction) => (
                      <tr key={transaction.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-4 text-white/70 text-sm">
                          {new Date(transaction.created_at).toLocaleString()}
                        </td>
                        <td className="py-4 text-white font-medium">{transaction.phone_number}</td>
                        <td className="py-4 text-white font-medium">₱{parseFloat(transaction.amount).toFixed(2)}</td>
                        <td className="py-4">
                          <span className={`px-3 py-1 rounded-full text-xs border ${gcashStatusColors[transaction.status]}`}>
                            {transaction.status}
                          </span>
                        </td>
                        <td className="py-4 text-white/70 text-sm">{transaction.stripe_payment_id || 'N/A'}</td>
                        <td className="py-4">
                          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <MoreHorizontal size={16} className="text-white/70" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-white/60">
                        No GCash transactions found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Reports;
