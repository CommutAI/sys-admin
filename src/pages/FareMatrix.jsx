import { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, Plus, Edit, X, ChevronLeft, ChevronRight, 
  Search, ArrowUpDown, ArrowRight, ArrowRightLeft, RefreshCw,
  Route, CheckCircle2, SlidersHorizontal, Download, ChevronDown, FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import AuditService from '../services/auditService';

// The 19 official route stations in topological order (Southbound: Manolo Fortich -> Agora)
export const ROUTE_STATIONS = [
  'Maluko Manolo',
  'Dalirig',
  'Tankulan',
  'Dicklum',
  'San Miguel',
  'Cawayanon',
  'Lunocan',
  'Alae Manolo',
  'Maitum',
  'Balubal',
  'Mambatangan',
  'Bae Upper Puerto',
  'Puerto',
  'Agusan',
  'Tablon',
  'Tablon Baloi',
  'Cugman',
  'Gusa',
  'Agora'
];

const STATION_INDEX_MAP = new Map(
  ROUTE_STATIONS.map((s, idx) => [s.toLowerCase().trim(), idx])
);

/**
 * Returns 'manolo-to-agora', 'agora-to-manolo', or 'other' based on official route station sequence
 */
export const getRouteDirection = (from, to) => {
  const fromIdx = STATION_INDEX_MAP.get((from || '').toLowerCase().trim());
  const toIdx = STATION_INDEX_MAP.get((to || '').toLowerCase().trim());
  if (fromIdx !== undefined && toIdx !== undefined) {
    if (fromIdx < toIdx) return 'manolo-to-agora';
    if (fromIdx > toIdx) return 'agora-to-manolo';
  }
  return 'other';
};

const FareMatrix = () => {
  const [fareMatrix, setFareMatrix] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFare, setEditingFare] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState('default');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [newFare, setNewFare] = useState({
    route_from: '',
    route_to: '',
    km_distance: '',
    regular_fare: '',
    discounted_fare: ''
  });

  useEffect(() => {
    fetchFareMatrix();
    // Log page view to audit logs
    AuditService.logPageView('Fare Matrix');
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedRoute, searchTerm, itemsPerPage]);

  const fetchFareMatrix = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('fare_matrix')
        .select('*')
        .limit(1000);

      if (error) throw error;
      setFareMatrix(data || []);
    } catch (error) {
      console.error('Error fetching fare matrix:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchFareMatrix();
  };

  const handleAddFare = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        route_from: newFare.route_from.trim(),
        route_to: newFare.route_to.trim(),
        km_distance: newFare.km_distance === '' || isNaN(newFare.km_distance) ? null : parseFloat(newFare.km_distance),
        regular_fare: parseFloat(newFare.regular_fare),
        discounted_fare: parseFloat(newFare.discounted_fare)
      };

      const { error } = await supabase
        .from('fare_matrix')
        .insert([payload]);

      if (error) throw error;

      await AuditService.logFareMatrixUpdated(
        payload.route_from, 
        payload.route_to, 
        `Added new fare: Regular ₱${payload.regular_fare}, Discounted ₱${payload.discounted_fare}`
      );

      alert('Fare added successfully!');
      setShowAddModal(false);
      setNewFare({ route_from: '', route_to: '', km_distance: '', regular_fare: '', discounted_fare: '' });
      fetchFareMatrix();
    } catch (error) {
      console.error('Error adding fare:', error);
      alert('Error adding fare: ' + error.message);
    }
  };

  const handleUpdateFare = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        route_from: newFare.route_from.trim(),
        route_to: newFare.route_to.trim(),
        km_distance: newFare.km_distance === '' || isNaN(newFare.km_distance) ? null : parseFloat(newFare.km_distance),
        regular_fare: parseFloat(newFare.regular_fare),
        discounted_fare: parseFloat(newFare.discounted_fare)
      };

      const { error } = await supabase
        .from('fare_matrix')
        .update(payload)
        .eq('id', editingFare.id);

      if (error) throw error;

      await AuditService.logFareMatrixUpdated(
        payload.route_from, 
        payload.route_to, 
        `Updated fare: Regular ₱${payload.regular_fare}, Discounted ₱${payload.discounted_fare}`
      );

      alert('Fare updated successfully!');
      setEditingFare(null);
      setNewFare({ route_from: '', route_to: '', km_distance: '', regular_fare: '', discounted_fare: '' });
      fetchFareMatrix();
    } catch (error) {
      console.error('Error updating fare:', error);
      alert('Error updating fare: ' + error.message);
    }
  };

  const handleDeleteFare = async (fareId) => {
    if (!confirm('Are you sure you want to delete this fare entry?')) return;

    try {
      const { error } = await supabase
        .from('fare_matrix')
        .delete()
        .eq('id', fareId);

      if (error) throw error;
      fetchFareMatrix();
    } catch (error) {
      console.error('Error deleting fare:', error);
      alert('Error deleting fare: ' + error.message);
    }
  };

  const openEditFareModal = (fare) => {
    setEditingFare(fare);
    setNewFare({
      route_from: fare.route_from,
      route_to: fare.route_to,
      km_distance: fare.km_distance ?? '',
      regular_fare: fare.regular_fare,
      discounted_fare: fare.discounted_fare
    });
  };

  // Precomputed stats
  const { manoloToAgoraCount, agoraToManoloCount } = useMemo(() => {
    let manolo = 0;
    let agora = 0;
    fareMatrix.forEach(f => {
      const dir = getRouteDirection(f.route_from, f.route_to);
      if (dir === 'manolo-to-agora') manolo++;
      else if (dir === 'agora-to-manolo') agora++;
    });
    return { manoloToAgoraCount: manolo, agoraToManoloCount: agora };
  }, [fareMatrix]);

  const filteredFares = useMemo(() => {
    let fares = fareMatrix;

    // Filter by route direction
    if (selectedRoute === 'manolo-to-agora') {
      fares = fares.filter(fare => getRouteDirection(fare.route_from, fare.route_to) === 'manolo-to-agora');
    } else if (selectedRoute === 'agora-to-manolo') {
      fares = fares.filter(fare => getRouteDirection(fare.route_from, fare.route_to) === 'agora-to-manolo');
    }

    // Filter by search query
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      fares = fares.filter(fare =>
        (fare.route_from || '').toLowerCase().includes(searchLower) ||
        (fare.route_to || '').toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    return [...fares].sort((a, b) => {
      if (sortColumn === 'default') {
        const dirA = getRouteDirection(a.route_from, a.route_to);
        const dirB = getRouteDirection(b.route_from, b.route_to);

        // Group Manolo->Agora first, then Agora->Manolo
        if (dirA !== dirB) {
          return dirA === 'manolo-to-agora' ? -1 : 1;
        }

        const idxFromA = STATION_INDEX_MAP.get((a.route_from || '').toLowerCase().trim()) ?? 999;
        const idxFromB = STATION_INDEX_MAP.get((b.route_from || '').toLowerCase().trim()) ?? 999;
        const idxToA = STATION_INDEX_MAP.get((a.route_to || '').toLowerCase().trim()) ?? 999;
        const idxToB = STATION_INDEX_MAP.get((b.route_to || '').toLowerCase().trim()) ?? 999;

        if (dirA === 'manolo-to-agora') {
          if (idxFromA !== idxFromB) return idxFromA - idxFromB;
          return idxToA - idxToB;
        } else {
          if (idxFromA !== idxFromB) return idxFromB - idxFromA;
          return idxToB - idxToA;
        }
      }

      let comparison = 0;
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (sortColumn === 'km_distance' || sortColumn === 'regular_fare' || sortColumn === 'discounted_fare') {
        const numA = parseFloat(aValue) || 0;
        const numB = parseFloat(bValue) || 0;
        comparison = numA - numB;
      } else {
        comparison = String(aValue || '').localeCompare(String(bValue || ''));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [fareMatrix, selectedRoute, searchTerm, sortColumn, sortDirection]);

  const effectiveItemsPerPage = itemsPerPage === -1 ? filteredFares.length : itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(filteredFares.length / effectiveItemsPerPage));
  const paginatedFares = filteredFares.slice(
    (currentPage - 1) * effectiveItemsPerPage,
    currentPage * effectiveItemsPerPage
  );

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleExportCSV = async () => {
    try {
      const headers = ['Direction', 'Stop From', 'Stop To', 'Distance (KM)', 'Regular Fare (PHP)', 'Discounted Fare (PHP)'];
      const rows = filteredFares.map(f => {
        const dir = getRouteDirection(f.route_from, f.route_to);
        const dirLabel = dir === 'manolo-to-agora' 
          ? 'Manolo Fortich -> Agora Terminal' 
          : dir === 'agora-to-manolo' 
          ? 'Agora Terminal -> Manolo Fortich' 
          : 'Other';
        return [
          dirLabel,
          f.route_from || '',
          f.route_to || '',
          f.km_distance !== null && f.km_distance !== undefined && f.km_distance !== '' ? f.km_distance : '',
          parseFloat(f.regular_fare || 0).toFixed(2),
          parseFloat(f.discounted_fare || 0).toFixed(2)
        ];
      });

      const csvContent = [headers, ...rows]
        .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      const routeSlug = selectedRoute === 'manolo-to-agora' 
        ? 'manolo_to_agora' 
        : selectedRoute === 'agora-to-manolo' 
        ? 'agora_to_manolo' 
        : 'all_routes';
      link.href = url;
      link.download = `fare_matrix_${routeSlug}_${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await AuditService.logDataExported('Fare Matrix', 'CSV');
    } catch (err) {
      console.error('Error exporting fare matrix to CSV:', err);
      alert('Error exporting CSV: ' + err.message);
    }
  };

  const handleExportExcel = async () => {
    try {
      const rows = filteredFares.map(f => {
        const dir = getRouteDirection(f.route_from, f.route_to);
        const dirLabel = dir === 'manolo-to-agora' 
          ? 'Manolo Fortich -> Agora Terminal' 
          : dir === 'agora-to-manolo' 
          ? 'Agora Terminal -> Manolo Fortich' 
          : 'Other';
        return {
          'Direction': dirLabel,
          'Stop From': f.route_from || '',
          'Stop To': f.route_to || '',
          'Distance (KM)': f.km_distance !== null && f.km_distance !== undefined && f.km_distance !== '' ? Number(f.km_distance) : '',
          'Regular Fare (₱)': Number(f.regular_fare || 0),
          'Discounted Fare (₱)': Number(f.discounted_fare || 0)
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Fare Matrix');

      const dateStr = new Date().toISOString().split('T')[0];
      const routeSlug = selectedRoute === 'manolo-to-agora' 
        ? 'manolo_to_agora' 
        : selectedRoute === 'agora-to-manolo' 
        ? 'agora_to_manolo' 
        : 'all_routes';
      XLSX.writeFile(wb, `fare_matrix_${routeSlug}_${dateStr}.xlsx`);

      await AuditService.logDataExported('Fare Matrix', 'Excel');
    } catch (err) {
      console.error('Error exporting fare matrix to Excel:', err);
      alert('Error exporting Excel: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
          <DollarSign className="text-orange-400" />
          Fare Matrix
        </h1>
        <div className="glass-card p-12 text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/60">Fetching live fare matrix from database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
            <DollarSign className="text-orange-400" />
            Fare Matrix
          </h1>
          <p className="text-white/60">
            Official LTFRB point-to-point passenger fare schedule ({fareMatrix.length} total station pairs)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="bg-white/5 hover:bg-white/10 text-white/90 hover:text-white border border-white/15 px-4 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-all shadow-sm"
              title="Export fare matrix"
            >
              <Download size={18} className="text-orange-400" />
              <span>Export</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>

            {showExportMenu && (
              <>
                <div 
                  className="fixed inset-0 z-20" 
                  onClick={() => setShowExportMenu(false)} 
                />
                <div className="absolute right-0 mt-2 w-52 rounded-xl bg-gray-900 border border-white/15 shadow-2xl py-1.5 z-30 animate-fade-in">
                  <div className="px-3 py-1.5 border-b border-white/10 text-xs text-white/50 font-medium">
                    Export {filteredFares.length} pairs ({selectedRoute === 'all' ? 'All Routes' : selectedRoute === 'manolo-to-agora' ? 'Manolo ➔ Agora' : 'Agora ➔ Manolo'})
                  </div>
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      handleExportCSV();
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                  >
                    <FileSpreadsheet size={16} className="text-emerald-400" />
                    <span>Export CSV (.csv)</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      handleExportExcel();
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                  >
                    <FileSpreadsheet size={16} className="text-green-400" />
                    <span>Export Excel (.xlsx)</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors"
            title="Refresh fares"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin text-orange-400' : ''} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-colors shadow-lg shadow-orange-500/20"
          >
            <Plus size={18} />
            Add Fare
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="glass-card p-6 space-y-6">
        {/* Route Direction Tabs */}
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-white/10">
          <button
            type="button"
            onClick={() => setSelectedRoute('all')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 ${
              selectedRoute === 'all'
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25 ring-2 ring-orange-500/40'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
          >
            <ArrowRightLeft size={16} />
            <span>All Routes</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              selectedRoute === 'all' ? 'bg-black/30 text-white' : 'bg-white/10 text-white/60'
            }`}>
              {fareMatrix.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRoute('manolo-to-agora')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 ${
              selectedRoute === 'manolo-to-agora'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 ring-2 ring-blue-500/40'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
          >
            <Route size={16} />
            <span>Manolo Fortich ➔ Agora Terminal</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              selectedRoute === 'manolo-to-agora' ? 'bg-black/30 text-white' : 'bg-white/10 text-white/60'
            }`}>
              {manoloToAgoraCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRoute('agora-to-manolo')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 ${
              selectedRoute === 'agora-to-manolo'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 ring-2 ring-emerald-500/40'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
          >
            <Route size={16} />
            <span>Agora Terminal ➔ Manolo Fortich</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              selectedRoute === 'agora-to-manolo' ? 'bg-black/30 text-white' : 'bg-white/10 text-white/60'
            }`}>
              {agoraToManoloCount}
            </span>
          </button>
        </div>

        {/* Search & Controls Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={18} />
            <input
              type="text"
              placeholder="Search by station name (e.g. Agora, Puerto, Maluko, Tankulan)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-10 py-2.5 text-white placeholder-white/40 focus:outline-none focus:border-orange-500 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white p-1"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <SlidersHorizontal size={14} />
              <span>Rows:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(parseInt(e.target.value, 10))}
                className="bg-gray-800 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>All ({filteredFares.length})</option>
              </select>
            </div>

            <span className="text-white/40 text-sm whitespace-nowrap">
              Showing {filteredFares.length} {filteredFares.length === 1 ? 'fare pair' : 'fare pairs'}
            </span>
          </div>
        </div>

        {/* Route Summary Banner */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-white text-base font-bold flex items-center gap-2">
              <CheckCircle2 size={16} className="text-orange-400" />
              {selectedRoute === 'all' && `All Point-to-Point Fares (${filteredFares.length} pairs)`}
              {selectedRoute === 'manolo-to-agora' && `Manolo Fortich Terminal ➔ Agora Terminal (${filteredFares.length} pairs)`}
              {selectedRoute === 'agora-to-manolo' && `Agora Terminal ➔ Manolo Fortich Terminal (${filteredFares.length} pairs)`}
            </h3>
            <p className="text-white/50 text-xs mt-0.5">
              {selectedRoute === 'all' && 'Combined matrix covering all 19 stations along Bukidnon-CDO route in both directions.'}
              {selectedRoute === 'manolo-to-agora' && 'Southbound route from Maluko Manolo down through Agora Terminal (19 stations, 171 pairs).'}
              {selectedRoute === 'agora-to-manolo' && 'Northbound route from Agora Terminal up to Maluko Manolo (19 stations, 171 pairs).'}
            </p>
          </div>
          {sortColumn !== 'default' && (
            <button
              onClick={() => { setSortColumn('default'); setSortDirection('asc'); }}
              className="text-xs text-orange-400 hover:text-orange-300 underline font-medium"
            >
              Reset to Natural Route Sequence
            </button>
          )}
        </div>

        {/* Fare Table */}
        {paginatedFares.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider">
                    <th className="text-left text-white/60 py-3.5 px-4 font-semibold">Direction</th>
                    <th
                      className="text-left text-white/60 py-3.5 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('route_from')}
                    >
                      <div className="flex items-center gap-2">
                        Stop From
                        {sortColumn === 'route_from' && (
                          <ArrowUpDown size={14} className={`text-orange-400 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th
                      className="text-left text-white/60 py-3.5 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('route_to')}
                    >
                      <div className="flex items-center gap-2">
                        Stop To
                        {sortColumn === 'route_to' && (
                          <ArrowUpDown size={14} className={`text-orange-400 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th
                      className="text-left text-white/60 py-3.5 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('km_distance')}
                    >
                      <div className="flex items-center gap-2">
                        Distance
                        {sortColumn === 'km_distance' && (
                          <ArrowUpDown size={14} className={`text-orange-400 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th
                      className="text-left text-white/60 py-3.5 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('regular_fare')}
                    >
                      <div className="flex items-center gap-2">
                        Regular Fare
                        {sortColumn === 'regular_fare' && (
                          <ArrowUpDown size={14} className={`text-orange-400 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th
                      className="text-left text-white/60 py-3.5 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('discounted_fare')}
                    >
                      <div className="flex items-center gap-2">
                        Student / Senior / PWD
                        {sortColumn === 'discounted_fare' && (
                          <ArrowUpDown size={14} className={`text-orange-400 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th className="text-right text-white/60 py-3.5 px-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedFares.map((fare) => {
                    const direction = getRouteDirection(fare.route_from, fare.route_to);
                    return (
                      <tr key={fare.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            direction === 'manolo-to-agora'
                              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                              : direction === 'agora-to-manolo'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-white/10 text-white/60 border border-white/20'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              direction === 'manolo-to-agora' ? 'bg-blue-400' : 'bg-emerald-400'
                            }`} />
                            {direction === 'manolo-to-agora' ? 'Manolo ➔ Agora' : direction === 'agora-to-manolo' ? 'Agora ➔ Manolo' : 'Other'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-white font-medium">{fare.route_from}</td>
                        <td className="py-3 px-4 text-white font-medium">{fare.route_to}</td>
                        <td className="py-3 px-4 text-white/60 text-sm">
                          {fare.km_distance !== null && fare.km_distance !== undefined && fare.km_distance !== '' 
                            ? `${fare.km_distance} km` 
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-white font-semibold">
                          ₱{parseFloat(fare.regular_fare || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-emerald-400 font-semibold">
                          ₱{parseFloat(fare.discounted_fare || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => openEditFareModal(fare)}
                              className="p-1.5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors"
                              title="Edit fare"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteFare(fare.id)}
                              className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                              title="Delete fare"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-4 pt-4 border-t border-white/10 gap-3">
                <span className="text-white/60 text-xs sm:text-sm">
                  Page {currentPage} of {totalPages} ({filteredFares.length} total pairs)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 transition-colors"
                  >
                    First
                  </button>
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let p;
                    if (totalPages <= 5) p = i + 1;
                    else if (currentPage <= 3) p = i + 1;
                    else if (currentPage >= totalPages - 2) p = totalPages - 4 + i;
                    else p = currentPage - 2 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => handlePageChange(p)}
                        className={`min-w-[32px] px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                          currentPage === p
                            ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                            : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 transition-colors"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
            <DollarSign className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white font-medium">No fare records found</p>
            <p className="text-white/40 text-xs mt-1">
              {searchTerm ? 'Try adjusting your search query' : 'No entries available for this category'}
            </p>
          </div>
        )}
      </div>

      {/* Baggage Fee Section */}
      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-3">
          <DollarSign className="text-orange-400" />
          Baggage Fee Schedule
        </h2>
        <p className="text-white/60 mb-6 text-sm">
          Standard baggage fees applicable per piece across all terminal stops
        </p>
        
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full">
            <thead>
              <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider">
                <th className="text-left text-white/60 py-3 px-4 font-semibold">Tier</th>
                <th className="text-left text-white/60 py-3 px-4 font-semibold">Category</th>
                <th className="text-left text-white/60 py-3 px-4 font-semibold">Max Weight</th>
                <th className="text-left text-white/60 py-3 px-4 font-semibold">Standard Fee</th>
                <th className="text-left text-white/60 py-3 px-4 font-semibold">Guidelines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-3 px-4 text-white/50 text-sm">1</td>
                <td className="py-3 px-4 text-white font-medium">Free Carry-on</td>
                <td className="py-3 px-4 text-white/70 text-sm">Up to 7 kg</td>
                <td className="py-3 px-4 text-emerald-400 font-semibold">₱0.00</td>
                <td className="py-3 px-4 text-white/60 text-xs">Included in regular passenger ticket</td>
              </tr>
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-3 px-4 text-white/50 text-sm">2</td>
                <td className="py-3 px-4 text-white font-medium">Small Cargo</td>
                <td className="py-3 px-4 text-white/70 text-sm">Up to 10 kg</td>
                <td className="py-3 px-4 text-white font-semibold">₱20.00</td>
                <td className="py-3 px-4 text-white/60 text-xs">Fits under passenger seat or overhead rack</td>
              </tr>
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-3 px-4 text-white/50 text-sm">3</td>
                <td className="py-3 px-4 text-white font-medium">Medium Cargo</td>
                <td className="py-3 px-4 text-white/70 text-sm">Up to 20 kg</td>
                <td className="py-3 px-4 text-white font-semibold">₱40.00</td>
                <td className="py-3 px-4 text-white/60 text-xs">Stored in bus luggage undercarriage</td>
              </tr>
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-3 px-4 text-white/50 text-sm">4</td>
                <td className="py-3 px-4 text-white font-medium">Large Cargo</td>
                <td className="py-3 px-4 text-white/70 text-sm">Up to 30 kg</td>
                <td className="py-3 px-4 text-white font-semibold">₱60.00</td>
                <td className="py-3 px-4 text-white/60 text-xs">Heavy bulk items requiring dedicated baggage bay</td>
              </tr>
              <tr className="hover:bg-white/5 transition-colors">
                <td className="py-3 px-4 text-white/50 text-sm">5</td>
                <td className="py-3 px-4 text-white font-medium">Oversized Cargo</td>
                <td className="py-3 px-4 text-white/70 text-sm">&gt; 30 kg</td>
                <td className="py-3 px-4 text-white font-semibold">₱100.00</td>
                <td className="py-3 px-4 text-white/60 text-xs">Commercial or agricultural cargo; subject to conductor inspection</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Datalist for Route Stations */}
      <datalist id="route-stations-list">
        {ROUTE_STATIONS.map((station) => (
          <option key={station} value={station} />
        ))}
      </datalist>

      {/* Add / Edit Fare Modal */}
      {(showAddModal || editingFare) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 rounded-2xl w-full max-w-md border border-white/20 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
              <h2 className="text-white text-xl font-bold flex items-center gap-2">
                <DollarSign className="text-orange-400" size={20} />
                {editingFare ? 'Edit Point-to-Point Fare' : 'Add New Point-to-Point Fare'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingFare(null);
                  setNewFare({ route_from: '', route_to: '', km_distance: '', regular_fare: '', discounted_fare: '' });
                }}
                className="text-white/40 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={editingFare ? handleUpdateFare : handleAddFare} className="space-y-4">
              <div>
                <label className="text-white/70 text-xs font-semibold uppercase mb-1 block">
                  Departure Stop (From)
                </label>
                <input
                  type="text"
                  list="route-stations-list"
                  required
                  placeholder="e.g. Maluko Manolo or Agora"
                  value={newFare.route_from}
                  onChange={(e) => setNewFare({ ...newFare, route_from: e.target.value })}
                  className="w-full bg-gray-900 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-white/70 text-xs font-semibold uppercase mb-1 block">
                  Arrival Stop (To)
                </label>
                <input
                  type="text"
                  list="route-stations-list"
                  required
                  placeholder="e.g. Agora or Maluko Manolo"
                  value={newFare.route_to}
                  onChange={(e) => setNewFare({ ...newFare, route_to: e.target.value })}
                  className="w-full bg-gray-900 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-white/70 text-xs font-semibold uppercase mb-1 block">
                  Distance (KM) — Optional
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Leave empty if not applicable"
                  value={newFare.km_distance}
                  onChange={(e) => setNewFare({ ...newFare, km_distance: e.target.value })}
                  className="w-full bg-gray-900 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/70 text-xs font-semibold uppercase mb-1 block">
                    Regular Fare (₱)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 29.00"
                    value={newFare.regular_fare}
                    onChange={(e) => setNewFare({ ...newFare, regular_fare: e.target.value })}
                    className="w-full bg-gray-900 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-orange-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-xs font-semibold uppercase mb-1 block">
                    Discounted Fare (₱)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 23.00"
                    value={newFare.discounted_fare}
                    onChange={(e) => setNewFare({ ...newFare, discounted_fare: e.target.value })}
                    className="w-full bg-gray-900 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-orange-500 font-semibold text-emerald-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingFare(null);
                    setNewFare({ route_from: '', route_to: '', km_distance: '', regular_fare: '', discounted_fare: '' });
                  }}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-5 py-2 rounded-xl transition-colors shadow-lg shadow-orange-500/20"
                >
                  {editingFare ? 'Update Fare' : 'Save Fare'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FareMatrix;
