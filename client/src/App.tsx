import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';
import LoginPage from './pages/LoginPage';
import ClassroomPage from './pages/ClassroomPage';
import AdminPage from './pages/AdminPage';
import PublicPage from './pages/PublicPage';

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: string[];
}) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-50/80 backdrop-blur-sm z-50">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-16 w-16 animate-ping rounded-full bg-blue-400 opacity-20"></div>
          <div className="rounded-full bg-white p-3 shadow-sm border border-slate-100 relative z-10">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        </div>
        <p className="mt-6 text-sm font-medium tracking-wide text-slate-500 animate-pulse">
          Đang tải dữ liệu...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    // Redirect based on role
    if (user.role === 'admin') return <Navigate to="/dashboard" replace />;
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function LoginRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <LoginPage />;
  // Admin → /dashboard, others → /
  if (user?.role === 'admin') return <Navigate to="/dashboard" replace />;
  return <Navigate to="/" replace />;
}

function RootRoute() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <PublicPage />;
  if (user?.role === 'admin') return <Navigate to="/dashboard" replace />;
  return <PublicPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRedirect />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute roles={['admin']}>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classroom/:id"
        element={
          <ProtectedRoute roles={['teacher', 'student', 'admin']}>
            <ClassroomPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<RootRoute />} />
      <Route path="*" element={<RootRoute />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}
