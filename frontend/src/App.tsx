import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthCallbackPage } from './pages/AuthCallbackPage';

// Pages (we'll build these one by one)
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PRDetailPage } from './pages/PRDetailPage';
import { BillingPage } from './pages/BillingPage';
import { BillingSuccessPage } from './pages/BillingSuccessPage';
import { RepoSettingsPage } from './pages/RepoSettingsPage';

export default function App() {
  return (
    /**
     * AuthProvider wraps everything so every page can call useAuth().
     * BrowserRouter enables client-side navigation (React Router v6).
     */
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/billing/success" element={<BillingSuccessPage />} />

          {/* Protected routes — redirect to /login if not authenticated */}
          <Route
            path="/dashboard"
            element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
          />
          <Route
            path="/pr/:repoId/:prNumber"
            element={<ProtectedRoute><PRDetailPage /></ProtectedRoute>}
          />
          <Route
            path="/billing"
            element={<ProtectedRoute><BillingPage /></ProtectedRoute>}
          />
          <Route
            path="/settings/repos"
            element={<ProtectedRoute><RepoSettingsPage /></ProtectedRoute>}
          />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
