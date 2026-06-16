import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

// Public pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import VerifyMfa from './pages/VerifyMfa';

// Private pages
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import SetupMfa from './pages/SetupMfa';
import AdminDashboard from './pages/AdminDashboard';

// Route guard
import PrivateRoute from './components/PrivateRoute';

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  const { checkAuth } = useAuthStore();

  // Verify session once at app boot.
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Semi-public — tempToken is passed via router state */}
      <Route path="/verify-mfa" element={<VerifyMfa />} />

      {/* Private — any authenticated role */}
      <Route
        path="/dashboard"
        element={<PrivateRoute><Dashboard /></PrivateRoute>}
      />
      <Route
        path="/profile"
        element={<PrivateRoute><Profile /></PrivateRoute>}
      />
      <Route
        path="/settings/mfa"
        element={<PrivateRoute><SetupMfa /></PrivateRoute>}
      />
      <Route
        path="/documents"
        element={<PrivateRoute><div className="p-8">Documents list (coming soon)</div></PrivateRoute>}
      />
      <Route
        path="/documents/:id"
        element={<PrivateRoute><div className="p-8">Document detail (coming soon)</div></PrivateRoute>}
      />
      <Route
        path="/upgrade"
        element={<PrivateRoute><div className="p-8">Upgrade to Premium (coming soon)</div></PrivateRoute>}
      />

      {/* Private — ADMIN only */}
      <Route
        path="/admin"
        element={<PrivateRoute requiredRole="ADMIN"><AdminDashboard /></PrivateRoute>}
      />
      <Route
        path="/admin/*"
        element={<PrivateRoute requiredRole="ADMIN"><AdminDashboard /></PrivateRoute>}
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
