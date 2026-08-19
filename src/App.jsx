import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TripManagement from './pages/TripManagement';
import PassengerAnalytics from './pages/PassengerAnalytics';
import Reports from './pages/Reports';
import ManageUsers from './pages/ManageUsers';
import Settings from './pages/Settings';
import AuditLogs from './pages/AuditLogs';
import FareMatrix from './pages/FareMatrix';
import CardManagement from './pages/CardManagement';

function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setAuthenticated(!!session);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return authenticated ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="trips" element={<TripManagement />} />
          <Route path="buses" element={<Navigate to="/trips" replace />} />
          <Route path="analytics" element={<PassengerAnalytics />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<ManageUsers />} />
          <Route path="settings" element={<Settings />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="fare-matrix" element={<FareMatrix />} />
          <Route path="card-management" element={<CardManagement />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
