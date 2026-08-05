import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  Bus,
  Users,
  Brain,
  FileText,
  UserCog,
  Settings,
  Bell,
  Menu,
  X,
  Activity,
  Shield,
  AlertTriangle,
  HeadphonesIcon,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const location = useLocation();
  const [openDropdown, setOpenDropdown] = useState(null);
  
  const menuGroups = [
    {
      label: 'Overview',
      items: [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/live-map', icon: Map, label: 'Live Map' },
      ]
    },
    {
      label: 'Operations',
      items: [
        { path: '/trips', icon: Bus, label: 'Trip Management' },
        { path: '/buses', icon: Bus, label: 'Bus Management' },
      ]
    },
    {
      label: 'Analytics',
      items: [
        { path: '/analytics', icon: Activity, label: 'Passenger Analytics' },
        { path: '/ai-dashboard', icon: Brain, label: 'AI Dashboard' },
      ]
    },
    {
      label: 'Management',
      items: [
        { path: '/users', icon: UserCog, label: 'Manage Users' },
        { path: '/customer-service', icon: HeadphonesIcon, label: 'Customer Service' },
      ]
    },
    {
      label: 'Monitoring',
      items: [
        { path: '/emergency-alerts', icon: AlertTriangle, label: 'Emergency Alerts' },
        { path: '/fare-irregularities', icon: Shield, label: 'Fare Irregularities' },
      ]
    },
    {
      label: 'System',
      items: [
        { path: '/reports', icon: FileText, label: 'Reports' },
        { path: '/settings', icon: Settings, label: 'Settings' },
        { path: '/audit-logs', icon: Shield, label: 'Audit Logs' },
        { path: '/notifications', icon: Bell, label: 'Notifications' },
      ]
    },
  ];

  const toggleDropdown = (groupLabel) => {
    setOpenDropdown(openDropdown === groupLabel ? null : groupLabel);
  };

  const isItemActive = (path) => location.pathname === path;
  const isGroupActive = (group) => group.items.some(item => isItemActive(item.path));

  return (
    <aside className={`glass-sidebar fixed left-0 top-0 h-full z-50 transition-all duration-300 ${isOpen ? 'w-64' : 'w-20'}`}>
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        {isOpen && (
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <Bus className="w-6 h-6 text-white" />
            </div>
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
        {menuGroups.map((group) => (
          <div key={group.label}>
            <button
              onClick={() => isOpen && toggleDropdown(group.label)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
                isGroupActive(group)
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                {isOpen && <span className="font-medium">{group.label}</span>}
              </div>
              {isOpen && (
                <div className="transition-transform duration-200">
                  {openDropdown === group.label ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </div>
              )}
            </button>
            
            {isOpen && openDropdown === group.label && (
              <div className="ml-4 mt-2 space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = isItemActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 ${
                        isActive
                          ? 'bg-orange-500/30 text-orange-400'
                          : 'text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
};

const Header = () => {
  return (
    <header className="glass-card h-16 flex items-center justify-between px-6 mb-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Bell className="w-6 h-6 text-white/70 cursor-pointer hover:text-orange-400 transition-colors" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-xs text-white flex items-center justify-center">
            3
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-white font-medium">Admin User</p>
          <p className="text-white/60 text-sm">System Administrator</p>
        </div>
        <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">
          A
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
