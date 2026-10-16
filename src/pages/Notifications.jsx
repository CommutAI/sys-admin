import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, CheckCircle, XCircle, Info, Trash2, Check, Filter, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Notifications = () => {
  const [filterType, setFilterType] = useState('all');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
    
    // Set up real-time subscription
    const subscription = supabase
      .channel('notifications-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

      if (error) throw error;
      fetchNotifications();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const deleteNotification = async (id) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchNotifications();
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('read', false);

      if (error) throw error;
      fetchNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const typeIcons = {
    alert: AlertTriangle,
    success: CheckCircle,
    info: Info,
  };

  const typeColors = {
    alert: 'bg-red-500/20 text-red-400 border-red-500/50',
    success: 'bg-green-500/20 text-green-400 border-green-500/50',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filterType === 'all') return true;
    if (filterType === 'unread') return !notif.read;
    return notif.type === filterType;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    );
  }

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
