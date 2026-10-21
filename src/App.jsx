import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import React from 'react';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TripManagement from './pages/TripManagement';
import PassengerAnalytics from './pages/PassengerAnalytics';
import Reports from './pages/Reports';
import ManageUsers from './pages/ManageUsers';
import AuditLogs from './pages/AuditLogs';
import FareMatrix from './pages/FareMatrix';
import CardManagement from './pages/CardManagement';
import EmergencyAlerts from './pages/EmergencyAlerts';

function ProtectedRoute({ children, requireAdmin = false, requireDriver = false }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDriver, setIsDriver] = useState(false);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setAuthenticated(!!session);

    if (session) {
      // Check user role
      const { data: staffData } = await supabase
        .from('staff_users')
        .select('role')
        .eq('id', session.user.id)
        .single();
      
      const role = staffData?.role || null;
      setIsAdmin(role === 'admin');
      setIsDriver(role === 'driver');
      setUserRole(role);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" />;
  }

  if (requireDriver && !isDriver) {
    return <Navigate to="/" />;
  }

  // Pass user role to children
  return <>{React.cloneElement(children, { userRole })}</>;
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
          <Route path="users" element={<ProtectedRoute requireAdmin={true}><ManageUsers /></ProtectedRoute>} />
          <Route path="audit-logs" element={<ProtectedRoute requireAdmin={true}><AuditLogs /></ProtectedRoute>} />
          <Route path="fare-matrix" element={<ProtectedRoute requireAdmin={true}><FareMatrix /></ProtectedRoute>} />
          <Route path="card-management" element={<CardManagement />} />
          <Route path="emergency-alerts" element={<EmergencyAlerts />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
