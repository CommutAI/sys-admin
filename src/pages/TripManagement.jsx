import { useState, useEffect } from 'react';
import { Search, Trash2, Filter, Calendar, Clock, User, StopCircle, Bus, MapPin, X, Plus, Edit, Wrench, BarChart3, TrendingUp, Users, ArrowLeft, Download, CheckCircle, Activity } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { clearPiTrip } from '../services/raspberryPiApi';
import AuditService from '../services/auditService';

const TripManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [trips, setTrips] = useState([]);
  const [buses, setBuses] = useState([]);
  const [conductors, setConductors] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

  // Trip history state
  const [showHistory, setShowHistory] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState('daily'); // daily, weekly, monthly, yearly, custom
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStats, setHistoryStats] = useState({
    totalTrips: 0,
    totalPassengers: 0,
    avgPassengers: 0,
    totalDistance: 0
  });
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyItemsPerPage] = useState(10);

  // Bus management state
  const [busSearchTerm, setBusSearchTerm] = useState('');
  const [busStatusFilter, setBusStatusFilter] = useState('all');
  const [showAddBusModal, setShowAddBusModal] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [busCurrentPage, setBusCurrentPage] = useState(1);
  const [busItemsPerPage] = useState(10);
  const [showBusDetailsModal, setShowBusDetailsModal] = useState(false);
  const [selectedBusForDetails, setSelectedBusForDetails] = useState(null);
  const [busTrips, setBusTrips] = useState([]);
  const [busTripsLoading, setBusTripsLoading] = useState(false);
  const [busTripsCurrentPage, setBusTripsCurrentPage] = useState(1);
  const [busTripsItemsPerPage] = useState(10);
  const [newBus, setNewBus] = useState({
    plate_number: '',
    bus_number: '',
    route: '',
    seat_capacity: 35,
    status: 'active',
    conductor_id: '',
    driver_id: ''
  });

  useEffect(() => {
    fetchTrips();
    fetchBuses();
    fetchConductors();
    fetchDrivers();
    
    // Set up real-time subscription for trips
    const tripsSubscription = supabase
      .channel('trips-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchTrips();
      })
      .subscribe();

    // Set up real-time subscription for buses
    const busesSubscription = supabase
      .channel('buses-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' }, () => {
        fetchBuses();
      })
      .subscribe();

    // Set up real-time subscription for staff_users
    const staffSubscription = supabase
      .channel('staff-users-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_users' }, () => {
        fetchConductors();
        fetchDrivers();
      })
      .subscribe();

    // Log page view to audit logs
    AuditService.logPageView('Trip Management');

    return () => {
      tripsSubscription.unsubscribe();
      busesSubscription.unsubscribe();
      staffSubscription.unsubscribe();
    };
  }, []);

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('trips')
        .select('*, buses(*), conductor:staff_users!conductor_id(*), driver:staff_users!driver_id(*)')
        .order('started_at', { ascending: false });

      if (error) throw error;
      setTrips(data || []);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBuses = async () => {
    try {
      const { data, error } = await supabase
        .from('buses')
        .select('*, conductor:staff_users!conductor_id(*), driver:staff_users!driver_id(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBuses(data || []);
    } catch (error) {
      console.error('Error fetching buses:', error);
    }
  };

  const fetchConductors = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('role', 'conductor')
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (error) throw error;
      setConductors(data || []);
    } catch (error) {
      console.error('Error fetching conductors:', error);
    }
  };

  const fetchDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('role', 'driver')
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (error) throw error;
      setDrivers(data || []);
    } catch (error) {
      console.error('Error fetching drivers:', error);
    }
  };

  const handleEndTrip = async (tripId) => {
    if (!confirm('Are you sure you want to end this trip?')) return;

    try {
      const trip = trips.find(t => t.id === tripId);
      const busInfo = trip?.buses?.plate_number || 'Unknown bus';

      const { error } = await supabase
        .from('trips')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', tripId);

      if (error) throw error;

      // Log trip end to audit logs
      await AuditService.logTripEnded(tripId, busInfo);

      // Tell the Pi the trip is over so it stops linking counts to this trip
      await clearPiTrip();

      fetchTrips();
    } catch (error) {
      console.error('Error ending trip:', error);
      alert('Error ending trip: ' + error.message);
    }
  };

  const handleCancelTrip = async (tripId) => {
    if (!confirm('Are you sure you want to cancel this trip?')) return;

    try {
      const trip = trips.find(t => t.id === tripId);
      const busInfo = trip?.buses?.plate_number || 'Unknown bus';

      const { error } = await supabase
        .from('trips')
        .update({ status: 'cancelled', ended_at: new Date().toISOString() })
        .eq('id', tripId);

      if (error) throw error;

      // Log trip cancellation to audit logs
      await AuditService.logTripCancelled(tripId, busInfo);

      // Tell the Pi the trip is cancelled
      await clearPiTrip();

      fetchTrips();
    } catch (error) {
      console.error('Error cancelling trip:', error);
      alert('Error cancelling trip: ' + error.message);
    }
  };

  const handleUpdateTripStatus = async (tripId, newStatus) => {
    try {
      const trip = trips.find(t => t.id === tripId);
      const oldStatus = trip?.status || 'unknown';
      const busInfo = trip?.buses?.plate_number || 'Unknown bus';

      const updateData = { status: newStatus };
      if (newStatus === 'completed' || newStatus === 'cancelled') {
        updateData.ended_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('trips')
        .update(updateData)
        .eq('id', tripId);

      if (error) throw error;

      // Log trip status change to audit logs
      await AuditService.logTripStatusChanged(tripId, oldStatus, newStatus, busInfo);

      // Tell the Pi the trip is over if cancelled or completed
      if (newStatus === 'completed' || newStatus === 'cancelled') {
        await clearPiTrip();
      }

      fetchTrips();
    } catch (error) {
      console.error('Error updating trip status:', error);
      alert('Error updating trip status: ' + error.message);
    }
  };



  const handleEditTrip = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('trips')
        .update({
          current_lat: selectedTrip.current_lat,
          current_lng: selectedTrip.current_lng
        })
        .eq('id', selectedTrip.id);

      if (error) throw error;

      // Log trip update to audit logs
      await AuditService.logTripUpdated(selectedTrip.id, `Updated GPS location to ${selectedTrip.current_lat}, ${selectedTrip.current_lng}`);

      alert('Trip location updated successfully!');
      setShowEditModal(false);
      setSelectedTrip(null);
      fetchTrips();
    } catch (error) {
      console.error('Error editing trip:', error);
      alert('Error editing trip: ' + error.message);
    }
  };

  const handleDeleteTrip = async (tripId) => {
    if (!confirm('Are you sure you want to delete this trip? This action cannot be undone.')) return;

    try {
      const trip = trips.find(t => t.id === tripId);
      const busInfo = trip?.buses?.plate_number || 'Unknown bus';

      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', tripId);

      if (error) throw error;

      // Log trip deletion to audit logs
      await AuditService.logTripDeleted(tripId, busInfo);

      alert('Trip deleted successfully!');
      fetchTrips();
    } catch (error) {
      console.error('Error deleting trip:', error);
      alert('Error deleting trip: ' + error.message);
    }
  };

  const openEditModal = (trip) => {
    setSelectedTrip({
      ...trip,
      current_lat: trip.current_lat || 14.5995,
      current_lng: trip.current_lng || 120.9842
    });
    setShowEditModal(true);
  };

  const openViewModal = (trip) => {
    setSelectedTrip(trip);
    setShowViewModal(true);
  };

  const fetchTripPassengers = async (tripId) => {
    try {
      const { data, error } = await supabase
        .from('passenger_counts')
        .select('count')
        .eq('trip_id', tripId)
        .order('recorded_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      return data?.[0]?.count || 0;
    } catch (error) {
      console.error('Error fetching passenger count:', error);
      return 0;
    }
  };

  // Trip history functions
  const fetchTripHistory = async (period) => {
    try {
      setHistoryLoading(true);
      let startDate, endDate;
      const now = new Date();

      switch (period) {
        case 'daily':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          endDate = new Date();
          break;
        case 'weekly':
          startDate = new Date(now.setDate(now.getDate() - 7));
          endDate = new Date();
          break;
        case 'monthly':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          endDate = new Date();
          break;
        case 'yearly':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          endDate = new Date();
          break;
        case 'custom':
          if (customDateRange.startDate && customDateRange.endDate) {
            startDate = new Date(customDateRange.startDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(customDateRange.endDate);
            endDate.setHours(23, 59, 59, 999);
          } else {
            startDate = new Date(now.setHours(0, 0, 0, 0));
            endDate = new Date();
          }
          break;
        default:
          startDate = new Date(now.setHours(0, 0, 0, 0));
          endDate = new Date();
      }

      let query = supabase
        .from('trips')
        .select('*, buses(*), conductor:staff_users!conductor_id(*), driver:staff_users!driver_id(*), passenger_counts(count)')
        .gte('started_at', startDate.toISOString())
        .order('started_at', { ascending: false });

      if (endDate) {
        query = query.lte('started_at', endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      setHistoryData(data || []);

      // Calculate statistics
      const stats = {
        totalTrips: data?.length || 0,
        totalPassengers: 0,
        avgPassengers: 0,
        totalDistance: 0
      };

      if (data && data.length > 0) {
        const allPassengerCounts = data.flatMap(trip => 
          trip.passenger_counts?.map(pc => pc.count) || []
        );
        stats.totalPassengers = allPassengerCounts.reduce((sum, count) => sum + count, 0);
        stats.avgPassengers = allPassengerCounts.length > 0 
          ? Math.round(stats.totalPassengers / allPassengerCounts.length)
          : 0;
      }

      setHistoryStats(stats);
    } catch (error) {
      console.error('Error fetching trip history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHistoryPeriodChange = (period) => {
    setHistoryPeriod(period);
    setHistoryCurrentPage(1);
    fetchTripHistory(period);
  };

  const toggleHistoryView = () => {
    setShowHistory(!showHistory);
    if (!showHistory) {
      fetchTripHistory(historyPeriod);
    }
  };

  const filteredTrips = trips.filter(trip => {
    const matchesSearch = trip.buses?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         trip.buses?.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         trip.conductor?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         trip.driver?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || trip.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Bus management handlers
  const handleAddBus = async (e) => {
    e.preventDefault();
    try {
      const busData = {
        plate_number: newBus.plate_number,
        bus_number: newBus.bus_number ? parseInt(newBus.bus_number) : null,
        route: newBus.route,
        seat_capacity: newBus.seat_capacity,
        status: newBus.status
      };

      // Only include conductor_id if one is selected
      if (newBus.conductor_id) {
        busData.conductor_id = newBus.conductor_id;
      }

      // Only include driver_id if one is selected
      if (newBus.driver_id) {
        busData.driver_id = newBus.driver_id;
      }

      const { error } = await supabase
        .from('buses')
        .insert([busData]);

      if (error) throw error;

      // Log bus creation to audit logs
      await AuditService.logBusCreated(newBus.bus_number || 'N/A', newBus.plate_number);

      alert('Bus added successfully!');
      setShowAddBusModal(false);
      setNewBus({ plate_number: '', bus_number: '', route: '', seat_capacity: 35, status: 'active', conductor_id: '', driver_id: '' });
      fetchBuses();
    } catch (error) {
      console.error('Error adding bus:', error);
      alert('Error adding bus: ' + error.message);
    }
  };

  const handleUpdateBus = async (e) => {
    e.preventDefault();
    try {
      const busData = {
        plate_number: newBus.plate_number,
        bus_number: newBus.bus_number ? parseInt(newBus.bus_number) : null,
        route: newBus.route,
        seat_capacity: newBus.seat_capacity,
        status: newBus.status
      };

      // Only include conductor_id if one is selected
      if (newBus.conductor_id) {
        busData.conductor_id = newBus.conductor_id;
      }

      // Only include driver_id if one is selected
      if (newBus.driver_id) {
        busData.driver_id = newBus.driver_id;
      }

      const { error } = await supabase
        .from('buses')
        .update(busData)
        .eq('id', editingBus.id);

      if (error) throw error;

      // Log bus update to audit logs
      await AuditService.logBusUpdated(editingBus.id, `Updated bus #${newBus.bus_number} (${newBus.plate_number})`);

      alert('Bus updated successfully!');
      setEditingBus(null);
      setNewBus({ plate_number: '', bus_number: '', route: '', seat_capacity: 35, status: 'active', conductor_id: '', driver_id: '' });
      fetchBuses();
    } catch (error) {
      console.error('Error updating bus:', error);
      alert('Error updating bus: ' + error.message);
    }
  };

  const handleUpdateBusStatus = async (busId, newStatus) => {
    try {
      const bus = buses.find(b => b.id === busId);
      const oldStatus = bus?.status || 'unknown';

      const { error } = await supabase
        .from('buses')
        .update({ status: newStatus })
        .eq('id', busId);

      if (error) throw error;

      // Log bus status change to audit logs
      await AuditService.logBusStatusChanged(busId, oldStatus, newStatus);

      fetchBuses();
    } catch (error) {
      console.error('Error updating bus status:', error);
    }
  };

  const handleDeleteBus = async (busId) => {
    if (!confirm('Are you sure you want to delete this bus?')) return;

    try {
      const bus = buses.find(b => b.id === busId);
      const plateNumber = bus?.plate_number || 'Unknown';

      const { error } = await supabase
        .from('buses')
        .delete()
        .eq('id', busId);

      if (error) throw error;

      // Log bus deletion to audit logs
      await AuditService.logBusDeleted(busId, plateNumber);

      fetchBuses();
    } catch (error) {
      console.error('Error deleting bus:', error);
      alert('Error deleting bus: ' + error.message);
    }
  };

  const openEditBusModal = (bus) => {
    setEditingBus(bus);
    setNewBus({
      plate_number: bus.plate_number,
      bus_number: bus.bus_number || '',
      route: bus.route,
      seat_capacity: bus.seat_capacity,
      status: bus.status,
      conductor_id: bus.conductor_id || '',
      driver_id: bus.driver_id || ''
    });
  };

  const openBusDetailsModal = async (bus) => {
    setSelectedBusForDetails(bus);
    setShowBusDetailsModal(true);
    setBusTripsLoading(true);
    setBusTripsCurrentPage(1);

    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*, conductor:staff_users!conductor_id(*), driver:staff_users!driver_id(*), passenger_counts(count)')
        .eq('bus_id', bus.id)
        .order('started_at', { ascending: false });

      if (error) throw error;
      setBusTrips(data || []);
    } catch (error) {
      console.error('Error fetching bus trips:', error);
    } finally {
      setBusTripsLoading(false);
    }
  };

  const exportBusDetailsPDF = (bus, trips) => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text(`Bus #${bus.bus_number || 'N/A'} Details`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Plate: ${bus.plate_number}`, 14, 30);
    doc.text(`Route: ${bus.route}`, 14, 36);
    doc.text(`Status: ${bus.status}`, 14, 42);
    doc.text(`Export Date: ${new Date().toLocaleString()}`, 14, 48);

    // Basic Information Table
    const basicInfoData = [
      ['Bus Number', bus.bus_number || 'N/A'],
      ['Plate Number', bus.plate_number],
      ['Route', bus.route],
      ['Seat Capacity', bus.seat_capacity],
      ['Status', bus.status],
      ['Created', new Date(bus.created_at).toLocaleDateString()],
      ['Bus ID', bus.id],
    ];

    autoTable(doc, {
      head: [['Field', 'Value']],
      body: basicInfoData,
      startY: 55,
      theme: 'grid',
      headStyles: { fillColor: [249, 115, 22], textColor: 255 },
      styles: { fontSize: 8 },
    });

    // Staff Assignment Table
    const staffData = [
      ['Conductor', bus.conductor ? `${bus.conductor.full_name} (${bus.conductor.email})` : 'Not assigned'],
      ['Driver', bus.driver ? `${bus.driver.full_name} (${bus.driver.email})` : 'Not assigned'],
    ];

    autoTable(doc, {
      head: [['Role', 'Staff Member']],
      body: staffData,
      startY: doc.lastAutoTable.finalY + 10,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      styles: { fontSize: 8 },
    });

    // Trip Statistics
    const statsData = [
      ['Total Trips', trips.length],
      ['Completed', trips.filter(t => t.status === 'completed').length],
      ['In Progress', trips.filter(t => t.status === 'in_progress').length],
      ['Cancelled', trips.filter(t => t.status === 'cancelled').length],
      ['Total Passengers', trips.reduce((sum, trip) => sum + (trip.passenger_counts?.[0]?.count || 0), 0)],
      ['Avg Passengers/Trip', trips.length > 0 ? Math.round(trips.reduce((sum, trip) => sum + (trip.passenger_counts?.[0]?.count || 0), 0) / trips.length) : 0],
    ];

    autoTable(doc, {
      head: [['Metric', 'Value']],
      body: statsData,
      startY: doc.lastAutoTable.finalY + 10,
      theme: 'grid',
      headStyles: { fillColor: [34, 197, 94], textColor: 255 },
      styles: { fontSize: 8 },
    });

    // Trip History Table
    if (trips.length > 0) {
      const tripTableData = trips.map(trip => [
        new Date(trip.started_at).toLocaleString(),
        trip.conductor?.full_name || 'N/A',
        trip.driver?.full_name || 'N/A',
        trip.passenger_counts?.[0]?.count || 0,
        trip.status.replace('_', ' '),
        trip.ended_at 
          ? `${Math.round((new Date(trip.ended_at) - new Date(trip.started_at)) / 60000)} min`
          : 'In progress',
      ]);

      autoTable(doc, {
        head: [['Date', 'Conductor', 'Driver', 'Passengers', 'Status', 'Duration']],
        body: tripTableData,
        startY: doc.lastAutoTable.finalY + 10,
        theme: 'grid',
        headStyles: { fillColor: [168, 85, 247], textColor: 255 },
        styles: { fontSize: 7 },
      });
    }

    // Save PDF
    doc.save(`bus_${bus.bus_number}_${bus.plate_number}_details.pdf`);

    // Log export to audit logs
    AuditService.logDataExported('Bus Management', 'PDF');
  };

  const exportBusDetailsExcel = (bus, trips) => {
    const workbook = XLSX.utils.book_new();

    // Basic Information Sheet
    const basicInfoData = [
      ['Field', 'Value'],
      ['Bus Number', bus.bus_number || 'N/A'],
      ['Plate Number', bus.plate_number],
      ['Route', bus.route],
      ['Seat Capacity', bus.seat_capacity],
      ['Status', bus.status],
      ['Created', new Date(bus.created_at).toLocaleDateString()],
      ['Bus ID', bus.id],
    ];
    const basicInfoSheet = XLSX.utils.aoa_to_sheet(basicInfoData);
    XLSX.utils.book_append_sheet(workbook, basicInfoSheet, 'Basic Info');

    // Staff Assignment Sheet
    const staffData = [
      ['Role', 'Staff Member'],
      ['Conductor', bus.conductor ? `${bus.conductor.full_name} (${bus.conductor.email})` : 'Not assigned'],
      ['Driver', bus.driver ? `${bus.driver.full_name} (${bus.driver.email})` : 'Not assigned'],
    ];
    const staffSheet = XLSX.utils.aoa_to_sheet(staffData);
    XLSX.utils.book_append_sheet(workbook, staffSheet, 'Staff');

    // Trip Statistics Sheet
    const statsData = [
      ['Metric', 'Value'],
      ['Total Trips', trips.length],
      ['Completed', trips.filter(t => t.status === 'completed').length],
      ['In Progress', trips.filter(t => t.status === 'in_progress').length],
      ['Cancelled', trips.filter(t => t.status === 'cancelled').length],
      ['Total Passengers', trips.reduce((sum, trip) => sum + (trip.passenger_counts?.[0]?.count || 0), 0)],
      ['Avg Passengers/Trip', trips.length > 0 ? Math.round(trips.reduce((sum, trip) => sum + (trip.passenger_counts?.[0]?.count || 0), 0) / trips.length) : 0],
    ];
    const statsSheet = XLSX.utils.aoa_to_sheet(statsData);
    XLSX.utils.book_append_sheet(workbook, statsSheet, 'Statistics');

    // Trip History Sheet
    if (trips.length > 0) {
      const tripTableData = [
        ['Date', 'Conductor', 'Driver', 'Passengers', 'Status', 'Duration'],
        ...trips.map(trip => [
          new Date(trip.started_at).toLocaleString(),
          trip.conductor?.full_name || 'N/A',
          trip.driver?.full_name || 'N/A',
          trip.passenger_counts?.[0]?.count || 0,
          trip.status.replace('_', ' '),
          trip.ended_at 
            ? `${Math.round((new Date(trip.ended_at) - new Date(trip.started_at)) / 60000)} min`
            : 'In progress',
        ]),
      ];
      const tripsSheet = XLSX.utils.aoa_to_sheet(tripTableData);
      XLSX.utils.book_append_sheet(workbook, tripsSheet, 'Trip History');
    }

    // Save Excel
    XLSX.writeFile(workbook, `bus_${bus.bus_number}_${bus.plate_number}_details.xlsx`);

    // Log export to audit logs
    AuditService.logDataExported('Bus Management', 'Excel');
  };

  const filteredBuses = buses.filter(bus => {
    const matchesSearch = bus.plate_number?.toLowerCase().includes(busSearchTerm.toLowerCase()) ||
                         bus.route?.toLowerCase().includes(busSearchTerm.toLowerCase());
    const matchesStatus = busStatusFilter === 'all' || bus.status === busStatusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    // Sort by bus_number in ascending order
    const numA = a.bus_number || 0;
    const numB = b.bus_number || 0;
    return numA - numB;
  });

  // Pagination logic for buses
  const busTotalPages = Math.ceil(filteredBuses.length / busItemsPerPage);
  const busPaginatedBuses = filteredBuses.slice(
    (busCurrentPage - 1) * busItemsPerPage,
    busCurrentPage * busItemsPerPage
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setBusCurrentPage(1);
  }, [busSearchTerm, busStatusFilter]);

  // Pagination logic for history
  const historyTotalPages = Math.ceil(historyData.length / historyItemsPerPage);
  const historyPaginatedData = historyData.slice(
    (historyCurrentPage - 1) * historyItemsPerPage,
    historyCurrentPage * historyItemsPerPage
  );

  const busStatusColors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/50',
    maintenance: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    inactive: 'bg-red-500/20 text-red-400 border-red-500/50',
  };

  const statusColors = {
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    'in_progress': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">Trip & Bus Management</h1>
        <p className="text-white/60">Loading data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Trip & Bus Management</h1>
          <p className="text-white/60">Monitor trips and manage bus fleet</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={toggleHistoryView}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
              showHistory
                ? 'bg-orange-500 hover:bg-orange-600 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {showHistory ? <ArrowLeft size={20} /> : <BarChart3 size={20} />}
            {showHistory ? 'Back to Trips' : 'Trip History'}
          </button>
          <button
            onClick={() => setShowAddBusModal(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            Add Bus
          </button>
        </div>
      </div>

      {/* Trip History View */}
      {showHistory && (
        <div className="space-y-6">
          {/* Period Selector */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-xl font-bold flex items-center gap-2">
                <Calendar className="text-orange-400" />
                Trip History
              </h2>
              <div className="flex gap-2">
                {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((period) => (
                  <button
                    key={period}
                    onClick={() => handleHistoryPeriodChange(period)}
                    className={`px-4 py-2 rounded-lg capitalize transition-colors ${
                      historyPeriod === period
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Range Picker */}
            {historyPeriod === 'custom' && (
              <div className="mt-6 mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-white/60 text-sm mb-2 block">Start Date</label>
                  <input
                    type="date"
                    value={customDateRange.startDate}
                    onChange={(e) => setCustomDateRange({...customDateRange, startDate: e.target.value})}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-white/60 text-sm mb-2 block">End Date</label>
                  <input
                    type="date"
                    value={customDateRange.endDate}
                    onChange={(e) => setCustomDateRange({...customDateRange, endDate: e.target.value})}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => fetchTripHistory('custom')}
                    className="w-full px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            )}

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Bus className="text-orange-400" size={20} />
                  <span className="text-white/60 text-sm">Total Trips</span>
                </div>
                <p className="text-white text-2xl font-bold">{historyStats.totalTrips}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="text-green-400" size={20} />
                  <span className="text-white/60 text-sm">Total Passengers</span>
                </div>
                <p className="text-white text-2xl font-bold">{historyStats.totalPassengers}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="text-blue-400" size={20} />
                  <span className="text-white/60 text-sm">Avg Passengers</span>
                </div>
                <p className="text-white text-2xl font-bold">{historyStats.avgPassengers}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="text-purple-400" size={20} />
                  <span className="text-white/60 text-sm">Period</span>
                </div>
                <p className="text-white text-2xl font-bold capitalize">{historyPeriod}</p>
              </div>
            </div>

            {/* History Table */}
            {historyLoading ? (
              <div className="text-center py-8">
                <p className="text-white/60">Loading trip history...</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-white/60">No trips found for this period</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-white/60 text-sm py-3 px-4">Bus</th>
                        <th className="text-left text-white/60 text-sm py-3 px-4">Route</th>
                        <th className="text-left text-white/60 text-sm py-3 px-4">Conductor</th>
                        <th className="text-left text-white/60 text-sm py-3 px-4">Driver</th>
                        <th className="text-left text-white/60 text-sm py-3 px-4">Start Time</th>
                        <th className="text-left text-white/60 text-sm py-3 px-4">Status</th>
                        <th className="text-left text-white/60 text-sm py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyPaginatedData.map((trip) => (
                        <tr key={trip.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="text-white py-3 px-4">{trip.buses?.plate_number || 'N/A'}</td>
                          <td className="text-white/70 py-3 px-4">{trip.buses?.route || 'N/A'}</td>
                          <td className="text-white/70 py-3 px-4">{trip.conductor?.full_name || 'N/A'}</td>
                          <td className="text-white/70 py-3 px-4">{trip.driver?.full_name || 'N/A'}</td>
                          <td className="text-white/60 py-3 px-4">{new Date(trip.started_at).toLocaleString()}</td>
                          <td className="py-3 px-4">
                            <select
                              value={trip.status}
                              onChange={(e) => handleUpdateTripStatus(trip.id, e.target.value)}
                              className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-orange-500"
                            >
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => openViewModal(trip)}
                              className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs transition-colors"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* History Pagination */}
                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-white/60 text-sm">
                      Showing {((historyCurrentPage - 1) * historyItemsPerPage) + 1} to {Math.min(historyCurrentPage * historyItemsPerPage, historyData.length)} of {historyData.length} trips
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setHistoryCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={historyCurrentPage === 1}
                        className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
                      >
                        Previous
                      </button>
                      <div className="flex gap-1">
                        {Array.from({ length: historyTotalPages }, (_, i) => i + 1).map((page) => (
                          <button
                            key={page}
                            onClick={() => setHistoryCurrentPage(page)}
                            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                              historyCurrentPage === page
                                ? 'bg-orange-500 text-white'
                                : 'bg-white/10 hover:bg-white/20 text-white'
                            }`}
                          >
                            {page}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setHistoryCurrentPage(prev => Math.min(historyTotalPages, prev + 1))}
                        disabled={historyCurrentPage === historyTotalPages}
                        className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {!showHistory && (
      <div className="space-y-6">
        {/* Buses Section */}
        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
            <Bus className="text-orange-400" />
            Bus Fleet
          </h2>
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
              <input
                type="text"
                placeholder="Search buses..."
                value={busSearchTerm}
                onChange={(e) => setBusSearchTerm(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
              />
            </div>
            <select
              value={busStatusFilter}
              onChange={(e) => setBusStatusFilter(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-white/60 text-sm py-3 px-4">Bus #</th>
                  <th className="text-left text-white/60 text-sm py-3 px-4">Plate Number</th>
                  <th className="text-left text-white/60 text-sm py-3 px-4">Route</th>
                  <th className="text-left text-white/60 text-sm py-3 px-4">Capacity</th>
                  <th className="text-left text-white/60 text-sm py-3 px-4">Conductor</th>
                  <th className="text-left text-white/60 text-sm py-3 px-4">Driver</th>
                  <th className="text-left text-white/60 text-sm py-3 px-4">Status</th>
                  <th className="text-left text-white/60 text-sm py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {busPaginatedBuses.map((bus) => (
                  <tr key={bus.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="text-white py-3 px-4">
                      <button
                        onClick={() => openBusDetailsModal(bus)}
                        className="text-white font-medium hover:text-orange-400 transition-colors cursor-pointer flex items-center gap-2"
                      >
                        #{bus.bus_number || 'N/A'}
                        <Bus size={14} className="text-orange-400" />
                      </button>
                    </td>
                    <td className="text-white py-3 px-4">{bus.plate_number}</td>
                    <td className="text-white/70 py-3 px-4">{bus.route}</td>
                    <td className="text-white/70 py-3 px-4">{bus.seat_capacity}</td>
                    <td className="text-white/70 py-3 px-4">{bus.conductor?.full_name || 'N/A'}</td>
                    <td className="text-white/70 py-3 px-4">{bus.driver?.full_name || 'N/A'}</td>
                    <td className="py-3 px-4">
                      <select
                        value={bus.status}
                        onChange={(e) => handleUpdateBusStatus(bus.id, e.target.value)}
                        className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-orange-500"
                      >
                        <option value="active">Active</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditBusModal(bus)}
                          className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteBus(bus.id)}
                          className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {busTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-white/60 text-sm">
                Showing {((busCurrentPage - 1) * busItemsPerPage) + 1} to {Math.min(busCurrentPage * busItemsPerPage, filteredBuses.length)} of {filteredBuses.length} buses
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setBusCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={busCurrentPage === 1}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
                >
                  Previous
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: busTotalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setBusCurrentPage(page)}
                      className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                        busCurrentPage === page
                          ? 'bg-orange-500 text-white'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setBusCurrentPage(prev => Math.min(busTotalPages, prev + 1))}
                  disabled={busCurrentPage === busTotalPages}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Edit Trip Modal - GPS Location Update */}
      {!showHistory && showEditModal && selectedTrip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">Update GPS Location</h2>
            <p className="text-white/60 text-sm mb-4">Update the current GPS location for this trip</p>
            <form onSubmit={handleEditTrip} className="space-y-4">
              <div className="bg-white/5 p-3 rounded-xl mb-4">
                <p className="text-white/60 text-xs">Bus: {selectedTrip.buses?.plate_number}</p>
                <p className="text-white/60 text-xs">Conductor: {selectedTrip.conductor?.full_name}</p>
                {selectedTrip.driver && (
                  <p className="text-white/60 text-xs">Driver: {selectedTrip.driver.full_name}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-sm mb-1 block">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={selectedTrip.current_lat || 14.5995}
                    onChange={(e) => setSelectedTrip({ ...selectedTrip, current_lat: parseFloat(e.target.value) })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-white/60 text-sm mb-1 block">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={selectedTrip.current_lng || 120.9842}
                    onChange={(e) => setSelectedTrip({ ...selectedTrip, current_lng: parseFloat(e.target.value) })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedTrip(null);
                  }}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  Update Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Trip Modal */}
      {showViewModal && selectedTrip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-xl font-bold">Trip Details</h2>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedTrip(null);
                }}
                className="text-white/60 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <Bus className="text-orange-400" />
                <div>
                  <p className="text-white/60 text-sm">Bus</p>
                  <p className="text-white font-medium">{selectedTrip.buses?.plate_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <User className="text-orange-400" />
                <div>
                  <p className="text-white/60 text-sm">Conductor</p>
                  <p className="text-white font-medium">{selectedTrip.conductor?.full_name || 'N/A'}</p>
                </div>
              </div>
              {selectedTrip.driver && (
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                  <User className="text-orange-400" />
                  <div>
                    <p className="text-white/60 text-sm">Driver</p>
                    <p className="text-white font-medium">{selectedTrip.driver.full_name}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <Clock className="text-orange-400" />
                <div>
                  <p className="text-white/60 text-sm">Start Time</p>
                  <p className="text-white font-medium">{new Date(selectedTrip.started_at).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <Clock className="text-orange-400" />
                <div>
                  <p className="text-white/60 text-sm">End Time</p>
                  <p className="text-white font-medium">{selectedTrip.ended_at ? new Date(selectedTrip.ended_at).toLocaleString() : 'Not ended'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <MapPin className="text-orange-400" />
                <div>
                  <p className="text-white/60 text-sm">GPS Location</p>
                  <p className="text-white font-medium">
                    {selectedTrip.current_lat && selectedTrip.current_lng
                      ? `${selectedTrip.current_lat.toFixed(4)}, ${selectedTrip.current_lng.toFixed(4)}`
                      : 'No GPS data'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <span className="text-orange-400 text-sm">S</span>
                </div>
                <div>
                  <p className="text-white/60 text-sm">Status</p>
                  <p className="text-white font-medium">{selectedTrip.status.replace('_', ' ')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Bus Modal */}
      {!showHistory && (showAddBusModal || editingBus) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-2xl">
            <h2 className="text-white text-xl font-bold mb-4">
              {editingBus ? 'Edit Bus' : 'Add New Bus'}
            </h2>
            <form onSubmit={editingBus ? handleUpdateBus : handleAddBus} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Pane - Basic Bus Info */}
                <div className="space-y-4">
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">Bus Number</label>
                    <input
                      type="number"
                      value={newBus.bus_number}
                      onChange={(e) => setNewBus({ ...newBus, bus_number: parseInt(e.target.value) || '' })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">Plate Number</label>
                    <input
                      type="text"
                      required
                      value={newBus.plate_number}
                      onChange={(e) => setNewBus({ ...newBus, plate_number: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">Route</label>
                    <input
                      type="text"
                      required
                      value={newBus.route}
                      onChange={(e) => setNewBus({ ...newBus, route: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">Seat Capacity</label>
                    <input
                      type="number"
                      required
                      value={newBus.seat_capacity}
                      onChange={(e) => setNewBus({ ...newBus, seat_capacity: parseInt(e.target.value) })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm mb-1 block">Status</label>
                    <select
                      value={newBus.status}
                      onChange={(e) => setNewBus({ ...newBus, status: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    >
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Right Pane - Staff Assignment */}
                <div className="space-y-4">
                  <div className="bg-white/5 p-4 rounded-xl">
                    <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                      <User size={16} className="text-blue-400" />
                      Staff Assignment
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-white/60 text-sm mb-1 block">Conductor</label>
                        <select
                          value={newBus.conductor_id}
                          onChange={(e) => setNewBus({ ...newBus, conductor_id: e.target.value })}
                          className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                        >
                          <option value="">No Conductor Assigned</option>
                          {conductors.map(conductor => (
                            <option key={conductor.id} value={conductor.id}>
                              {conductor.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-white/60 text-sm mb-1 block">Driver</label>
                        <select
                          value={newBus.driver_id}
                          onChange={(e) => setNewBus({ ...newBus, driver_id: e.target.value })}
                          className="w-full bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                        >
                          <option value="">No Driver Assigned</option>
                          {drivers.map(driver => (
                            <option key={driver.id} value={driver.id}>
                              {driver.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBusModal(false);
                    setEditingBus(null);
                    setNewBus({ plate_number: '', bus_number: '', route: '', seat_capacity: 35, status: 'active', conductor_id: '', driver_id: '' });
                  }}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  {editingBus ? 'Update' : 'Add'} Bus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bus Details Modal */}
      {showBusDetailsModal && selectedBusForDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-white text-2xl font-bold flex items-center gap-3">
                <Bus className="text-orange-400" size={28} />
                Bus #{selectedBusForDetails.bus_number || 'N/A'} Details
              </h2>
              <button
                onClick={() => {
                  setShowBusDetailsModal(false);
                  setSelectedBusForDetails(null);
                  setBusTrips([]);
                }}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Bus Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white/5 p-4 rounded-xl">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Bus size={16} className="text-orange-400" />
                  Basic Information
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-white/60">Bus Number:</span>
                    <span className="text-white font-medium">#{selectedBusForDetails.bus_number || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Plate Number:</span>
                    <span className="text-white font-medium">{selectedBusForDetails.plate_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Route:</span>
                    <span className="text-white font-medium">{selectedBusForDetails.route}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Seat Capacity:</span>
                    <span className="text-white font-medium">{selectedBusForDetails.seat_capacity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs border ${busStatusColors[selectedBusForDetails.status]}`}>
                      {selectedBusForDetails.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Created:</span>
                    <span className="text-white">{new Date(selectedBusForDetails.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Bus ID:</span>
                    <span className="text-white font-mono text-xs">{selectedBusForDetails.id}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 p-4 rounded-xl">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <User size={16} className="text-blue-400" />
                  Staff Assignment
                </h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-white/60 text-sm block mb-1">Conductor:</span>
                    {selectedBusForDetails.conductor ? (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                          <User size={14} className="text-white" />
                        </div>
                        <div>
                          <span className="text-white text-sm">{selectedBusForDetails.conductor.full_name}</span>
                          <span className="text-white/50 text-xs block">{selectedBusForDetails.conductor.email}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-white/40 text-sm">No conductor assigned</span>
                    )}
                  </div>
                  <div>
                    <span className="text-white/60 text-sm block mb-1">Driver:</span>
                    {selectedBusForDetails.driver ? (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                          <User size={14} className="text-white" />
                        </div>
                        <div>
                          <span className="text-white text-sm">{selectedBusForDetails.driver.full_name}</span>
                          <span className="text-white/50 text-xs block">{selectedBusForDetails.driver.email}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-white/40 text-sm">No driver assigned</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Trip Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 size={16} className="text-orange-400" />
                  <span className="text-white/60 text-sm">Total Trips</span>
                </div>
                <p className="text-white text-2xl font-bold">{busTrips.length}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-green-400" />
                  <span className="text-white/60 text-sm">Completed</span>
                </div>
                <p className="text-white text-2xl font-bold">{busTrips.filter(t => t.status === 'completed').length}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={16} className="text-blue-400" />
                  <span className="text-white/60 text-sm">In Progress</span>
                </div>
                <p className="text-white text-2xl font-bold">{busTrips.filter(t => t.status === 'in_progress').length}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={16} className="text-purple-400" />
                  <span className="text-white/60 text-sm">Total Passengers</span>
                </div>
                <p className="text-white text-2xl font-bold">{busTrips.reduce((sum, trip) => sum + (trip.passenger_counts?.[0]?.count || 0), 0)}</p>
              </div>
            </div>

            {/* Trip History */}
            <div className="bg-white/5 p-4 rounded-xl">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Clock size={16} className="text-purple-400" />
                Trip History
              </h3>
              {busTripsLoading ? (
                <p className="text-white/60 text-center py-4">Loading trip history...</p>
              ) : busTrips.length === 0 ? (
                <p className="text-white/60 text-center py-4">No trips found for this bus</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left text-white/60 text-sm py-2 px-3">Date</th>
                          <th className="text-left text-white/60 text-sm py-2 px-3">Conductor</th>
                          <th className="text-left text-white/60 text-sm py-2 px-3">Driver</th>
                          <th className="text-left text-white/60 text-sm py-2 px-3">Passengers</th>
                          <th className="text-left text-white/60 text-sm py-2 px-3">Status</th>
                          <th className="text-left text-white/60 text-sm py-2 px-3">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {busTrips
                          .slice(
                            (busTripsCurrentPage - 1) * busTripsItemsPerPage,
                            busTripsCurrentPage * busTripsItemsPerPage
                          )
                          .map((trip) => (
                            <tr key={trip.id} className="border-b border-white/5">
                              <td className="text-white/70 text-sm py-2 px-3">
                                {new Date(trip.started_at).toLocaleString()}
                              </td>
                              <td className="text-white/70 text-sm py-2 px-3">
                                {trip.conductor?.full_name || 'N/A'}
                              </td>
                              <td className="text-white/70 text-sm py-2 px-3">
                                {trip.driver?.full_name || 'N/A'}
                              </td>
                              <td className="text-white/70 text-sm py-2 px-3">
                                {trip.passenger_counts?.[0]?.count || 0}
                              </td>
                              <td className="py-2 px-3">
                                <span className={`px-2 py-1 rounded-full text-xs border ${statusColors[trip.status]}`}>
                                  {trip.status.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="text-white/60 text-sm py-2 px-3">
                                {trip.ended_at
                                  ? `${Math.round((new Date(trip.ended_at) - new Date(trip.started_at)) / 60000)} min`
                                  : 'In progress'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination */}
                  {busTrips.length > busTripsItemsPerPage && (
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-white/60 text-sm">
                        Showing {((busTripsCurrentPage - 1) * busTripsItemsPerPage) + 1} to {Math.min(busTripsCurrentPage * busTripsItemsPerPage, busTrips.length)} of {busTrips.length} trips
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setBusTripsCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={busTripsCurrentPage === 1}
                          className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
                        >
                          Previous
                        </button>
                        <span className="text-white/60 text-sm self-center">
                          Page {busTripsCurrentPage} of {Math.ceil(busTrips.length / busTripsItemsPerPage)}
                        </span>
                        <button
                          onClick={() => setBusTripsCurrentPage(prev => Math.min(Math.ceil(busTrips.length / busTripsItemsPerPage), prev + 1))}
                          disabled={busTripsCurrentPage === Math.ceil(busTrips.length / busTripsItemsPerPage)}
                          className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex gap-3 mt-6 justify-between">
              <div className="flex gap-3">
                <button
                  onClick={() => exportBusDetailsPDF(selectedBusForDetails, busTrips)}
                  className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Download size={16} />
                  Export PDF
                </button>
                <button
                  onClick={() => exportBusDetailsExcel(selectedBusForDetails, busTrips)}
                  className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Download size={16} />
                  Export Excel
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowBusDetailsModal(false);
                    openEditBusModal(selectedBusForDetails);
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
                >
                  Edit Bus
                </button>
                <button
                  onClick={() => {
                    setShowBusDetailsModal(false);
                    handleDeleteBus(selectedBusForDetails.id);
                  }}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-colors"
                >
                  Delete Bus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripManagement;
