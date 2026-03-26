import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute — wraps any page that requires authentication.
 *
 * WHY WE NEED THIS:
 * React Router alone has no concept of "is this user logged in".
 * Without this component, a user could type /dashboard directly in the URL
 * and React would render the page — then all the API calls would fail with 401
 * and the UI would be in a broken, half-loaded state.
 *
 * Instead, we redirect them cleanly to /login before any API calls run.
 *
 * isLoading guard: we show nothing while the session check on mount is in progress.
 * Without this, there'd be a flash of the login page even for logged-in users.
 */
interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // Don't redirect yet — we're still checking the session via refresh token
    return <div className="loading-screen">Checking session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
