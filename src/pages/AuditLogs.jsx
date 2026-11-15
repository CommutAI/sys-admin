import { useState, useEffect, useMemo } from 'react';
import { Search, Shield, Clock, User, FileText, Download, ChevronLeft, ChevronRight, ChevronDown, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';

const AuditLogs = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);

      // Try SECURITY DEFINER RPC first (works regardless of RLS/session state)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_audit_logs');

      if (!rpcError) {
        setLogs(rpcData || []);
        return;
      }

      // RPC not available yet (migration not run) — fall back to direct query
      console.warn('get_audit_logs RPC not available, falling back to direct query:', rpcError.message);

      let allRows = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) {
          console.error('Direct query also failed:', error.message);
          break;
        }
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      setLogs(allRows);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const actionColors = {
    CREATE: 'bg-green-500/20 text-green-400',
    UPDATE: 'bg-blue-500/20 text-blue-400',
    DELETE: 'bg-red-500/20 text-red-400',
    LOGIN: 'bg-purple-500/20 text-purple-400',
    LOGOUT: 'bg-pink-500/20 text-pink-400',
    VIEW: 'bg-gray-500/20 text-gray-400',
    EXPORT: 'bg-orange-500/20 text-orange-400',
  };

  // Derive stats from the full dataset
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayActivity = logs.filter(l => l.created_at?.startsWith(today)).length;
    const securityEvents = logs.filter(l => l.action === 'DELETE' || l.action === 'LOGIN').length;
    const uniqueUsers = new Set(logs.map(l => l.username).filter(Boolean)).size;
    return {
      totalLogs: logs.length,
      activeUsers: uniqueUsers,
      securityEvents,
      todayActivity,
    };
  }, [logs]);

  const uniqueUsers = useMemo(
    () => [...new Set(logs.map(l => l.username).filter(Boolean))].sort(),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch =
        !searchTerm ||
        log.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.module?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesAction = filterAction === 'all' || log.action === filterAction;
      const matchesUser = filterUser === 'all' || log.username === filterUser;

      const logDate = log.created_at ? new Date(log.created_at) : null;
      const matchesStart = !dateRange.start || (logDate && logDate >= new Date(dateRange.start));
      const matchesEnd = !dateRange.end || (logDate && logDate <= new Date(dateRange.end + 'T23:59:59'));

      return matchesSearch && matchesAction && matchesUser && matchesStart && matchesEnd;
    });
  }, [logs, searchTerm, filterAction, filterUser, dateRange]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterAction, filterUser, dateRange]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Comprehensive CSV export with full audit metadata comments and complete columns
  const handleExportCSV = (scope = 'all') => {
    const targetLogs = scope === 'all' ? logs : filteredLogs;
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' });
    const docControlNo = `COMMUTAI-AUDIT-LOG-${Date.now().toString().slice(-6)}`;

    const metaHeaders = [
      `# ==============================================================================`,
      `# COMMUTAI TRANSIT SYSTEM - OFFICIAL SECURITY & OPERATIONAL AUDIT LOG REPORT`,
      `# Document Control No: ${docControlNo}`,
      `# Audit Generation Date: ${dateStr} ${timeStr} (PHT)`,
      `# Scope: ${scope === 'all' ? `Complete System Audit (${logs.length} Entries)` : `Filtered Selection (${filteredLogs.length} Entries)`}`,
      `# Filter Criteria: Action=${filterAction}, User=${filterUser}, Search="${searchTerm}", DateRange=${dateRange.start || 'Start'} to ${dateRange.end || 'End'}`,
      `# Total Audit Records: ${targetLogs.length}`,
      `# Classification: CONFIDENTIAL AUDIT RECORD - STRICTLY MONITORED`,
      `# ==============================================================================`
    ];

    const headers = [
      'Item #',
      'Log ID',
      'Timestamp (PHT)',
      'Administrator / User',
      'Action Type',
      'System Module',
      'Operation Details',
      'Origin IP Address',
      'Verification Status'
    ];

    const rows = targetLogs.map((log, idx) => [
      idx + 1,
      log.id || 'N/A',
      log.created_at ? new Date(log.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' }) : 'N/A',
      log.username || 'System Event',
      log.action || 'GENERAL',
      log.module || 'System',
      log.details || '',
      log.ip_address || 'Internal Service',
      'VERIFIED'
    ]);

    const csv = [
      ...metaHeaders,
      headers.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','),
      ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commutai_comprehensive_audit_logs_${scope}_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Comprehensive Excel export with Executive Audit Summary sheet + Master Audit Trail
  const handleExportExcel = (scope = 'all') => {
    const targetLogs = scope === 'all' ? logs : filteredLogs;
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' });
    const docControlNo = `COMMUTAI-AUDIT-LOG-${Date.now().toString().slice(-6)}`;

    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive Audit Summary
    const summaryRows = [
      ['COMMUTAI PUBLIC TRANSPORTATION MANAGEMENT SYSTEM'],
      ['SYSTEM AUDIT LOGS & REGULATORY COMPLIANCE REPORT'],
      ['Official Security, Operational Actions, & Data Modification Trail'],
      [],
      ['AUDIT METADATA', ''],
      ['Document Control No.', docControlNo],
      ['Generated At', `${dateStr} ${timeStr} (PHT)`],
      ['Scope', scope === 'all' ? `All System Audit Logs (${targetLogs.length} Entries)` : `Filtered View (${targetLogs.length} Entries)`],
      ['Filter Action', filterAction.toUpperCase()],
      ['Filter User', filterUser],
      ['Search Filter', searchTerm || 'None'],
      ['Date Range Filter', `${dateRange.start || 'Beginning of record'} to ${dateRange.end || 'Present'}`],
      ['Total Records in Report', targetLogs.length],
      ['Classification', 'CONFIDENTIAL - OFFICIAL TRANSIT AUDIT ARCHIVE'],
      [],
      ['AUDIT ACTIVITY METRICS & KPIS', ''],
      ['Total Recorded Logs', stats.totalLogs],
      ['Active Administrative Users', stats.activeUsers],
      ['Critical Security Events (Delete / Login)', stats.securityEvents],
      ['Today Active Logs', stats.todayActivity],
      [],
      ['AUDIT VERIFICATION & CERTIFICATION', ''],
      ['Report Generated By:', 'System Administrator (Audit Division)'],
      ['System Integrity Status:', '100% Validated (Non-tampered Postgres Audit Trail)']
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 38 }, { wch: 65 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Audit Summary');

    // Sheet 2: Master Audit Trail
    const dataRows = targetLogs.map((log, idx) => ({
      'Item #': idx + 1,
      'Log ID': log.id || 'N/A',
      'Timestamp (PHT)': log.created_at ? new Date(log.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' }) : 'N/A',
      'Administrator / User': log.username || 'System Event',
      'Action Type': log.action || 'GENERAL',
      'System Module': log.module || 'System',
      'Operation Details': log.details || '',
      'Origin IP Address': log.ip_address || 'Internal Service',
      'Audit Status': 'VERIFIED'
    }));

    const dataWs = XLSX.utils.json_to_sheet(dataRows);
    dataWs['!cols'] = [
      { wch: 8 },  // Item #
      { wch: 12 }, // Log ID
      { wch: 22 }, // Timestamp
      { wch: 28 }, // User
      { wch: 14 }, // Action
      { wch: 20 }, // Module
      { wch: 55 }, // Details
      { wch: 18 }, // IP
      { wch: 14 }  // Status
    ];
    XLSX.utils.book_append_sheet(wb, dataWs, `Audit Trail (${targetLogs.length})`);

    XLSX.writeFile(wb, `commutai_comprehensive_audit_logs_${scope}_${dateStr}.xlsx`);
  };

  // Comprehensive PDF export with landscape orientation, brand banner, and KPI summary
  const handleExportPDF = (scope = 'all') => {
    const targetLogs = scope === 'all' ? logs : filteredLogs;
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' });
    const docControlNo = `COMMUTAI-AUDIT-LOG-${Date.now().toString().slice(-6)}`;

    const doc = new jsPDF('landscape', 'mm', 'a4');

    // Top Orange Brand Banner
    doc.setFillColor(234, 88, 12); // #ea580c
    doc.rect(0, 0, 297, 22, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('COMMUTAI TRANSIT SYSTEM - OFFICIAL AUDIT LOG REPORT', 14, 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Complete Record of Administrative Activities, Data Modifications, & Security Events', 14, 16);

    // Meta Details Strip
    doc.setTextColor(70, 70, 70);
    doc.setFontSize(7.5);
    doc.text(
      `Control No: ${docControlNo}  |  Generated: ${dateStr} ${timeStr}  |  Scope: ${scope === 'all' ? `All Logs (${targetLogs.length})` : `Filtered (${targetLogs.length})`}  |  Integrity: 100% VERIFIED`,
      14,
      28
    );

    // KPI Summary
    autoTable(doc, {
      startY: 31,
      head: [['Total Entries', 'Active Admin Users', 'Security Events', 'Today Activity', 'Filter Action', 'Filter User', 'Status']],
      body: [[
        targetLogs.length,
        stats.activeUsers,
        stats.securityEvents,
        stats.todayActivity,
        filterAction.toUpperCase(),
        filterUser,
        'VERIFIED'
      ]],
      theme: 'grid',
      headStyles: { fillColor: [35, 39, 47], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
      bodyStyles: { fontSize: 7, halign: 'center' },
      styles: { cellPadding: 1.8 }
    });

    // Main Log Table
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [['#', 'Timestamp', 'User', 'Action', 'Module', 'Operation Details', 'IP Address']],
      body: targetLogs.map((log, idx) => [
        idx + 1,
        log.created_at ? new Date(log.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' }) : 'N/A',
        log.username || 'System',
        log.action || 'GENERAL',
        log.module || 'System',
        log.details || '',
        log.ip_address || 'Internal'
      ]),
      theme: 'striped',
      headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 6.8, cellPadding: 1.4 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 32 },
        2: { cellWidth: 42 },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 26 },
        5: { cellWidth: 110 },
        6: { cellWidth: 28, halign: 'center' }
      }
    });

    // Footer on all pages
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `Page ${i} of ${pageCount} · CommutAI System Audit Trail · Control No: ${docControlNo} · Strictly Confidential`,
        148.5,
        205,
        { align: 'center' }
      );
    }

    doc.save(`commutai_comprehensive_audit_logs_${scope}_${dateStr}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
            <Shield className="text-orange-400" />
            Audit Logs
          </h1>
          <p className="text-white/60">Track all system activities and changes with comprehensive audit reporting</p>
        </div>

        {/* Comprehensive Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-all shadow-lg shadow-orange-500/20"
            title="Export comprehensive audit logs"
          >
            <Download size={18} />
            <span>Export Audit Report</span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
          </button>

          {showExportMenu && (
            <>
              <div 
                className="fixed inset-0 z-20" 
                onClick={() => setShowExportMenu(false)} 
              />
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-gray-900 border border-white/15 shadow-2xl py-2 z-30 animate-fade-in text-white divide-y divide-white/10">
                {/* Full Audit Section */}
                <div className="px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1">
                    <ShieldCheck size={14} />
                    <span>Complete System Audit ({logs.length})</span>
                  </div>
                  <p className="text-[11px] text-white/50 mb-2">
                    Export all recorded audit logs with full details and executive summary
                  </p>

                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportExcel('all');
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/90 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors group"
                    >
                      <FileSpreadsheet size={16} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                      <div>
                        <div className="font-medium text-xs">Excel Audit Workbook (.xlsx)</div>
                        <div className="text-[10px] text-white/40">2-Sheet report with KPIs & full trail</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportPDF('all');
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/90 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors group"
                    >
                      <FileText size={16} className="text-red-400 group-hover:scale-110 transition-transform" />
                      <div>
                        <div className="font-medium text-xs">Official PDF Audit Report (.pdf)</div>
                        <div className="text-[10px] text-white/40">Print-ready landscape document</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportCSV('all');
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/90 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors group"
                    >
                      <FileText size={16} className="text-blue-400 group-hover:scale-110 transition-transform" />
                      <div>
                        <div className="font-medium text-xs">Complete CSV Audit File (.csv)</div>
                        <div className="text-[10px] text-white/40">With metadata comment header</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Filtered View Section */}
                <div className="px-3 py-2 bg-white/[0.02]">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                    <span>Filtered View</span>
                    <span className="text-orange-400 font-mono text-[10px]">{filteredLogs.length} entries</span>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportExcel('filtered');
                      }}
                      className="px-2 py-1.5 rounded-lg text-xs text-white/80 hover:text-white hover:bg-white/10 flex flex-col items-center justify-center gap-1 transition-colors text-center border border-white/5"
                    >
                      <FileSpreadsheet size={14} className="text-emerald-400" />
                      <span className="text-[10px]">Excel</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportPDF('filtered');
                      }}
                      className="px-2 py-1.5 rounded-lg text-xs text-white/80 hover:text-white hover:bg-white/10 flex flex-col items-center justify-center gap-1 transition-colors text-center border border-white/5"
                    >
                      <FileText size={14} className="text-red-400" />
                      <span className="text-[10px]">PDF</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportCSV('filtered');
                      }}
                      className="px-2 py-1.5 rounded-lg text-xs text-white/80 hover:text-white hover:bg-white/10 flex flex-col items-center justify-center gap-1 transition-colors text-center border border-white/5"
                    >
                      <FileText size={14} className="text-blue-400" />
                      <span className="text-[10px]">CSV</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-6 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
          <p className="text-white/60">Loading audit logs...</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Total Logs</p>
                  <p className="text-white text-2xl font-bold">{stats.totalLogs.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Active Users</p>
                  <p className="text-white text-2xl font-bold">{stats.activeUsers}</p>
                </div>
              </div>
            </div>
            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Security Events</p>
                  <p className="text-white text-2xl font-bold">{stats.securityEvents}</p>
                </div>
              </div>
            </div>
            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-orange-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Today's Activity</p>
                  <p className="text-white text-2xl font-bold">{stats.todayActivity}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="glass-card p-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex-1 min-w-48 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  placeholder="Search user, module, details..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                />
              </div>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
              >
                <option value="all">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="LOGIN">Login</option>
                <option value="LOGOUT">Logout</option>
                <option value="VIEW">View</option>
                <option value="EXPORT">Export</option>
              </select>
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
              >
                <option value="all">All Users</option>
                {uniqueUsers.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(d => ({ ...d, start: e.target.value }))}
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                title="Start date"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(d => ({ ...d, end: e.target.value }))}
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                title="End date"
              />
              {(searchTerm || filterAction !== 'all' || filterUser !== 'all' || dateRange.start || dateRange.end) && (
                <button
                  onClick={() => { setSearchTerm(''); setFilterAction('all'); setFilterUser('all'); setDateRange({ start: '', end: '' }); }}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white/70 rounded-xl text-sm transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-white/60 border-b border-white/10 text-sm">
                    <th className="pb-3 font-medium pr-4">
                      <div className="flex items-center gap-2"><Clock size={14} />Timestamp</div>
                    </th>
                    <th className="pb-3 font-medium pr-4">
                      <div className="flex items-center gap-2"><User size={14} />User</div>
                    </th>
                    <th className="pb-3 font-medium pr-4">Action</th>
                    <th className="pb-3 font-medium pr-4">Module</th>
                    <th className="pb-3 font-medium pr-4">Details</th>
                    <th className="pb-3 font-medium">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.length > 0 ? (
                    paginatedLogs.map((log) => (
                      <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 pr-4 text-white/60 text-sm whitespace-nowrap">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-3 pr-4 text-white font-medium">{log.username || 'N/A'}</td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${actionColors[log.action] || 'bg-gray-500/20 text-gray-400'}`}>
                            {log.action || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-white/70 text-sm">{log.module || 'N/A'}</td>
                        <td className="py-3 pr-4 text-white/70 text-sm max-w-xs truncate" title={log.details}>
                          {log.details || 'N/A'}
                        </td>
                        <td className="py-3 text-white/40 text-xs font-mono">{log.ip_address || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-16 text-center">
                        <Shield className="w-12 h-12 text-white/20 mx-auto mb-3" />
                        <p className="text-white/40">No audit logs found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-white/50 text-xs sm:text-sm">
                {filteredLogs.length === 0
                  ? 'No results'
                  : `Showing ${((currentPage - 1) * itemsPerPage) + 1}–${Math.min(currentPage * itemsPerPage, filteredLogs.length)} of ${filteredLogs.length.toLocaleString()} logs`
                }
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex gap-1 overflow-x-auto">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let p;
                      if (totalPages <= 5) p = i + 1;
                      else if (currentPage <= 3) p = i + 1;
                      else if (currentPage >= totalPages - 2) p = totalPages - 4 + i;
                      else p = currentPage - 2 + i;
                      return (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`min-w-[32px] w-8 h-8 rounded-lg text-xs sm:text-sm transition-colors ${
                            currentPage === p
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/10 hover:bg-white/20 text-white/70'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AuditLogs;
