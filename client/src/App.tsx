import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Đang tải...</p>
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
    </AuthProvider>
  );
}
