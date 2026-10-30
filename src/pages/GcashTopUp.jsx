import { useState, useEffect } from 'react';
import { Smartphone, CreditCard, Calendar, CheckCircle, XCircle, Search, Filter, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

const GcashTopUp = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('gcash_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = transaction.phone_number?.includes(searchTerm) ||
                         transaction.stripe_payment_id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || transaction.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus]);

  const statusColors = {
    completed: 'bg-green-500/20 text-green-400 border-green-500/50',
    failed: 'bg-red-500/20 text-red-400 border-red-500/50',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  };

  const statusIcons = {
    completed: CheckCircle,
    failed: XCircle,
    pending: Calendar,
  };

  const totalTransactions = transactions.length;
  const completedTransactions = transactions.filter(t => t.status === 'completed').length;
  const failedTransactions = transactions.filter(t => t.status === 'failed').length;
  const pendingTransactions = transactions.filter(t => t.status === 'pending').length;
  const totalAmount = transactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + t.amount, 0);
  const successRate = totalTransactions > 0 ? ((completedTransactions / totalTransactions) * 100).toFixed(1) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2">GCash Transactions</h1>
        <p className="text-white/60">Loading transaction history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">GCash Transactions</h1>
          <p className="text-white/60">View history and summary of GCash top-up transactions</p>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-white/60 text-xs">Total Transactions</p>
          </div>
          <p className="text-white text-xl font-bold">{totalTransactions}</p>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-white/60 text-xs">Completed</p>
          </div>
          <p className="text-white text-xl font-bold">{completedTransactions}</p>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-white/60 text-xs">Failed</p>
          </div>
          <p className="text-white text-xl font-bold">{failedTransactions}</p>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-yellow-400" />
            </div>
            <p className="text-white/60 text-xs">Pending</p>
          </div>
          <p className="text-white text-xl font-bold">{pendingTransactions}</p>
        </div>

        <div className="glass-card p-4 border border-purple-500/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-white/60 text-xs">Total Amount</p>
          </div>
          <p className="text-white text-xl font-bold">₱{totalAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* Success Rate Card */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white text-lg font-bold mb-1">Transaction Success Rate</h3>
            <p className="text-white/60 text-sm">Percentage of successfully completed transactions</p>
          </div>
          <div className="text-right">
            <p className="text-white text-3xl font-bold">{successRate}%</p>
            <p className="text-white/60 text-sm">{completedTransactions} of {totalTransactions} successful</p>
          </div>
        </div>
        <div className="mt-4 h-3 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${successRate}%` }}
          />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="glass-card p-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <Smartphone className="text-blue-400" />
          Transaction History
        </h2>
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search by phone number or payment ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-800 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all" className="bg-gray-800 text-white">All Status</option>
            <option value="completed" className="bg-gray-800 text-white">Completed</option>
            <option value="failed" className="bg-gray-800 text-white">Failed</option>
            <option value="pending" className="bg-gray-800 text-white">Pending</option>
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
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.length > 0 ? (
                paginatedTransactions.map((transaction) => {
                  const StatusIcon = statusIcons[transaction.status];
                  return (
                    <tr key={transaction.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-4 text-white/70 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} />
                          {new Date(transaction.created_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="py-4 text-white">
                        <div className="flex items-center gap-2">
                          <Smartphone size={14} />
                          {transaction.phone_number}
                        </div>
                      </td>
                      <td className="py-4 text-white font-medium">₱{transaction.amount.toLocaleString()}</td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs border flex items-center gap-1 w-fit ${statusColors[transaction.status]}`}>
                          <StatusIcon size={12} />
                          {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-4 text-white/60 text-sm font-mono">
                        {transaction.stripe_payment_id}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <CreditCard className="w-16 h-16 text-white/20 mx-auto mb-4" />
                    <p className="text-white/60">No transactions found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
              <p className="text-white/60 text-sm">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} transactions
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
      </div>
    </div>
  );
};

export default GcashTopUp;
