import { useState } from 'react';
import { Save, Settings as SettingsIcon, Bus, DollarSign, Sliders, Bell, Shield } from 'lucide-react';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('fare-matrix');

  const fareMatrix = [
    { id: 1, route: 'Route 1', baseFare: 10.00, perKm: 1.50, maxFare: 50.00 },
    { id: 2, route: 'Route 2', baseFare: 12.00, perKm: 1.75, maxFare: 55.00 },
    { id: 3, route: 'Route 3', baseFare: 8.00, perKm: 1.25, maxFare: 45.00 },
    { id: 4, route: 'Route 4', baseFare: 15.00, perKm: 2.00, maxFare: 60.00 },
  ];

  const busCapacity = [
    { id: 1, type: 'Standard Bus', capacity: 45, standing: 15 },
    { id: 2, type: 'Mini Bus', capacity: 25, standing: 8 },
    { id: 3, type: ' articulated Bus', capacity: 60, standing: 20 },
  ];

  const systemConfig = {
    systemName: 'CommutAI System',
    timezone: 'Asia/Manila',
    currency: 'PHP',
    language: 'English',
    maintenanceMode: false,
  };

  const tabs = [
    { id: 'fare-matrix', label: 'Fare Matrix', icon: DollarSign },
    { id: 'bus-capacity', label: 'Bus Capacity', icon: Bus },
    { id: 'system-config', label: 'System Configuration', icon: Sliders },
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

        {activeTab === 'fare-matrix' && (
          <div>
            <h2 className="text-white text-xl font-bold mb-4">Fare Matrix</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-white/60 border-b border-white/10">
                    <th className="pb-3 font-medium">Route</th>
                    <th className="pb-3 font-medium">Base Fare</th>
                    <th className="pb-3 font-medium">Per KM</th>
                    <th className="pb-3 font-medium">Max Fare</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fareMatrix.map((fare) => (
                    <tr key={fare.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-4 text-white">{fare.route}</td>
                      <td className="py-4 text-white/70">${fare.baseFare.toFixed(2)}</td>
                      <td className="py-4 text-white/70">${fare.perKm.toFixed(2)}</td>
                      <td className="py-4 text-white/70">${fare.maxFare.toFixed(2)}</td>
                      <td className="py-4">
                        <button className="text-orange-400 hover:text-orange-300">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'bus-capacity' && (
          <div>
            <h2 className="text-white text-xl font-bold mb-4">Bus Capacity</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-white/60 border-b border-white/10">
                    <th className="pb-3 font-medium">Bus Type</th>
                    <th className="pb-3 font-medium">Seating Capacity</th>
                    <th className="pb-3 font-medium">Standing Capacity</th>
                    <th className="pb-3 font-medium">Total Capacity</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {busCapacity.map((bus) => (
                    <tr key={bus.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-4 text-white">{bus.type}</td>
                      <td className="py-4 text-white/70">{bus.capacity}</td>
                      <td className="py-4 text-white/70">{bus.standing}</td>
                      <td className="py-4 text-white font-bold">{bus.capacity + bus.standing}</td>
                      <td className="py-4">
                        <button className="text-orange-400 hover:text-orange-300">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'system-config' && (
          <div className="space-y-6">
            <h2 className="text-white text-xl font-bold mb-4">System Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-white/70 text-sm mb-2 block">System Name</label>
                <input
                  type="text"
                  defaultValue={systemConfig.systemName}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-white/70 text-sm mb-2 block">Timezone</label>
                <select className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500">
                  <option value="Asia/Manila">Asia/Manila</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
              </div>
              <div>
                <label className="text-white/70 text-sm mb-2 block">Currency</label>
                <select className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500">
                  <option value="PHP">Philippine Peso (PHP)</option>
                  <option value="USD">US Dollar (USD)</option>
                  <option value="EUR">Euro (EUR)</option>
                </select>
              </div>
              <div>
                <label className="text-white/70 text-sm mb-2 block">Language</label>
                <select className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500">
                  <option value="English">English</option>
                  <option value="Filipino">Filipino</option>
                  <option value="Spanish">Spanish</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl">
              <input type="checkbox" id="maintenance" className="w-5 h-5 accent-orange-500" />
              <label htmlFor="maintenance" className="text-white">Enable Maintenance Mode</label>
            </div>
          </div>
        )}

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
