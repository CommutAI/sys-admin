import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Save, Settings as SettingsIcon, Bell, Shield, LogOut } from 'lucide-react';
import AuditService from '../services/auditService';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('notifications');
  const navigate = useNavigate();

  // Log page view on mount
  useEffect(() => {
    AuditService.logPageView('Settings');
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const tabs = [
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
          <SettingsIcon className="text-orange-400" />
          Settings
        </h1>
        <p className="text-white/60">Configure system settings and preferences</p>
      </div>

      <div className="glass-card p-6">
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h2 className="text-white text-xl font-bold mb-4">Notification Settings</h2>
            <div className="space-y-4">
              {[
                { id: 'email-alerts', label: 'Email Alerts', desc: 'Receive critical alerts via email' },
                { id: 'sms-alerts', label: 'SMS Alerts', desc: 'Receive critical alerts via SMS' },
                { id: 'push-notifications', label: 'Push Notifications', desc: 'Receive browser push notifications' },
                { id: 'daily-reports', label: 'Daily Reports', desc: 'Receive daily summary reports' },
              ].map((setting) => (
                <div key={setting.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                  <div>
                    <p className="text-white font-medium">{setting.label}</p>
                    <p className="text-white/60 text-sm">{setting.desc}</p>
                  </div>
                  <input type="checkbox" defaultChecked={setting.id !== 'sms-alerts'} className="w-5 h-5 accent-orange-500" />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            <h2 className="text-white text-xl font-bold mb-4">Security Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="text-white/70 text-sm mb-2 block">Session Timeout (minutes)</label>
                <input
                  type="number"
                  defaultValue={30}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl">
                <input type="checkbox" defaultChecked className="w-5 h-5 accent-orange-500" />
                <label className="text-white">Require Two-Factor Authentication</label>
              </div>
              <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl">
                <input type="checkbox" defaultChecked className="w-5 h-5 accent-orange-500" />
                <label className="text-white">Log All Administrative Actions</label>
              </div>
              <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl">
                <input type="checkbox" defaultChecked className="w-5 h-5 accent-orange-500" />
                <label className="text-white">IP Whitelist Enabled</label>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/10">
              <button
                onClick={handleLogout}
                className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut size={20} />
                Logout
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-colors">
            <Save size={20} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
