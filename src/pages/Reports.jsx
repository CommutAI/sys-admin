import { useState, useEffect, useMemo } from 'react';
import { FileText, Download, Calendar, TrendingUp, Users, DollarSign, Bus, Activity, ArrowUp, ArrowDown, ArrowLeftRight, Search, Filter, MoreHorizontal, ChevronLeft, ChevronRight, Eye, EyeOff, X, Settings, ChevronDown, SortAsc, SortDesc, BarChart3, Clock, MapPin, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import AuditService from '../services/auditService';

const Reports = () => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('trips');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [reportType, setReportType] = useState('trips');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalTrips: 0,
    totalPassengers: 0,
    activeBuses: 0,
    revenueGrowth: 0,
    tripGrowth: 0,
    avgTripDuration: 0,
    avgRevenuePerTrip: 0,
    avgPassengersPerTrip: 0,
    totalStaff: 0,
    completedTrips: 0,
    cancelledTrips: 0,
    activeTrips: 0,
    gcashTransactions: 0,
    cardTransactions: 0,
    cashTransactions: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);

  // Transaction state
  const [transactions, setTransactions] = useState([]);
  const [transactionSearchTerm, setTransactionSearchTerm] = useState('');
  const [transactionFilterType, setTransactionFilterType] = useState('all');
  const [transactionFilterStatus, setTransactionFilterStatus] = useState('all');
  const [transactionDateRange, setTransactionDateRange] = useState({ start: '', end: '' });
  const [showTransactions, setShowTransactions] = useState(false);
  const [transactionsCurrentPage, setTransactionsCurrentPage] = useState(1);
  const [gcashCurrentPage, setGcashCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [transactionSort, setTransactionSort] = useState({ field: 'created_at', direction: 'desc' });
  const [visibleTransactionColumns, setVisibleTransactionColumns] = useState([
    'type', 'fare', 'baggage', 'amount', 'channel', 'staff', 'created_at'
  ]);

  // GCash transaction state
  const [gcashTransactions, setGcashTransactions] = useState([]);
  const [gcashSearchTerm, setGcashSearchTerm] = useState('');
  const [gcashFilterStatus, setGcashFilterStatus] = useState('all');
  const [gcashDateRange, setGcashDateRange] = useState({ start: '', end: '' });
  const [showGcashTransactions, setShowGcashTransactions] = useState(false);
  const [gcashSort, setGcashSort] = useState({ field: 'created_at', direction: 'desc' });
  const [visibleGcashColumns, setVisibleGcashColumns] = useState([
    'created_at', 'phone_number', 'amount', 'status', 'stripe_payment_id'
  ]);

  // Recent trips state
  const [tripsSort, setTripsSort] = useState({ field: 'started_at', direction: 'desc' });
  const [tripsFilterStatus, setTripsFilterStatus] = useState('all');
  const [tripsFilterRoute, setTripsFilterRoute] = useState('');
  const [visibleTripsColumns, setVisibleTripsColumns] = useState([
    'plate_number', 'route', 'conductor', 'status', 'started_at'
  ]);

  // Export column selection
  const [showExportColumns, setShowExportColumns] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState([]);

  // Available columns for each report type
  const availableColumns = {
    trips: [
      { id: 'id', label: 'Trip ID' },
      { id: 'plate_number', label: 'Bus Plate' },
      { id: 'route', label: 'Route' },
      { id: 'conductor', label: 'Conductor' },
      { id: 'started_at', label: 'Start Time' },
      { id: 'ended_at', label: 'End Time' },
      { id: 'status', label: 'Status' },
      { id: 'current_lat', label: 'GPS Latitude' },
      { id: 'current_lng', label: 'GPS Longitude' },
      { id: 'duration', label: 'Duration (min)' },
    ],
    passengers: [
      { id: 'id', label: 'Count ID' },
      { id: 'trip_id', label: 'Trip ID' },
      { id: 'plate_number', label: 'Bus Plate' },
      { id: 'route', label: 'Route' },
      { id: 'count', label: 'Count' },
      { id: 'ai_count', label: 'AI Count' },
      { id: 'source', label: 'Source' },
      { id: 'recorded_at', label: 'Recorded At' },
    ],
    revenue: [
      { id: 'id', label: 'Transaction ID' },
      { id: 'type', label: 'Type' },
      { id: 'amount', label: 'Amount' },
      { id: 'fare', label: 'Fare' },
      { id: 'baggage', label: 'Baggage' },
      { id: 'channel', label: 'Channel' },
      { id: 'plate_number', label: 'Bus Plate' },
      { id: 'route', label: 'Route' },
      { id: 'staff', label: 'Staff' },
      { id: 'created_at', label: 'Created At' },
    ],
    buses: [
      { id: 'id', label: 'Bus ID' },
      { id: 'plate_number', label: 'Plate Number' },
      { id: 'route', label: 'Route' },
      { id: 'seat_capacity', label: 'Seat Capacity' },
      { id: 'status', label: 'Status' },
      { id: 'created_at', label: 'Created At' },
    ],
    irregularities: [
      { id: 'id', label: 'Irregularity ID' },
      { id: 'type', label: 'Type' },
      { id: 'description', label: 'Description' },
      { id: 'plate_number', label: 'Bus Plate' },
      { id: 'route', label: 'Route' },
      { id: 'detected_at', label: 'Detected At' },
      { id: 'resolved', label: 'Resolved' },
      { id: 'resolved_at', label: 'Resolved At' },
    ],
  };

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();
    // Log page view to audit logs
    AuditService.logPageView('Reports');
  }, []);

  // Initialize export columns when report type changes
  useEffect(() => {
    setSelectedExportColumns(availableColumns[reportType]?.map(col => col.id) || []);
  }, [reportType]);

  const fetchStats = async () => {
    try {
      const [revenueData, tripsData, passengersData, busesData, staffData, gcashData] = await Promise.all([
        supabase.from('transactions').select('amount, channel, status').eq('status', 'completed'),
        supabase.from('trips').select('*, passenger_counts(count)'),
        supabase.from('passenger_counts').select('count'),
        supabase.from('buses').select('*').eq('status', 'active'),
        supabase.from('staff_users').select('*'),
        supabase.from('gcash_transactions').select('*'),
      ]);

      const totalRevenue = (revenueData.data || []).reduce((sum, t) => sum + (t.amount || 0), 0);
      const totalTrips = tripsData.data?.length || 0;
      const totalPassengers = (passengersData.data || []).reduce((sum, p) => sum + (p.count || 0), 0);
      const activeBuses = busesData.data?.length || 0;
      const totalStaff = staffData.data?.length || 0;
      const completedTrips = tripsData.data?.filter(t => t.status === 'completed').length || 0;
      const cancelledTrips = tripsData.data?.filter(t => t.status === 'cancelled').length || 0;
      const activeTrips = tripsData.data?.filter(t => t.status === 'in_progress').length || 0;
      const gcashTransactions = gcashData.data?.length || 0;
      const cardTransactions = (revenueData.data || []).filter(t => t.channel === 'card').length || 0;
      const cashTransactions = (revenueData.data || []).filter(t => t.channel === 'cash').length || 0;

      // Calculate average trip duration
      const completedTripsWithDuration = tripsData.data?.filter(t => t.status === 'completed' && t.started_at && t.ended_at) || [];
      const avgTripDuration = completedTripsWithDuration.length > 0
        ? completedTripsWithDuration.reduce((sum, t) => sum + (new Date(t.ended_at) - new Date(t.started_at)) / 60000, 0) / completedTripsWithDuration.length
        : 0;

      const avgRevenuePerTrip = totalTrips > 0 ? totalRevenue / totalTrips : 0;
      const avgPassengersPerTrip = totalTrips > 0 ? totalPassengers / totalTrips : 0;

      setStats({
        totalRevenue,
        totalTrips,
        totalPassengers,
        activeBuses,
        revenueGrowth: 12.5,
        tripGrowth: 8.3,
        avgTripDuration,
        avgRevenuePerTrip,
        avgPassengersPerTrip,
        totalStaff,
        completedTrips,
        cancelledTrips,
        activeTrips,
        gcashTransactions,
        cardTransactions,
        cashTransactions,
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

  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const matchesSearch = transaction.channel?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                           transaction.staff?.full_name?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                           transaction.fare?.toString().includes(transactionSearchTerm) ||
                           transaction.baggage?.toString().includes(transactionSearchTerm) ||
                           transaction.id?.toLowerCase().includes(transactionSearchTerm.toLowerCase());
      const matchesType = transactionFilterType === 'all' || transaction.type === transactionFilterType;
      const matchesStatus = transactionFilterStatus === 'all' || transaction.status === transactionFilterStatus;
      const matchesDateRange = (!transactionDateRange.start || new Date(transaction.created_at) >= new Date(transactionDateRange.start)) &&
                               (!transactionDateRange.end || new Date(transaction.created_at) <= new Date(transactionDateRange.end));
      return matchesSearch && matchesType && matchesStatus && matchesDateRange;
    }).sort((a, b) => {
      const aValue = a[transactionSort.field];
      const bValue = b[transactionSort.field];
      if (transactionSort.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });
  }, [transactions, transactionSearchTerm, transactionFilterType, transactionFilterStatus, transactionDateRange, transactionSort]);

  const transactionsTotalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (transactionsCurrentPage - 1) * itemsPerPage,
    transactionsCurrentPage * itemsPerPage
  );

  useEffect(() => {
    setTransactionsCurrentPage(1);
  }, [transactionSearchTerm, transactionFilterType]);

  useEffect(() => {
    setGcashCurrentPage(1);
  }, [gcashSearchTerm, gcashFilterStatus]);

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

  const filteredGcashTransactions = useMemo(() => {
    return gcashTransactions.filter(transaction => {
      const matchesSearch = transaction.phone_number?.includes(gcashSearchTerm) ||
                           transaction.stripe_payment_id?.toLowerCase().includes(gcashSearchTerm.toLowerCase()) ||
                           transaction.id?.toLowerCase().includes(gcashSearchTerm.toLowerCase());
      const matchesStatus = gcashFilterStatus === 'all' || transaction.status === gcashFilterStatus;
      const matchesDateRange = (!gcashDateRange.start || new Date(transaction.created_at) >= new Date(gcashDateRange.start)) &&
                               (!gcashDateRange.end || new Date(transaction.created_at) <= new Date(gcashDateRange.end));
      return matchesSearch && matchesStatus && matchesDateRange;
    }).sort((a, b) => {
      const aValue = a[gcashSort.field];
      const bValue = b[gcashSort.field];
      if (gcashSort.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });
  }, [gcashTransactions, gcashSearchTerm, gcashFilterStatus, gcashDateRange, gcashSort]);

  const gcashTotalPages = Math.ceil(filteredGcashTransactions.length / itemsPerPage);
  const paginatedGcashTransactions = filteredGcashTransactions.slice(
    (gcashCurrentPage - 1) * itemsPerPage,
    gcashCurrentPage * itemsPerPage
  );

  const filteredRecentActivity = useMemo(() => {
    return recentActivity.filter(trip => {
      const matchesStatus = tripsFilterStatus === 'all' || trip.status === tripsFilterStatus;
      const matchesRoute = !tripsFilterRoute || trip.buses?.route?.toLowerCase().includes(tripsFilterRoute.toLowerCase());
      return matchesStatus && matchesRoute;
    }).sort((a, b) => {
      let aValue, bValue;
      if (tripsSort.field === 'buses') {
        aValue = a.buses?.plate_number || '';
        bValue = b.buses?.plate_number || '';
      } else if (tripsSort.field === 'conductor_staff') {
        aValue = a.conductor_staff?.full_name || '';
        bValue = b.conductor_staff?.full_name || '';
      } else {
        aValue = a[tripsSort.field];
        bValue = b[tripsSort.field];
      }
      if (tripsSort.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });
  }, [recentActivity, tripsFilterStatus, tripsFilterRoute, tripsSort]);

  const handleSort = (field, sortState, setSortState) => {
    if (sortState.field === field) {
      setSortState({
        field,
        direction: sortState.direction === 'asc' ? 'desc' : 'asc'
      });
    } else {
      setSortState({ field, direction: 'asc' });
    }
  };

  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  const renderSortIcon = (field, sortState) => {
    if (sortState.field !== field) return null;
    return sortState.direction === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />;
  };

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

          data = (trips || []).map(trip => {
            const row = {};
            if (selectedExportColumns.includes('id')) row['Trip ID'] = trip.id;
            if (selectedExportColumns.includes('plate_number')) row['Bus Plate'] = trip.buses?.plate_number;
            if (selectedExportColumns.includes('route')) row['Route'] = trip.buses?.route;
            if (selectedExportColumns.includes('conductor')) row['Conductor'] = trip.conductor_staff?.full_name;
            if (selectedExportColumns.includes('started_at')) row['Start Time'] = new Date(trip.started_at).toLocaleString();
            if (selectedExportColumns.includes('ended_at')) row['End Time'] = trip.ended_at ? new Date(trip.ended_at).toLocaleString() : 'N/A';
            if (selectedExportColumns.includes('status')) row['Status'] = trip.status;
            if (selectedExportColumns.includes('current_lat')) row['GPS Latitude'] = trip.current_lat || 'N/A';
            if (selectedExportColumns.includes('current_lng')) row['GPS Longitude'] = trip.current_lng || 'N/A';
            if (selectedExportColumns.includes('duration')) {
              if (trip.started_at && trip.ended_at) {
                const duration = (new Date(trip.ended_at) - new Date(trip.started_at)) / 1000 / 60;
                row['Duration (min)'] = duration.toFixed(2);
              } else {
                row['Duration (min)'] = 'N/A';
              }
            }
            return row;
          });
          fileName = 'trips_report';
          break;

        case 'passengers':
          const { data: passengerCounts } = await supabase
            .from('passenger_counts')
            .select('*, trips(*, buses(*))')
            .gte('recorded_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('recorded_at', dateRange.end || new Date().toISOString())
            .order('recorded_at', { ascending: false });

          data = (passengerCounts || []).map(pc => {
            const row = {};
            if (selectedExportColumns.includes('id')) row['Count ID'] = pc.id;
            if (selectedExportColumns.includes('trip_id')) row['Trip ID'] = pc.trip_id;
            if (selectedExportColumns.includes('plate_number')) row['Bus Plate'] = pc.trips?.buses?.plate_number;
            if (selectedExportColumns.includes('route')) row['Route'] = pc.trips?.buses?.route;
            if (selectedExportColumns.includes('count')) row['Count'] = pc.count;
            if (selectedExportColumns.includes('ai_count')) row['AI Count'] = pc.ai_count || 'N/A';
            if (selectedExportColumns.includes('source')) row['Source'] = pc.source;
            if (selectedExportColumns.includes('recorded_at')) row['Recorded At'] = new Date(pc.recorded_at).toLocaleString();
            return row;
          });
          fileName = 'passenger_counts_report';
          break;

        case 'revenue':
          const { data: transactions } = await supabase
            .from('transactions')
            .select('*, trips(*, buses(*)), staff:staff_users(*)')
            .gte('created_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('created_at', dateRange.end || new Date().toISOString())
            .order('created_at', { ascending: false });

          data = (transactions || []).map(tx => {
            const row = {};
            if (selectedExportColumns.includes('id')) row['Transaction ID'] = tx.id;
            if (selectedExportColumns.includes('type')) row['Type'] = tx.type;
            if (selectedExportColumns.includes('amount')) row['Amount'] = tx.amount;
            if (selectedExportColumns.includes('fare')) row['Fare'] = tx.fare || 0;
            if (selectedExportColumns.includes('baggage')) row['Baggage'] = tx.baggage || 0;
            if (selectedExportColumns.includes('channel')) row['Channel'] = tx.channel;
            if (selectedExportColumns.includes('plate_number')) row['Bus Plate'] = tx.trips?.buses?.plate_number;
            if (selectedExportColumns.includes('route')) row['Route'] = tx.trips?.buses?.route;
            if (selectedExportColumns.includes('staff')) row['Staff'] = tx.staff?.full_name || 'N/A';
            if (selectedExportColumns.includes('created_at')) row['Created At'] = new Date(tx.created_at).toLocaleString();
            return row;
          });
          fileName = 'revenue_report';
          break;

        case 'buses':
          const { data: buses } = await supabase
            .from('buses')
            .select('*')
            .order('created_at', { ascending: false });

          data = (buses || []).map(bus => {
            const row = {};
            if (selectedExportColumns.includes('id')) row['Bus ID'] = bus.id;
            if (selectedExportColumns.includes('plate_number')) row['Plate Number'] = bus.plate_number;
            if (selectedExportColumns.includes('route')) row['Route'] = bus.route;
            if (selectedExportColumns.includes('seat_capacity')) row['Seat Capacity'] = bus.seat_capacity;
            if (selectedExportColumns.includes('status')) row['Status'] = bus.status;
            if (selectedExportColumns.includes('created_at')) row['Created At'] = new Date(bus.created_at).toLocaleString();
            return row;
          });
          fileName = 'buses_report';
          break;

        case 'irregularities':
          const { data: irregularities } = await supabase
            .from('fare_irregularities')
            .select('*, trips(*, buses(*))')
            .gte('detected_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('detected_at', dateRange.end || new Date().toISOString())
            .order('detected_at', { ascending: false });

          data = (irregularities || []).map(irr => {
            const row = {};
            if (selectedExportColumns.includes('id')) row['Irregularity ID'] = irr.id;
            if (selectedExportColumns.includes('type')) row['Type'] = irr.type;
            if (selectedExportColumns.includes('description')) row['Description'] = irr.description;
            if (selectedExportColumns.includes('plate_number')) row['Bus Plate'] = irr.trips?.buses?.plate_number;
            if (selectedExportColumns.includes('route')) row['Route'] = irr.trips?.buses?.route;
            if (selectedExportColumns.includes('detected_at')) row['Detected At'] = new Date(irr.detected_at).toLocaleString();
            if (selectedExportColumns.includes('resolved')) row['Resolved'] = irr.resolved ? 'Yes' : 'No';
            if (selectedExportColumns.includes('resolved_at')) row['Resolved At'] = irr.resolved_at ? new Date(irr.resolved_at).toLocaleString() : 'N/A';
            return row;
          });
          fileName = 'fare_irregularities_report';
          break;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);

      // Log export to audit logs
      await AuditService.logDataExported('Reports', 'Excel');

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

          columns = selectedExportColumns.map(colId => {
            const col = availableColumns.trips.find(c => c.id === colId);
            return col ? col.label : colId;
          });

          data = (trips || []).map(trip => {
            const row = [];
            if (selectedExportColumns.includes('id')) row.push(trip.id);
            if (selectedExportColumns.includes('plate_number')) row.push(trip.buses?.plate_number || 'N/A');
            if (selectedExportColumns.includes('route')) row.push(trip.buses?.route || 'N/A');
            if (selectedExportColumns.includes('conductor')) row.push(trip.conductor_staff?.full_name || 'N/A');
            if (selectedExportColumns.includes('started_at')) row.push(new Date(trip.started_at).toLocaleString());
            if (selectedExportColumns.includes('ended_at')) row.push(trip.ended_at ? new Date(trip.ended_at).toLocaleString() : 'N/A');
            if (selectedExportColumns.includes('status')) row.push(trip.status);
            if (selectedExportColumns.includes('current_lat')) row.push(trip.current_lat || 'N/A');
            if (selectedExportColumns.includes('current_lng')) row.push(trip.current_lng || 'N/A');
            if (selectedExportColumns.includes('duration')) {
              if (trip.started_at && trip.ended_at) {
                const duration = (new Date(trip.ended_at) - new Date(trip.started_at)) / 1000 / 60;
                row.push(duration.toFixed(2) + ' min');
              } else {
                row.push('N/A');
              }
            }
            return row;
          });
          fileName = 'trips_report';
          break;

        case 'passengers':
          const { data: passengerCounts } = await supabase
            .from('passenger_counts')
            .select('*, trips(*, buses(*))')
            .gte('recorded_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('recorded_at', dateRange.end || new Date().toISOString())
            .order('recorded_at', { ascending: false });

          columns = selectedExportColumns.map(colId => {
            const col = availableColumns.passengers.find(c => c.id === colId);
            return col ? col.label : colId;
          });

          data = (passengerCounts || []).map(pc => {
            const row = [];
            if (selectedExportColumns.includes('id')) row.push(pc.id);
            if (selectedExportColumns.includes('trip_id')) row.push(pc.trip_id);
            if (selectedExportColumns.includes('plate_number')) row.push(pc.trips?.buses?.plate_number || 'N/A');
            if (selectedExportColumns.includes('route')) row.push(pc.trips?.buses?.route || 'N/A');
            if (selectedExportColumns.includes('count')) row.push(pc.count);
            if (selectedExportColumns.includes('ai_count')) row.push(pc.ai_count || 'N/A');
            if (selectedExportColumns.includes('source')) row.push(pc.source);
            if (selectedExportColumns.includes('recorded_at')) row.push(new Date(pc.recorded_at).toLocaleString());
            return row;
          });
          fileName = 'passenger_counts_report';
          break;

        case 'revenue':
          const { data: transactions } = await supabase
            .from('transactions')
            .select('*, trips(*, buses(*)), staff:staff_users(*)')
            .gte('created_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('created_at', dateRange.end || new Date().toISOString())
            .order('created_at', { ascending: false });

          columns = selectedExportColumns.map(colId => {
            const col = availableColumns.revenue.find(c => c.id === colId);
            return col ? col.label : colId;
          });

          data = (transactions || []).map(tx => {
            const row = [];
            if (selectedExportColumns.includes('id')) row.push(tx.id);
            if (selectedExportColumns.includes('type')) row.push(tx.type);
            if (selectedExportColumns.includes('amount')) row.push('₱' + parseFloat(tx.amount).toFixed(2));
            if (selectedExportColumns.includes('fare')) row.push('₱' + parseFloat(tx.fare || 0).toFixed(2));
            if (selectedExportColumns.includes('baggage')) row.push('₱' + parseFloat(tx.baggage || 0).toFixed(2));
            if (selectedExportColumns.includes('channel')) row.push(tx.channel);
            if (selectedExportColumns.includes('plate_number')) row.push(tx.trips?.buses?.plate_number || 'N/A');
            if (selectedExportColumns.includes('route')) row.push(tx.trips?.buses?.route || 'N/A');
            if (selectedExportColumns.includes('staff')) row.push(tx.staff?.full_name || 'N/A');
            if (selectedExportColumns.includes('created_at')) row.push(new Date(tx.created_at).toLocaleString());
            return row;
          });
          fileName = 'revenue_report';
          break;

        case 'buses':
          const { data: buses } = await supabase
            .from('buses')
            .select('*')
            .order('created_at', { ascending: false });

          columns = selectedExportColumns.map(colId => {
            const col = availableColumns.buses.find(c => c.id === colId);
            return col ? col.label : colId;
          });

          data = (buses || []).map(bus => {
            const row = [];
            if (selectedExportColumns.includes('id')) row.push(bus.id);
            if (selectedExportColumns.includes('plate_number')) row.push(bus.plate_number);
            if (selectedExportColumns.includes('route')) row.push(bus.route);
            if (selectedExportColumns.includes('seat_capacity')) row.push(bus.seat_capacity);
            if (selectedExportColumns.includes('status')) row.push(bus.status);
            if (selectedExportColumns.includes('created_at')) row.push(new Date(bus.created_at).toLocaleString());
            return row;
          });
          fileName = 'buses_report';
          break;

        case 'irregularities':
          const { data: irregularities } = await supabase
            .from('fare_irregularities')
            .select('*, trips(*, buses(*))')
            .gte('detected_at', dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .lte('detected_at', dateRange.end || new Date().toISOString())
            .order('detected_at', { ascending: false });

          columns = selectedExportColumns.map(colId => {
            const col = availableColumns.irregularities.find(c => c.id === colId);
            return col ? col.label : colId;
          });

          data = (irregularities || []).map(irr => {
            const row = [];
            if (selectedExportColumns.includes('id')) row.push(irr.id);
            if (selectedExportColumns.includes('type')) row.push(irr.type);
            if (selectedExportColumns.includes('description')) row.push(irr.description);
            if (selectedExportColumns.includes('plate_number')) row.push(irr.trips?.buses?.plate_number || 'N/A');
            if (selectedExportColumns.includes('route')) row.push(irr.trips?.buses?.route || 'N/A');
            if (selectedExportColumns.includes('detected_at')) row.push(new Date(irr.detected_at).toLocaleString());
            if (selectedExportColumns.includes('resolved')) row.push(irr.resolved ? 'Yes' : 'No');
            if (selectedExportColumns.includes('resolved_at')) row.push(irr.resolved_at ? new Date(irr.resolved_at).toLocaleString() : 'N/A');
            return row;
          });
          fileName = 'fare_irregularities_report';
          break;
      }

      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text(`${reportType.replace('_', ' ').toUpperCase()} Report`, 14, 22);
      doc.setFontSize(11);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
      if (dateRange.start || dateRange.end) {
        doc.text(`Date Range: ${dateRange.start || 'All'} to ${dateRange.end || 'Present'}`, 14, 37);
      }

      autoTable(doc, {
        head: [columns],
        body: data,
        startY: dateRange.start || dateRange.end ? 45 : 40,
        theme: 'grid',
        headStyles: { fillColor: [249, 115, 22] },
        styles: { fontSize: 8 },
      });

      doc.save(`${fileName}_${new Date().toISOString().split('T')[0]}.pdf`);

      // Log export to audit logs
      await AuditService.logDataExported('Reports', 'PDF');

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

  const tabs = [
    { id: 'trips', label: 'Trips', icon: Bus },
    { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
    { id: 'gcash', label: 'GCash', icon: DollarSign },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Reports Dashboard</h1>
          <p className="text-white/60">System analytics and report generation</p>
        </div>
        {activeTab === 'reports' && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowExportColumns(!showExportColumns)}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
            >
              <Settings size={18} />
              Columns
            </button>
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
        )}
      </div>

      {/* Tabs */}
      <div className="glass-card p-2">
        <div className="flex gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-colors ${
                activeTab === tab.id
                  ? 'bg-orange-500 text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              <tab.icon size={18} />
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Export Column Selector */}
      {showExportColumns && activeTab === 'reports' && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white text-lg font-bold">Select Export Columns</h3>
            <button
              onClick={() => setShowExportColumns(false)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} className="text-white/70" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {availableColumns[reportType]?.map(col => (
              <label key={col.id} className="flex items-center gap-2 p-3 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={selectedExportColumns.includes(col.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedExportColumns([...selectedExportColumns, col.id]);
                    } else {
                      setSelectedExportColumns(selectedExportColumns.filter(id => id !== col.id));
                    }
                  }}
                  className="w-4 h-4 rounded border-white/20 bg-white/10 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-white/80 text-sm">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setSelectedExportColumns(availableColumns[reportType]?.map(col => col.id) || [])}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedExportColumns([])}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Trips Tab */}
      {activeTab === 'trips' && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-xl font-bold flex items-center gap-2">
              <Activity className="text-blue-400" />
              Recent Trips
            </h2>
            <button
              onClick={() => setVisibleTripsColumns(
                visibleTripsColumns.length === 5 ? ['plate_number', 'status', 'started_at'] : ['plate_number', 'route', 'conductor', 'status', 'started_at']
              )}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
              title="Toggle column visibility"
            >
              {visibleTripsColumns.length === 5 ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <select
              value={tripsFilterStatus}
              onChange={(e) => setTripsFilterStatus(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
              <input
                type="text"
                placeholder="Search by route..."
                value={tripsFilterRoute}
                onChange={(e) => setTripsFilterRoute(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-white/60 border-b border-white/10">
                  {visibleTripsColumns.includes('plate_number') && (
                    <th
                      className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('buses', tripsSort, setTripsSort)}
                    >
                      <div className="flex items-center gap-1">
                        Bus {renderSortIcon('buses', tripsSort)}
                      </div>
                    </th>
                  )}
                  {visibleTripsColumns.includes('route') && (
                    <th
                      className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('buses', tripsSort, setTripsSort)}
                    >
                      <div className="flex items-center gap-1">
                        Route {renderSortIcon('buses', tripsSort)}
                      </div>
                    </th>
                  )}
                  {visibleTripsColumns.includes('conductor') && (
                    <th
                      className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('conductor_staff', tripsSort, setTripsSort)}
                    >
                      <div className="flex items-center gap-1">
                        Conductor {renderSortIcon('conductor_staff', tripsSort)}
                      </div>
                    </th>
                  )}
                  {visibleTripsColumns.includes('status') && (
                    <th
                      className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('status', tripsSort, setTripsSort)}
                    >
                      <div className="flex items-center gap-1">
                        Status {renderSortIcon('status', tripsSort)}
                      </div>
                    </th>
                  )}
                  {visibleTripsColumns.includes('started_at') && (
                    <th
                      className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('started_at', tripsSort, setTripsSort)}
                    >
                      <div className="flex items-center gap-1">
                        Started {renderSortIcon('started_at', tripsSort)}
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRecentActivity.slice(0, 10).map((trip) => (
                  <tr key={trip.id} className="border-b border-white/5 hover:bg-white/5">
                    {visibleTripsColumns.includes('plate_number') && (
                      <td className="py-4 text-white">{trip.buses?.plate_number || 'N/A'}</td>
                    )}
                    {visibleTripsColumns.includes('route') && (
                      <td className="py-4 text-white/70">{trip.buses?.route || 'N/A'}</td>
                    )}
                    {visibleTripsColumns.includes('conductor') && (
                      <td className="py-4 text-white/70">{trip.conductor_staff?.full_name || 'N/A'}</td>
                    )}
                    {visibleTripsColumns.includes('status') && (
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs ${
                          trip.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          trip.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {trip.status}
                        </span>
                      </td>
                    )}
                    {visibleTripsColumns.includes('started_at') && (
                      <td className="py-4 text-white/60 text-sm">
                        {new Date(trip.started_at).toLocaleString()}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
                  <input
                    type="text"
                    placeholder="Search..."
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
                <select
                  value={transactionFilterStatus}
                  onChange={(e) => setTransactionFilterStatus(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
                <input
                  type="date"
                  value={transactionDateRange.start}
                  onChange={(e) => setTransactionDateRange({ ...transactionDateRange, start: e.target.value })}
                  className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  placeholder="Start Date"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-white/60 border-b border-white/10">
                      {visibleTransactionColumns.includes('type') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('type', transactionSort, setTransactionSort)}
                        >
                          <div className="flex items-center gap-1">
                            Type {renderSortIcon('type', transactionSort)}
                          </div>
                        </th>
                      )}
                      {visibleTransactionColumns.includes('fare') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('fare', transactionSort, setTransactionSort)}
                        >
                          <div className="flex items-center gap-1">
                            Fare {renderSortIcon('fare', transactionSort)}
                          </div>
                        </th>
                      )}
                      {visibleTransactionColumns.includes('baggage') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('baggage', transactionSort, setTransactionSort)}
                        >
                          <div className="flex items-center gap-1">
                            Baggage {renderSortIcon('baggage', transactionSort)}
                          </div>
                        </th>
                      )}
                      {visibleTransactionColumns.includes('amount') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('amount', transactionSort, setTransactionSort)}
                        >
                          <div className="flex items-center gap-1">
                            Total Amount {renderSortIcon('amount', transactionSort)}
                          </div>
                        </th>
                      )}
                      {visibleTransactionColumns.includes('channel') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('channel', transactionSort, setTransactionSort)}
                        >
                          <div className="flex items-center gap-1">
                            Channel {renderSortIcon('channel', transactionSort)}
                          </div>
                        </th>
                      )}
                      {visibleTransactionColumns.includes('staff') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('staff', transactionSort, setTransactionSort)}
                        >
                          <div className="flex items-center gap-1">
                            Staff {renderSortIcon('staff', transactionSort)}
                          </div>
                        </th>
                      )}
                      {visibleTransactionColumns.includes('created_at') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('created_at', transactionSort, setTransactionSort)}
                        >
                          <div className="flex items-center gap-1">
                            Created At {renderSortIcon('created_at', transactionSort)}
                          </div>
                        </th>
                      )}
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransactions.length > 0 ? (
                      paginatedTransactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-white/5 hover:bg-white/5">
                          {visibleTransactionColumns.includes('type') && (
                            <td className="py-4">
                              <span className={`px-3 py-1 rounded-full text-xs border ${transactionTypeColors[transaction.type]}`}>
                                {transaction.type.replace('_', ' ')}
                              </span>
                            </td>
                          )}
                          {visibleTransactionColumns.includes('fare') && (
                            <td className="py-4 text-white font-medium">₱{parseFloat(transaction.fare || 0).toFixed(2)}</td>
                          )}
                          {visibleTransactionColumns.includes('baggage') && (
                            <td className="py-4 text-white font-medium">₱{parseFloat(transaction.baggage || 0).toFixed(2)}</td>
                          )}
                          {visibleTransactionColumns.includes('amount') && (
                            <td className="py-4 text-white font-medium">₱{parseFloat(transaction.amount).toFixed(2)}</td>
                          )}
                          {visibleTransactionColumns.includes('channel') && (
                            <td className="py-4 text-white/70">{transaction.channel}</td>
                          )}
                          {visibleTransactionColumns.includes('staff') && (
                            <td className="py-4 text-white/70">{transaction.staff?.full_name || 'N/A'}</td>
                          )}
                          {visibleTransactionColumns.includes('created_at') && (
                            <td className="py-4 text-white/70 text-sm">
                              {new Date(transaction.created_at).toLocaleString()}
                            </td>
                          )}
                          <td className="py-4">
                            <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                              <MoreHorizontal size={16} className="text-white/70" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={visibleTransactionColumns.length + 1} className="py-8 text-center text-white/60">
                          No transactions found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {transactionsTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                    <p className="text-white/60 text-sm">
                      Showing {((transactionsCurrentPage - 1) * itemsPerPage) + 1} to {Math.min(transactionsCurrentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} transactions
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setTransactionsCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={transactionsCurrentPage === 1}
                        className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(transactionsTotalPages, 5) }, (_, i) => {
                          let pageNum;
                          if (transactionsTotalPages <= 5) {
                            pageNum = i + 1;
                          } else if (transactionsCurrentPage <= 3) {
                            pageNum = i + 1;
                          } else if (transactionsCurrentPage >= transactionsTotalPages - 2) {
                            pageNum = transactionsTotalPages - 4 + i;
                          } else {
                            pageNum = transactionsCurrentPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setTransactionsCurrentPage(pageNum)}
                              className={`w-8 h-8 rounded-lg text-sm transition-colors ${
                                transactionsCurrentPage === pageNum
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-white/10 hover:bg-white/20 text-white/70'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => setTransactionsCurrentPage(prev => Math.min(prev + 1, transactionsTotalPages))}
                        disabled={transactionsCurrentPage === transactionsTotalPages}
                        className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* GCash Tab */}
      {activeTab === 'gcash' && (
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
                  <input
                    type="text"
                    placeholder="Search..."
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
                <input
                  type="date"
                  value={gcashDateRange.start}
                  onChange={(e) => setGcashDateRange({ ...gcashDateRange, start: e.target.value })}
                  className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-green-500"
                  placeholder="Start Date"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-white/60 border-b border-white/10">
                      {visibleGcashColumns.includes('created_at') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('created_at', gcashSort, setGcashSort)}
                        >
                          <div className="flex items-center gap-1">
                            Date {renderSortIcon('created_at', gcashSort)}
                          </div>
                        </th>
                      )}
                      {visibleGcashColumns.includes('phone_number') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('phone_number', gcashSort, setGcashSort)}
                        >
                          <div className="flex items-center gap-1">
                            Phone Number {renderSortIcon('phone_number', gcashSort)}
                          </div>
                        </th>
                      )}
                      {visibleGcashColumns.includes('amount') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('amount', gcashSort, setGcashSort)}
                        >
                          <div className="flex items-center gap-1">
                            Amount {renderSortIcon('amount', gcashSort)}
                          </div>
                        </th>
                      )}
                      {visibleGcashColumns.includes('status') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('status', gcashSort, setGcashSort)}
                        >
                          <div className="flex items-center gap-1">
                            Status {renderSortIcon('status', gcashSort)}
                          </div>
                        </th>
                      )}
                      {visibleGcashColumns.includes('stripe_payment_id') && (
                        <th
                          className="pb-3 font-medium cursor-pointer hover:text-white transition-colors"
                          onClick={() => handleSort('stripe_payment_id', gcashSort, setGcashSort)}
                        >
                          <div className="flex items-center gap-1">
                            Payment ID {renderSortIcon('stripe_payment_id', gcashSort)}
                          </div>
                        </th>
                      )}
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedGcashTransactions.length > 0 ? (
                      paginatedGcashTransactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-white/5 hover:bg-white/5">
                          {visibleGcashColumns.includes('created_at') && (
                            <td className="py-4 text-white/70 text-sm">
                              {new Date(transaction.created_at).toLocaleString()}
                            </td>
                          )}
                          {visibleGcashColumns.includes('phone_number') && (
                            <td className="py-4 text-white font-medium">{transaction.phone_number}</td>
                          )}
                          {visibleGcashColumns.includes('amount') && (
                            <td className="py-4 text-white font-medium">₱{parseFloat(transaction.amount).toFixed(2)}</td>
                          )}
                          {visibleGcashColumns.includes('status') && (
                            <td className="py-4">
                              <span className={`px-3 py-1 rounded-full text-xs border ${gcashStatusColors[transaction.status]}`}>
                                {transaction.status}
                              </span>
                            </td>
                          )}
                          {visibleGcashColumns.includes('stripe_payment_id') && (
                            <td className="py-4 text-white/70 text-sm">{transaction.stripe_payment_id || 'N/A'}</td>
                          )}
                          <td className="py-4">
                            <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                              <MoreHorizontal size={16} className="text-white/70" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={visibleGcashColumns.length + 1} className="py-8 text-center text-white/60">
                          No GCash transactions found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {gcashTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                    <p className="text-white/60 text-sm">
                      Showing {((gcashCurrentPage - 1) * itemsPerPage) + 1} to {Math.min(gcashCurrentPage * itemsPerPage, filteredGcashTransactions.length)} of {filteredGcashTransactions.length} transactions
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setGcashCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={gcashCurrentPage === 1}
                        className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(gcashTotalPages, 5) }, (_, i) => {
                          let pageNum;
                          if (gcashTotalPages <= 5) {
                            pageNum = i + 1;
                          } else if (gcashCurrentPage <= 3) {
                            pageNum = i + 1;
                          } else if (gcashCurrentPage >= gcashTotalPages - 2) {
                            pageNum = gcashTotalPages - 4 + i;
                          } else {
                            pageNum = gcashCurrentPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setGcashCurrentPage(pageNum)}
                              className={`w-8 h-8 rounded-lg text-sm transition-colors ${
                                gcashCurrentPage === pageNum
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-white/10 hover:bg-white/20 text-white/70'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => setGcashCurrentPage(prev => Math.min(prev + 1, gcashTotalPages))}
                        disabled={gcashCurrentPage === gcashTotalPages}
                        className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <>
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
            <div className="mt-4 p-4 bg-white/5 rounded-lg">
              <p className="text-white/60 text-sm">
                <strong className="text-white">Report Description:</strong> {reportTypes.find(t => t.id === reportType)?.description}
              </p>
              <p className="text-white/60 text-sm mt-2">
                <strong className="text-white">Columns Available:</strong> {availableColumns[reportType]?.length || 0}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Reports;
