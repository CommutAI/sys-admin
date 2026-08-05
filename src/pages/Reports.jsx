import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, Filter, BarChart3, Users, DollarSign, Bus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Reports = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [reportType, setReportType] = useState('trips');

  const handleExportExcel = async () => {
    setLoading(true);
    try {
      let data = [];
      let fileName = '';

      switch (reportType) {
        case 'trips':
          const { data: trips } = await supabase
            .from('trips')
            .select('*, buses(*), conductor_staff:staff_users!conductor_id(*)')
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
            .select('*, buses(*), conductor_staff:staff_users!conductor_id(*)')
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
    { id: 'irregularities', label: 'Fare Irregularities', icon: BarChart3, description: 'Fare compliance issues' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-3xl font-bold mb-2">Reports</h1>
        <p className="text-white/60">Generate and export system reports</p>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4">Report Configuration</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="text-white/60 text-sm mb-2 block">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
            >
              {reportTypes.map(type => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
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

        <div className="flex gap-4">
          <button
            onClick={handleExportExcel}
            disabled={loading}
            className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Download size={20} />
            Export Excel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={loading}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <FileText size={20} />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reportTypes.map((type) => {
          const Icon = type.icon;
          return (
            <div
              key={type.id}
              onClick={() => setReportType(type.id)}
              className={`glass-card p-6 cursor-pointer transition-all duration-200 hover:scale-105 ${
                reportType === type.id ? 'border-2 border-orange-500' : 'border border-white/10'
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
                  <Icon className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="text-white font-bold">{type.label}</h3>
              </div>
              <p className="text-white/60 text-sm">{type.description}</p>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <Calendar className="text-orange-400" />
          Report Information
        </h2>
        <div className="space-y-4 text-white/70">
          <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
            <span>Default Date Range</span>
            <span className="text-white">Last 30 days</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
            <span>Export Formats</span>
            <span className="text-white">Excel (.xlsx), PDF</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
            <span>Max Records per Export</span>
            <span className="text-white">1000</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
            <span>Auto-timestamp</span>
            <span className="text-white">Yes</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
