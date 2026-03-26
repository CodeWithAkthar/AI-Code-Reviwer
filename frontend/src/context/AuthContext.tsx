import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { apiClient, setAccessToken, getAccessToken } from '../api/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  userId: string;
  githubId: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  plan?: 'free' | 'pro' | 'enterprise';
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;       // true while checking session on page load
  isAuthenticated: boolean;
  login: () => void;        // redirect to GitHub OAuth
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  refreshUser: () => Promise<void>; // re-fetch user data (e.g. after plan upgrade)
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * AuthProvider wraps the entire app. On mount, it silently checks if the user
 * has a valid session by calling the refresh endpoint (which sends the httpOnly
 * cookie automatically). If yes → populate state. If no → show login page.
 *
 * WHY WE DO THIS ON EVERY PAGE LOAD:
 * The access token lives only in memory. When the browser tab refreshes, memory
 * is wiped. Without this check, every page refresh would log the user out even
 * if their refresh token cookie is still valid (7 days). The silent refresh
 * restores the session instantly without the user noticing.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Silent session restore on mount ────────────────────────────────────────
  useEffect(() => {
    async function checkSession() {
      const refreshed = await apiClient.tryRefresh();
      if (refreshed) {
        // We have a valid access token — fetch the user's full profile
        try {
          const data = await apiClient.get<{ user: AuthUser }>('/api/auth/me');
          setUser(data.user);
        } catch {
          setUser(null);
        }
      }
      setIsLoading(false);
    }
    checkSession();
  }, []);

  // ── Listen for auth:logout events from apiClient (session truly expired) ──
  useEffect(() => {
    const handleLogout = () => {
      setUser(null);
      setAccessToken(null);
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  // ── GitHub OAuth redirect ──────────────────────────────────────────────────
  // WHY: We don't implement OAuth ourselves. We just send the user to the
  // backend, which handles everything and redirects back with the token in the URL hash.
  const login = useCallback(() => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    window.location.href = `${apiBase}/api/auth/github`;
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  // ── Re-fetch user (e.g. after plan upgrade via Stripe) ─────────────────────
  const refreshUser = useCallback(async () => {
    try {
      const data = await apiClient.get<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
    } catch {
      // silent fail
    }
  }, []);

  const value: AuthContextValue = {
    user,
    accessToken: getAccessToken(),
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    setUser,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook — the only way components access auth state
// ---------------------------------------------------------------------------

/**
 * useAuth — access authentication state anywhere in the component tree.
 * Must be used inside <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
