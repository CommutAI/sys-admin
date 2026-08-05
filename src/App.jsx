import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LiveMap from './pages/LiveMap';
import TripManagement from './pages/TripManagement';
import PassengerAnalytics from './pages/PassengerAnalytics';
import AIDashboard from './pages/AIDashboard';
import Reports from './pages/Reports';
import ManageUsers from './pages/ManageUsers';
import BusManagement from './pages/BusManagement';
import EmergencyAlerts from './pages/EmergencyAlerts';
import FareIrregularities from './pages/FareIrregularities';
import CustomerService from './pages/CustomerService';
import Settings from './pages/Settings';
import AuditLogs from './pages/AuditLogs';
import Notifications from './pages/Notifications';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="live-map" element={<LiveMap />} />
          <Route path="trips" element={<TripManagement />} />
          <Route path="buses" element={<BusManagement />} />
          <Route path="analytics" element={<PassengerAnalytics />} />
          <Route path="ai-dashboard" element={<AIDashboard />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<ManageUsers />} />
          <Route path="emergency-alerts" element={<EmergencyAlerts />} />
          <Route path="fare-irregularities" element={<FareIrregularities />} />
          <Route path="customer-service" element={<CustomerService />} />
          <Route path="settings" element={<Settings />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
