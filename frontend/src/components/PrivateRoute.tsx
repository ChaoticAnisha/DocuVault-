import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import type { Role } from '../types';

interface Props {
  children: React.ReactNode;
  requiredRole?: Role;
}

export default function PrivateRoute({ children, requiredRole }: Props) {
  const { user, isLoading, isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
          <p className="mt-2 text-gray-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!user?.isEmailVerified && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <span>⚠</span>
          <span>
            Your email address hasn't been verified. Check your inbox for a verification link.
          </span>
        </div>
      )}
      {children}
    </>
  );
}
