import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAccessToken } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/apiClient';

/**
 * AuthCallbackPage — handles the redirect from GitHub OAuth.
 *
 * HOW IT WORKS:
 * After successful GitHub login, your backend redirects to:
 *   http://localhost:5173/auth/callback#token=eyJhbGci...
 *
 * The token is in the URL HASH (the # part). Hashes are NEVER sent to servers —
 * they exist only in the browser. This is why we use the hash approach:
 * the JWT never appears in any server access log or Referer header.
 *
 * This page:
 * 1. Reads the token from window.location.hash
 * 2. Stores it in memory via setAccessToken()
 * 3. Fetches /api/auth/me to get full user profile
 * 4. Stores user in AuthContext
 * 5. Cleans the URL (removes the hash so the token isn't visible in the address bar)
 * 6. Redirects to /dashboard
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    async function handleCallback() {
      const hash = window.location.hash;

      if (!hash || !hash.includes('token=')) {
        // No token in hash — something went wrong with the OAuth flow
        navigate('/login?error=oauth_failed', { replace: true });
        return;
      }

      const token = hash.replace('#token=', '');
      setAccessToken(token);

      // Clean the URL immediately so the token doesn't sit in the address bar
      window.history.replaceState(null, '', '/auth/callback');

      try {
        const data = await apiClient.get<{ user: any }>('/api/auth/me');
        setUser(data.user);
        navigate('/dashboard', { replace: true });
      } catch {
        // ME call failed even with what looks like a valid token
        navigate('/login?error=profile_fetch_failed', { replace: true });
      }
    }

    handleCallback();
  }, [navigate, setUser]);

  return (
    <div className="loading-screen">
      <p>Logging you in...</p>
    </div>
  );
}
