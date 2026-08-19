import { useState } from 'react';
import { Bell, AlertTriangle, CheckCircle, XCircle, Info, Trash2, Check, Filter } from 'lucide-react';

const Notifications = () => {
  const [filterType, setFilterType] = useState('all');

  const notifications = [
    { id: 1, type: 'emergency', title: 'Emergency Alert', message: 'Bus #452 reported accident on Route 1', time: '2 mins ago', read: false },
    { id: 2, type: 'alert', title: 'Fake QR Detected', message: 'Bus #123 - Multiple fake QR attempts detected', time: '5 mins ago', read: false },
    { id: 3, type: 'warning', title: 'High Passenger Count', message: 'Bus #789 exceeding capacity by 10 passengers', time: '10 mins ago', read: false },
    { id: 4, type: 'info', title: 'System Update', message: 'Scheduled maintenance at 11:00 PM tonight', time: '30 mins ago', read: true },
    { id: 5, type: 'success', title: 'Trip Completed', message: 'Bus #234 completed Route 2 trip successfully', time: '45 mins ago', read: true },
    { id: 6, type: 'alert', title: 'Payment Failed', message: 'Multiple payment failures on Bus #567', time: '1 hour ago', read: true },
    { id: 7, type: 'warning', title: 'Driver Offline', message: 'Driver Juan Dela Cruz went offline unexpectedly', time: '2 hours ago', read: true },
    { id: 8, type: 'info', title: 'New User Registered', message: 'New conductor account created: Maria Santos', time: '3 hours ago', read: true },
  ];

  const typeIcons = {
    emergency: AlertTriangle,
    alert: XCircle,
    warning: AlertTriangle,
    info: Info,
    success: CheckCircle,
  };

  const typeColors = {
    emergency: 'bg-red-500/20 text-red-400 border-red-500/50',
    alert: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    success: 'bg-green-500/20 text-green-400 border-green-500/50',
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filterType === 'all') return true;
    if (filterType === 'unread') return !notif.read;
    return notif.type === filterType;
  });

  const markAsRead = (id) => {
    console.log('Mark as read:', id);
  };

  const deleteNotification = (id) => {
    console.log('Delete:', id);
  };

  const markAllAsRead = () => {
    console.log('Mark all as read');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
            <Bell className="text-orange-400" />
            Notifications
          </h1>
          <p className="text-white/60">Manage system notifications and alerts</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={markAllAsRead}
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
          >
            <Check size={18} />
            Mark All Read
          </button>
          <button className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors">
            <Trash2 size={18} />
            Clear All
          </button>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex gap-2">
            {['all', 'unread', 'emergency', 'alert', 'warning', 'info', 'success'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-4 py-2 rounded-xl capitalize transition-colors ${
                  filterType === type
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredNotifications.map((notif) => {
            const Icon = typeIcons[notif.type];
            return (
              <div
                key={notif.id}
                className={`p-4 rounded-xl border transition-all ${
                  notif.read ? 'bg-white/5 border-white/10 opacity-70' : 'bg-white/10 border-white/20'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${typeColors[notif.type]}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-white font-medium">{notif.title}</h3>
                        <p className="text-white/60 text-sm mt-1">{notif.message}</p>
                      </div>
                      <span className="text-white/40 text-xs whitespace-nowrap ml-4">{notif.time}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!notif.read && (
                      <button
                        onClick={() => markAsRead(notif.id)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="Mark as read"
                      >
                        <Check size={16} className="text-white/70" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(notif.id)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredNotifications.length === 0 && (
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/40">No notifications found</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Emergency</p>
              <p className="text-white text-2xl font-bold">1</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <XCircle className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Alerts</p>
              <p className="text-white text-2xl font-bold">2</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Warnings</p>
              <p className="text-white text-2xl font-bold">2</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <Info className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Unread</p>
              <p className="text-white text-2xl font-bold">3</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
