/**
 * apiClient.ts — Centralized fetch wrapper for all API calls.
 *
 * WHY THIS EXISTS:
 * Without this, every component would need to:
 *   1. Manually read the access token from somewhere
 *   2. Handle 401 errors and retry after refresh
 *   3. Know the base URL of the API
 *
 * By centralizing this, we fix it once. Every screen in the app calls
 * `apiClient.get('/api/reviews')` and gets correct, authenticated results.
 *
 * HOW THE TOKEN REFRESH WORKS:
 * When the server returns 401 (access token expired), we:
 *   1. Call POST /api/auth/refresh (the httpOnly cookie goes automatically)
 *   2. Get a new access token back
 *   3. Retry the original request with the new token
 *   4. If refresh also fails → logout (session is truly dead)
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// In-memory token store — this module is the single source of truth for the access token.
// Components never touch this directly — they go through AuthContext.
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip auth header (used for login / refresh calls) */
  skipAuth?: boolean;
}

async function request<T>(method: ApiMethod, path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers = {}, skipAuth = false } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (!skipAuth && _accessToken) {
    requestHeaders['Authorization'] = `Bearer ${_accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: requestHeaders,
    // credentials: 'include' is REQUIRED for the httpOnly refresh token cookie to be
    // sent automatically on cross-origin requests (Vercel → Render).
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // ── Auto Refresh on 401 ──────────────────────────────────────────────────
  // If the server says the access token is expired, try to silently refresh it.
  // We only do this once (not on the refresh call itself) to avoid infinite loops.
  if (res.status === 401 && !skipAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Retry the original request exactly once with the new token
      return request<T>(method, path, options);
    }
    // Refresh failed → clear token and let the app redirect to login
    _accessToken = null;
    // Dispatch a custom event so AuthContext can react
    window.dispatchEvent(new Event('auth:logout'));
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Request failed: ${res.status}`);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Silent token refresh
// ---------------------------------------------------------------------------

/**
 * Attempts to get a new access token using the httpOnly refresh token cookie.
 * Returns true if successful, false if the session is expired.
 */
async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // sends the refresh token cookie
    });
    if (!res.ok) return false;
    const data = await res.json();
    _accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Convenience methods
// ---------------------------------------------------------------------------

export const apiClient = {
  get: <T>(path: string, options?: ApiOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: ApiOptions) => request<T>('DELETE', path, options),
  tryRefresh,
};
