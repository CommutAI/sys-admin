import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AuditService from '../services/auditService';
import {
  LayoutDashboard,
  Bus,
  FileText,
  UserCog,
  Settings,
  Bell,
  Menu,
  X,
  Activity,
  Shield,
  LogOut,
  User,
  Clock,
  Check,
  AlertTriangle,
  DollarSign,
  CreditCard
} from 'lucide-react';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const location = useLocation();
  
  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/trips', icon: Bus, label: 'Trip Management' },
    { path: '/analytics', icon: Activity, label: 'Passenger Analytics' },
    { path: '/users', icon: UserCog, label: 'Manage Users' },
    { path: '/card-management', icon: CreditCard, label: 'Card Management' },
    { path: '/fare-matrix', icon: DollarSign, label: 'Fare Matrix' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/audit-logs', icon: Shield, label: 'Audit Logs' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  const isItemActive = (path) => location.pathname === path;

  return (
    <aside className={`glass-sidebar fixed left-0 top-0 h-full z-50 transition-all duration-300 ${isOpen ? 'w-64' : 'w-20'}`}>
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

      <nav className="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-80px)]">
        {menuItems.map((item) => {
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
    </aside>
  );
};

const Header = () => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const markAsRead = async (id) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
      
      setNotifications(notifications.map(n => 
        n.id === id ? { ...n, read: true } : n
      ));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'alert': return <AlertTriangle className="text-red-400" size={16} />;
      case 'success': return <Check className="text-green-400" size={16} />;
      default: return <Clock className="text-blue-400" size={16} />;
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

  return (
    <header className="glass-card h-16 flex items-center justify-between px-6 mb-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative"
          >
            <Bell className="text-white hover:text-orange-400 cursor-pointer transition-colors" size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-xs text-white flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          
          {showNotifications && (
            <div className="absolute right-0 top-8 w-80 glass-card rounded-xl shadow-2xl z-50">
              <div className="p-4 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-white font-bold">Notifications</h3>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-white/60 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => markAsRead(notification.id)}
                      className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${
                        !notification.read ? 'bg-white/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1">
                          <p className="text-white text-sm">{notification.message}</p>
                          <p className="text-white/40 text-xs mt-1">
                            {new Date(notification.created_at).toLocaleString()}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-orange-500 rounded-full mt-2" />
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <Bell className="text-white/20 mx-auto mb-2" size={32} />
                    <p className="text-white/40 text-sm">No notifications</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-white font-medium">Admin User</p>
          <p className="text-white/60 text-sm">System Administrator</p>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          title="Logout"
        >
          <LogOut className="text-white hover:text-red-400" size={20} />
        </button>
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
