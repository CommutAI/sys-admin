import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AuditService from '../services/auditService';
import {
  LayoutDashboard,
  Bus,
  FileText,
  UserCog,
  Menu,
  X,
  Activity,
  Shield,
  LogOut,
  User,
  DollarSign,
  CreditCard,
  AlertTriangle
} from 'lucide-react';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: staffData } = await supabase
        .from('staff_users')
        .select('role')
        .eq('id', user.id)
        .single();
      setUserRole(staffData?.role || 'conductor');
    }
  };

  const handleLogout = async () => {
    try {
      // Log logout event to audit logs
      await AuditService.logLogout();

      // Sign out from Supabase
      await supabase.auth.signOut();

      // Navigate to login page
      navigate('/login');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/trips', icon: Bus, label: 'Trip Management' },
    { path: '/analytics', icon: Activity, label: 'Passenger Analytics' },
    { path: '/emergency-alerts', icon: AlertTriangle, label: 'Emergency Alerts' },
    { path: '/card-management', icon: CreditCard, label: 'Card Management' },
    { path: '/users', icon: UserCog, label: 'Manage Users', adminOnly: true },
    { path: '/fare-matrix', icon: DollarSign, label: 'Fare Matrix', adminOnly: true },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/audit-logs', icon: Shield, label: 'Audit Logs', adminOnly: true },
  ];

  const isItemActive = (path) => location.pathname === path;

  return (
    <aside className={`glass-sidebar fixed left-0 top-0 h-full z-50 transition-all duration-300 flex flex-col ${isOpen ? 'w-64' : 'w-20'}`}>
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        {isOpen && (
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="CommutAI Logo"
              className="w-10 h-10"
            />
            <span className="text-white font-bold text-xl">CommutAI</span>
          </div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-white hover:text-orange-400 transition-colors"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <nav className="p-4 space-y-2 overflow-y-auto flex-1">
        {menuItems
          .filter(item => !item.adminOnly || userRole === 'admin')
          .map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={20} />
              {isOpen && <span className="font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 w-full text-red-400 hover:bg-red-500/20 hover:text-red-300`}
        >
          <LogOut size={20} />
          {isOpen && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
};

const Header = () => {
  return (
    <header className="glass-card h-16 flex items-center justify-between px-6 mb-6">
      <div></div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-white font-medium">Admin User</p>
          <p className="text-white/60 text-sm">System Administrator</p>
        </div>
        <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
          <User className="text-white" size={20} />
        </div>
      </div>
    </header>
  );
};

const Layout = () => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="min-h-screen">
      <Sidebar isOpen={isOpen} setIsOpen={setIsOpen} />
      <main className={`transition-all duration-300 ${isOpen ? 'ml-64' : 'ml-20'} p-6`}>
        <Header />
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
