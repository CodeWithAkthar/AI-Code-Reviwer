import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { ThemeToggle } from '../components/ThemeToggle';
import '../styles/login.css';

/**
 * LoginPage — the entry point for unauthenticated users.
 *
 * The only thing on this page is a "Login with GitHub" button.
 * When clicked, it redirects the browser to the backend's OAuth route,
 * which in turn redirects to GitHub. GitHub → backend → /auth/callback → here.
 *
 * WHY NOT PUT AN EMAIL/PASSWORD FORM HERE:
 * You have no password system — GitHub IS your identity provider.
 * The user's identity is verified by GitHub. You trust GitHub's auth.
 */
export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // If already logged in, skip the login page entirely
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) return <div className="loading-screen">Loading...</div>;

  return (
    <div className="login-page">
      <div className="login-top-actions">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-icon">AI</span>
          <h1>AI Code Reviewer</h1>
          <span className="pill">Announcement</span>
        </div>

        <div className="login-copy">
          <h2>AI reviews your PRs like a senior developer</h2>
          <p>Ship cleaner code faster with realtime GitHub-native AI review insights.</p>
        </div>

        <button className="btn-github" onClick={login}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Continue with GitHub
        </button>

        <p className="login-footer">
          Free for 5 PRs/month. No credit card required.
        </p>
      </div>
    </div>
  );
}
